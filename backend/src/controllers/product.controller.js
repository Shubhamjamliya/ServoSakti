const Product = require('../models/Product');
const ProductPassport = require('../models/ProductPassport');
const Oem = require('../models/Oem');
const Customer = require('../models/Customer');
const Subtype = require('../models/Subtype');
const { ApiError, asyncHandler, paginate, warrantyStatus, warrantyDaysLeft, ci } = require('../utils/helpers');
const { warrantyClaimable } = require('../services/pricing.service');
const plans = require('../services/plan.service');
const { notify, notifyAdmins, audit } = require('../services/realtime');

/* ---- product catalog (OEM-owned) ---- */
exports.listProducts = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'oem' ? { oemId: req.user.companyId } : {};
  res.json(await paginate(Product, filter, req, { search: ['brand', 'model', 'category'], filters: ['brand', 'category'] }));
});

exports.createProduct = asyncHandler(async (req, res) => {
  const oemId = req.user.role === 'admin' ? req.body.oemId : req.user.companyId;
  const { brand, model, category, warrantyMonths, subtypeId } = req.body;
  if (!brand || !model) throw new ApiError(400, 'Brand and model are required');
  res.status(201).json(await Product.create({ oemId, brand, model, category, warrantyMonths, subtypeId: subtypeId || undefined }));
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...(req.user.role === 'oem' && { oemId: req.user.companyId }) };
  // only catalogue fields; the owner OEM never changes
  const body = Object.fromEntries(['brand', 'model', 'category', 'warrantyMonths', 'subtypeId'].filter((k) => k in req.body).map((k) => [k, req.body[k] === '' ? null : req.body[k]]));
  const doc = await Product.findOneAndUpdate(filter, body, { new: true, runValidators: true });
  if (!doc) throw new ApiError(404, 'Product not found');
  res.json(doc);
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...(req.user.role === 'oem' && { oemId: req.user.companyId }) };
  if (!(await Product.findOneAndDelete(filter))) throw new ApiError(404, 'Product not found');
  res.json({ ok: true });
});

/* ---- product passports / warranty records ---- */
const withStatus = (p) => ({
  ...p, warrantyStatus: warrantyStatus(p.warrantyEnd), warrantyDaysLeft: warrantyDaysLeft(p.warrantyEnd),
  warrantyClaimable: !!p.warrantyEnd && new Date(p.warrantyEnd) >= new Date() && warrantyClaimable(p),
});

/** Customers register with 10 digits; keep passport phones in the same form so the login match works. */
const tenDigits = (v) => String(v || '').replace(/\D/g, '').slice(-10);

async function passportScope(req) {
  if (req.user.role === 'admin') return {};
  if (req.user.role === 'customer') return { $or: [{ customerId: req.customer._id }, { customerPhone: req.customer.phone }] };
  if (req.user.role === 'oem') {
    const co = await Oem.findById(req.user.companyId).lean();
    const ids = (await Product.find({ oemId: req.user.companyId }).select('_id').lean()).map((p) => p._id);
    return { $or: [{ productId: { $in: ids } }, { brand: { $in: (co?.authorizedBrands || []).map(ci) } }] };
  }
  return { _id: null };
}

exports.listPassports = asyncHandler(async (req, res) => {
  const data = await paginate(ProductPassport, await passportScope(req), req, { search: ['customerName', 'customerPhone', 'brand', 'model', 'serialNumber', 'warrantyNo'], filters: ['warrantyVerification'] });
  data.items = data.items.map(withStatus);
  // Attach the OEM name (via the catalog product) so customers see who the product belongs to.
  const productIds = [...new Set(data.items.map((p) => p.productId).filter(Boolean).map(String))];
  if (productIds.length) {
    const products = await Product.find({ _id: { $in: productIds } }).select('oemId').lean();
    const oems = await Oem.find({ _id: { $in: products.map((p) => p.oemId).filter(Boolean) } }).select('legalName').lean();
    const oemName = new Map(oems.map((o) => [String(o._id), o.legalName]));
    const oemOf = new Map(products.map((p) => [String(p._id), oemName.get(String(p.oemId))]));
    data.items = data.items.map((p) => ({ ...p, oemName: p.productId ? oemOf.get(String(p.productId)) : undefined }));
  }
  if (req.query.status && req.query.status !== 'all') {
    data.items = data.items.filter((p) => p.warrantyStatus === req.query.status);
  }
  res.json(data);
});

