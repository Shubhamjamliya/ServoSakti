const Authorization = require('../models/Authorization');
const ServiceRequest = require('../models/ServiceRequest');
const { Oem, Vendor, findCompany } = require('../models/accounts');
const { ApiError, asyncHandler, paginate, ci } = require('../utils/helpers');
const { notify, audit } = require('../services/realtime');
const { scopeFor } = require('./serviceRequest.controller');

const STATUSES = ['pending', 'approved', 'suspended', 'rejected'];
const SEARCH = ['legalName', 'city', 'gstin', 'phone'];
const tag = (type) => (c) => ({ ...c, type });

/**
 * OEMs and service companies are separate collections (`oems`, `vendors`).
 * Admin sees both (merged, newest first) unless filtered by ?type=oem|vendor.
 */
exports.list = asyncHandler(async (req, res) => {
  const { role, companyId } = req.user;
  if (role === 'oem') {
    // OEMs browse approved service companies to authorize them
    const data = await paginate(Vendor, { status: 'approved' }, req, { search: SEARCH });
    return res.json({ ...data, items: data.items.map(tag('vendor')) });
  }
  if (role === 'vendor_owner') {
    const self = await Vendor.findById(companyId).lean();
    return res.json({ items: [tag('vendor')(self)], total: 1, page: 1, limit: 1 });
  }
  const type = req.query.type;
  if (type === 'oem' || type === 'vendor') {
    const data = await paginate(type === 'oem' ? Oem : Vendor, {}, req, { search: SEARCH, filters: ['status'] });
    return res.json({ ...data, items: data.items.map(tag(type)) });
  }
  // both collections: fetch enough of each, merge by date, then page in memory
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const big = { ...req, query: { ...req.query, page: 1, limit: page * limit } };
  const [o, v] = await Promise.all([
    paginate(Oem, {}, big, { search: SEARCH, filters: ['status'] }),
    paginate(Vendor, {}, big, { search: SEARCH, filters: ['status'] }),
  ]);
  const merged = [...o.items.map(tag('oem')), ...v.items.map(tag('vendor'))].sort((a, b) => b.createdAt - a.createdAt);
  res.json({ items: merged.slice((page - 1) * limit, page * limit), total: o.total + v.total, page, limit });
});

exports.get = asyncHandler(async (req, res) => {
  const found = await findCompany(req.params.id);
  if (!found) throw new ApiError(404, 'Company not found');
  const own = String(found.doc._id) === req.user.companyId;
  if (req.user.role !== 'admin' && !own && !(req.user.role === 'oem' && found.type === 'vendor')) throw new ApiError(403, 'Forbidden');
  res.json({ ...found.doc.toObject(), type: found.type });
});

/** The logged-in OEM / service company edits its own profile. Login phone and password are not changed here. */
exports.updateMine = asyncHandler(async (req, res) => {
  const isVendor = req.user.role === 'vendor_owner';
  const allowed = ['legalName', 'ownerName', 'address', 'city', 'email', 'gstin', 'authorizedBrands', 'kyc', ...(isVendor ? ['serviceAreas', 'isBackup'] : [])];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const co = await (isVendor ? Vendor : Oem).findByIdAndUpdate(req.user.companyId, patch, { new: true, runValidators: true });
  res.json(co);
});

exports.setStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  const found = await findCompany(req.params.id);
  if (!found) throw new ApiError(404, 'Company not found');
  found.doc.status = status;
  found.doc.statusReason = reason;
  await found.doc.save();
  audit(req.user, `company.${status}`, found.type === 'oem' ? 'Oem' : 'Vendor', found.doc._id, { reason });
  notify([found.doc._id], `Company ${status}`, reason || `Your company is now ${status}`, 'approval');
  res.json({ ...found.doc.toObject(), type: found.type });
});

/* ---- OEM -> vendor authorizations ---- */
exports.listAuthorizations = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : req.user.role === 'oem' ? { oemId: req.user.companyId } : { vendorId: req.user.companyId };
  const data = await paginate(Authorization, filter, req, { populate: 'vendorId oemId', filters: ['status'] });
  data.items = data.items.map((a) => ({
    ...a, id: a._id, vendorName: a.vendorId?.legalName, oemName: a.oemId?.legalName, vendorId: a.vendorId?._id, oemId: a.oemId?._id, vendorCity: a.vendorId?.city,
  }));
  res.json(data);
});

exports.createAuthorization = asyncHandler(async (req, res) => {
  const { vendorId, brands = [], cities = [], backup = false } = req.body;
  const oemId = req.user.role === 'admin' ? req.body.oemId : req.user.companyId;
  if (!(await Oem.exists({ _id: oemId, status: 'approved' }))) throw new ApiError(400, 'OEM must be approved');
  if (!(await Vendor.exists({ _id: vendorId, status: 'approved' }))) throw new ApiError(400, 'Vendor must be an approved service company');
  const doc = await Authorization.findOneAndUpdate({ oemId, vendorId }, { brands, cities, backup, status: 'active' }, { upsert: true, new: true, setDefaultsOnInsert: true });
  audit(req.user, 'authorization.set', 'Authorization', doc._id, { oemId, vendorId });
  res.status(201).json(doc);
});

exports.updateAuthorization = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role === 'oem') filter.oemId = req.user.companyId;
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => ['brands', 'cities', 'backup', 'status'].includes(k)));
  const doc = await Authorization.findOneAndUpdate(filter, patch, { new: true });
  if (!doc) throw new ApiError(404, 'Authorization not found');
  res.json(doc);
});

/** Partner companies a vendor may hand a call to: authorized by the same OEM for the same brand, excluding itself. */
exports.partners = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.query.srId, ...scopeFor(req) }).lean();
  if (!sr) throw new ApiError(404, 'Service request not found');
  const auths = await Authorization.find({ oemId: sr.oemId, status: 'active', vendorId: { $ne: req.user.companyId } }).populate('vendorId', 'legalName city status').lean();
  const items = auths
    .filter((a) => a.vendorId?.status === 'approved' && (!sr.brand || a.brands.some((b) => ci(sr.brand).test(b))))
    .map((a) => ({ _id: a.vendorId._id, legalName: a.vendorId.legalName, city: a.vendorId.city, cities: a.cities, backup: a.backup }));
  res.json({ items, total: items.length });
});
