const Subtype = require('../models/Subtype');
const PriceCard = require('../models/PriceCard');
const AddOn = require('../models/AddOn');
const Part = require('../models/Part');
const Plan = require('../models/Plan');
const Product = require('../models/Product');
const ProductPassport = require('../models/ProductPassport');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const { audit } = require('../services/realtime');

/**
 * Admin-managed pricing catalogue. One CRUD for every table; each entry says which fields are writable.
 * OEMs manage their own AMC/CMC plans. Everyone signed in can read the active rows (customers need subtypes and
 * add-ons to book, engineers need parts on site).
 */
const SUBTYPE = { path: 'subtypeId', select: 'category name' };
const RESOURCES = {
  subtypes: { Model: Subtype, fields: ['category', 'name', 'sortOrder', 'active'], search: ['category', 'name'], filters: ['category', 'active'], sort: { category: 1, sortOrder: 1, name: 1 } },
  'price-cards': { Model: PriceCard, fields: ['subtypeId', 'jobType', 'brand', 'price', 'visitCharge', 'active'], search: ['brand'], filters: ['subtypeId', 'jobType', 'active'], populate: SUBTYPE },
  'add-ons': { Model: AddOn, fields: ['name', 'description', 'price', 'subtypeIds', 'jobTypes', 'active'], search: ['name'], filters: ['active'] },
  parts: { Model: Part, fields: ['name', 'code', 'unit', 'price', 'coveredBy', 'partWarrantyDays', 'subtypeIds', 'active'], search: ['name', 'code'], filters: ['active'], sort: { name: 1 } },
  plans: {
    Model: Plan, fields: ['name', 'type', 'subtypeId', 'durationMonths', 'price', 'pmVisits', 'waitingDays', 'gasIncluded', 'seller', 'oemId', 'brand', 'transferable', 'active'],
    search: ['name', 'brand'], filters: ['type', 'subtypeId', 'seller', 'active'], populate: SUBTYPE, oemOwned: true,
  },
};

const resource = (req) => {
  const r = RESOURCES[req.params.resource];
  if (!r) throw new ApiError(404, 'Unknown catalogue');
  return r;
};
const pick = (r, body) => Object.fromEntries(Object.entries(body).filter(([k]) => r.fields.includes(k)));
const canWrite = (r, req) => req.user.role === 'admin' || (r.oemOwned && req.user.role === 'oem');
/** Rows the caller may change: OEMs only their own plans. */
const writeScope = (r, req) => (req.user.role === 'oem' ? { oemId: req.user.companyId } : {});
const shape = (row) => (row.subtypeId?.name ? { ...row, subtypeName: row.subtypeId.name, category: row.category || row.subtypeId.category, subtypeId: row.subtypeId._id } : row);

exports.list = asyncHandler(async (req, res) => {
  const r = resource(req);
  let filter = {};
  if (!canWrite(r, req)) filter = { active: true };
  else if (req.user.role === 'oem') filter = { $or: [{ oemId: req.user.companyId }, { seller: 'platform' }] };
  // `subtype` narrows add-ons and parts to the ones that fit a product (empty subtypeIds = fits every subtype)
  if (req.query.subtype) filter.$and = [{ $or: [{ subtypeIds: { $size: 0 } }, { subtypeIds: req.query.subtype }] }];
  const data = await paginate(r.Model, filter, req, { search: r.search, filters: r.filters, populate: r.populate, sort: r.sort });
  data.items = data.items.map(shape);
  res.json(data);
});

exports.create = asyncHandler(async (req, res) => {
  const r = resource(req);
  if (!canWrite(r, req)) throw new ApiError(403, 'Forbidden');
  const body = pick(r, req.body);
  if (req.user.role === 'oem') Object.assign(body, { seller: 'oem', oemId: req.user.companyId });
  const row = await r.Model.create(body);
  audit(req.user, `catalog.${req.params.resource}.create`, r.Model.modelName, row._id);
  res.status(201).json(row);
});

exports.update = asyncHandler(async (req, res) => {
  const r = resource(req);
  if (!canWrite(r, req)) throw new ApiError(403, 'Forbidden');
  const body = pick(r, req.body);
  if (req.user.role === 'oem') { delete body.seller; delete body.oemId; }
  const row = await r.Model.findOneAndUpdate({ _id: req.params.id, ...writeScope(r, req) }, body, { new: true, runValidators: true });
  if (!row) throw new ApiError(404, 'Not found');
  audit(req.user, `catalog.${req.params.resource}.update`, r.Model.modelName, row._id, body);
  res.json(row);
});

exports.remove = asyncHandler(async (req, res) => {
  const r = resource(req);
  if (!canWrite(r, req)) throw new ApiError(403, 'Forbidden');
  if (r.Model === Subtype) {
    const id = req.params.id;
    const used = (await Product.exists({ subtypeId: id })) || (await ProductPassport.exists({ subtypeId: id })) || (await PriceCard.exists({ subtypeId: id })) || (await Plan.exists({ subtypeId: id }));
    if (used) throw new ApiError(409, 'This subtype is in use. Deactivate it instead of deleting.');
  }
  const row = await r.Model.findOneAndDelete({ _id: req.params.id, ...writeScope(r, req) });
  if (!row) throw new ApiError(404, 'Not found');
  audit(req.user, `catalog.${req.params.resource}.delete`, r.Model.modelName, row._id);
  res.json({ ok: true });
});