const PASSPORT_FIELDS = ['productId', 'warrantyNo', 'brand', 'model', 'serialNumber', 'invoiceUrl', 'purchaseDate', 'warrantyStart', 'warrantyEnd', 'images', 'category', 'subtypeId', 'customerName', 'customerPhone'];
const pickFields = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k, v]) => keys.includes(k) && v !== undefined && v !== ''));
const isOwner = (p, customer) => String(p.customerId) === String(customer._id) || p.customerPhone === customer.phone;

/** Sets subtypeName/category from the subtype. */
async function applySubtype(doc) {
  if (!doc.subtypeId) return;
  const subtype = await Subtype.findOne({ _id: doc.subtypeId, active: true }).lean();
  if (!subtype) throw new ApiError(400, 'Choose a valid product type');
  Object.assign(doc, { subtypeName: subtype.name, category: subtype.category });
}

/**
 * Anyone can add a product wherever it was bought. Warranty belongs to the serial number:
 *   - customer-added with an invoice inside the warranty period → warranty "pending" until admin/OEM approves it
 *   - serial already owned by someone else → an ownership transfer request instead of a duplicate record
 */
exports.createPassport = asyncHandler(async (req, res) => {
  const b = req.body;
  const isCustomer = req.user.role === 'customer';
  const doc = pickFields(b, PASSPORT_FIELDS);
  if (isCustomer) {
    Object.assign(doc, { customerId: req.customer._id, customerName: req.customer.name, customerPhone: req.customer.phone });
  } else {
    doc.customerPhone = tenDigits(b.customerPhone);
    if (doc.customerPhone.length !== 10) throw new ApiError(400, 'Enter a valid 10-digit customer phone number');
    const c = await Customer.findOne({ phone: doc.customerPhone }).lean();
    if (c) { doc.customerId = c._id; doc.customerName = doc.customerName || c.name; }
  }
  const product = doc.productId ? await Product.findById(doc.productId).lean() : null;
  if (doc.productId && (!product || (req.user.role === 'oem' && String(product.oemId) !== String(req.user.companyId)))) throw new ApiError(400, 'Choose a product from the catalog');
  if (product) {
    doc.brand = doc.brand || product.brand;
    doc.model = doc.model || product.model;
    doc.category = doc.category || product.category;
    if (product.subtypeId) doc.subtypeId = product.subtypeId; // the model decides the subtype
  }
  await applySubtype(doc);
  doc.serialNumber = String(doc.serialNumber || '').trim();
  if (!doc.brand || !doc.serialNumber) throw new ApiError(400, 'Brand and serial number are required');
  if (!doc.model && !doc.subtypeId) throw new ApiError(400, 'Choose the model, or at least the product type (for example Split AC 1.5 Ton)');
  if (!isCustomer && !doc.purchaseDate) throw new ApiError(400, 'Purchase date is required');
  if (doc.purchaseDate) {
    doc.warrantyStart = doc.warrantyStart || doc.purchaseDate;
    if (!doc.warrantyEnd && product?.warrantyMonths) {
      const end = new Date(doc.warrantyStart);
      end.setMonth(end.getMonth() + product.warrantyMonths);
      doc.warrantyEnd = end;
    }
  }

  // same serial already registered → transfer request (customers) or refuse (OEM/admin)
  const existing = await ProductPassport.findOne({ serialNumber: ci(doc.serialNumber), brand: ci(doc.brand) });
  if (existing) {
    if (isCustomer && isOwner(existing, req.customer)) throw new ApiError(409, 'This product is already in your products');
    if (!isCustomer) throw new ApiError(409, 'This serial number is already registered to another customer');
    if (existing.blocked) throw new ApiError(403, 'This product cannot be added. Please contact support.');
    if (existing.transfer?.status === 'pending') throw new ApiError(409, 'An ownership transfer is already pending for this product');
    existing.transfer = { status: 'pending', requestedBy: req.customer._id, requestedName: req.customer.name, requestedPhone: req.customer.phone, requestedAt: new Date() };
    await existing.save();
    if (existing.customerId) await notify([existing.customerId], 'Ownership transfer request', `${req.customer.name} wants to take over ${existing.brand} ${existing.model || ''} (${existing.serialNumber}). Approve or reject in My Products.`, 'transfer');
    await notifyAdmins('Ownership transfer requested', `${existing.brand} ${existing.serialNumber} → ${req.customer.name}`, 'transfer');
    audit(req.user, 'passport.transfer.request', 'ProductPassport', existing._id);
    return res.status(202).json({
      transferRequested: true, passportId: existing._id,
      message: 'This product is registered to someone else. We have asked the current owner to approve the transfer. If they do not reply in 72 hours, upload a proof of purchase and our team will review it. Until then you can book service as non-warranty.',
    });
  }

  if (isCustomer) {
    const claimsWarranty = doc.warrantyEnd && new Date(doc.warrantyEnd) >= new Date();
    Object.assign(doc, { source: 'self_added', verified: false, warrantyVerification: claimsWarranty && doc.invoiceUrl ? 'pending' : 'none' });
  } else {
    Object.assign(doc, { source: 'oem_registered', verified: !!doc.subtypeId, warrantyVerification: 'approved' });
  }
  const passport = await ProductPassport.create(doc);
  if (passport.warrantyVerification === 'pending') await notifyAdmins('Warranty verification needed', `${passport.brand} ${passport.serialNumber} (${passport.customerName}) — check the invoice`, 'warranty');
  res.status(201).json(withStatus(passport.toObject()));
});

exports.updatePassport = asyncHandler(async (req, res) => {
  const scope = await passportScope(req);
  const doc = await ProductPassport.findOne({ _id: req.params.id, ...scope });
  if (!doc) throw new ApiError(404, 'Passport not found');
  if (req.user.role === 'customer') {
    // customers keep their records tidy but cannot change what the warranty or the price depends on once verified
    const patch = pickFields(req.body, ['images', 'invoiceUrl', 'purchaseDate', 'warrantyNo', ...(doc.verified ? [] : ['subtypeId', 'model'])]);
    if (patch.subtypeId) await applySubtype(patch);
    if ((patch.invoiceUrl || patch.purchaseDate) && doc.warrantyVerification !== 'approved') patch.warrantyVerification = doc.warrantyEnd && (patch.invoiceUrl || doc.invoiceUrl) ? 'pending' : doc.warrantyVerification;
    doc.set(patch);
  } else {
    const patch = pickFields(req.body, PASSPORT_FIELDS.filter((k) => !['customerPhone'].includes(k)));
    if (patch.subtypeId) await applySubtype(patch);
    doc.set(patch);
  }
  await doc.save();
  res.json(withStatus(doc.toObject()));
});

/** Admin / OEM checks the invoice of a customer-added product and approves or rejects its warranty. */
exports.verifyWarranty = asyncHandler(async (req, res) => {
  const { decision, warrantyEnd, note } = req.body;
  if (!['approve', 'reject'].includes(decision)) throw new ApiError(400, 'decision must be approve or reject');
  const doc = await ProductPassport.findOne({ _id: req.params.id, ...(await passportScope(req)) });
  if (!doc) throw new ApiError(404, 'Passport not found');
  doc.warrantyVerification = decision === 'approve' ? 'approved' : 'rejected';
  doc.warrantyNote = note;
  if (decision === 'approve' && warrantyEnd) doc.warrantyEnd = warrantyEnd;
  await doc.save();
  audit(req.user, `passport.warranty.${decision}`, 'ProductPassport', doc._id, { note });
  if (doc.customerId) await notify([doc.customerId], decision === 'approve' ? 'Warranty approved' : 'Warranty not approved', `${doc.brand} ${doc.model || ''} (${doc.serialNumber})${note ? `: ${note}` : ''}`, 'warranty');
  res.json(withStatus(doc.toObject()));
});

/** Admin blocks a product (reported stolen, fraud). Bookings and plans are refused while blocked. */
exports.blockPassport = asyncHandler(async (req, res) => {
  const doc = await ProductPassport.findByIdAndUpdate(req.params.id, { blocked: !!req.body.blocked, blockReason: req.body.reason }, { new: true });
  if (!doc) throw new ApiError(404, 'Passport not found');
  audit(req.user, req.body.blocked ? 'passport.block' : 'passport.unblock', 'ProductPassport', doc._id, { reason: req.body.reason });
  res.json(withStatus(doc.toObject()));
});

/* ---- ownership transfer ---- */
exports.listTransfers = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin'
    ? { 'transfer.status': req.query.status && req.query.status !== 'all' ? req.query.status : 'pending' }
    : { 'transfer.status': { $ne: 'none' }, $or: [{ customerId: req.customer._id }, { 'transfer.requestedBy': req.customer._id }] };
  const items = await ProductPassport.find(filter).sort({ 'transfer.requestedAt': -1 }).limit(200).lean();
  res.json({
    items: items.map((p) => ({
      _id: p._id, brand: p.brand, model: p.model, serialNumber: p.serialNumber, ownerName: p.customerName, ownerPhone: p.customerPhone, transfer: p.transfer,
      role: req.user.role === 'customer' ? (String(p.transfer?.requestedBy) === String(req.customer._id) ? 'requester' : 'owner') : undefined,
      canAdminApprove: !!p.transfer?.proofUrl || (p.transfer?.requestedAt && Date.now() - new Date(p.transfer.requestedAt) > 72 * 3600000),
    })),
    total: items.length,
  });
});

/** Requester uploads proof of purchase so the admin can approve when the old owner does not respond. */
exports.transferProof = asyncHandler(async (req, res) => {
  const doc = await ProductPassport.findOne({ _id: req.params.id, 'transfer.status': 'pending', 'transfer.requestedBy': req.customer._id });
  if (!doc) throw new ApiError(404, 'Transfer request not found');
  if (!req.body.proofUrl) throw new ApiError(400, 'Upload the invoice or sale note');
  doc.transfer.proofUrl = req.body.proofUrl;
  await doc.save();
  await notifyAdmins('Transfer proof uploaded', `${doc.brand} ${doc.serialNumber}: review the proof`, 'transfer');
  res.json({ ok: true });
});

/** The current owner (or the admin, with proof or after 72 hours) decides the transfer. */
exports.decideTransfer = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['approve', 'reject'].includes(decision)) throw new ApiError(400, 'decision must be approve or reject');
  const doc = await ProductPassport.findOne({ _id: req.params.id, 'transfer.status': 'pending' });
  if (!doc) throw new ApiError(404, 'Transfer request not found');
  if (req.user.role === 'customer' && !isOwner(doc, req.customer)) throw new ApiError(403, 'Only the current owner can decide');
  if (req.user.role === 'admin' && decision === 'approve' && !doc.transfer.proofUrl) throw new ApiError(409, 'Approve only after the requester uploads a proof of purchase');
  const requester = await Customer.findById(doc.transfer.requestedBy).lean();
  doc.transfer.decidedBy = req.user.id;
  doc.transfer.decidedRole = req.user.role;
  doc.transfer.decidedAt = new Date();
  doc.transfer.note = note;
  if (decision === 'reject') {
    doc.transfer.status = 'rejected';
    await doc.save();
    if (requester) await notify([requester._id], 'Transfer not approved', `${doc.brand} ${doc.serialNumber}${note ? `: ${note}` : ''}`, 'transfer');
    return res.json({ ok: true, status: 'rejected' });
  }
  if (!requester) throw new ApiError(409, 'The requesting customer no longer exists');
  const previous = doc.ownerHistory.at(-1)?.to || doc.createdAt;
  doc.ownerHistory.push({ customerId: doc.customerId, name: doc.customerName, phone: doc.customerPhone, from: previous, to: new Date() });
  const oldOwner = doc.customerId;
  Object.assign(doc, { customerId: requester._id, customerName: requester.name, customerPhone: requester.phone, source: 'transferred' });
  doc.transfer.status = 'approved';
  // OEM warranty moves with the product only if the brand allows it
  const product = doc.productId ? await Product.findById(doc.productId).lean() : null;
  const oem = product?.oemId ? await Oem.findById(product.oemId).lean() : await Oem.findOne({ authorizedBrands: ci(doc.brand) }).lean();
  if (oem?.warrantyTransferable === false && doc.warrantyEnd && new Date(doc.warrantyEnd) >= new Date()) {
    doc.warrantyVerification = 'rejected';
    doc.warrantyNote = `${oem.legalName} warranty does not transfer to a new owner`;
  }
  await doc.save();
  await plans.transferPlans(doc, requester._id);
  audit(req.user, 'passport.transfer.approve', 'ProductPassport', doc._id, { from: oldOwner, to: requester._id });
  await notify([requester._id], 'Product transferred to you', `${doc.brand} ${doc.model || ''} (${doc.serialNumber}) is now in your products`, 'transfer');
  if (oldOwner && req.user.role !== 'customer') await notify([oldOwner], 'Product transferred', `${doc.brand} ${doc.serialNumber} was moved to its new owner`, 'transfer');
  res.json({ ok: true, status: 'approved' });
});

exports.passportScope = passportScope;
