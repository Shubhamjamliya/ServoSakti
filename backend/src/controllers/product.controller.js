const Product = require('../models/Product');
const ProductPassport = require('../models/ProductPassport');
const Oem = require('../models/Oem');
const Customer = require('../models/Customer');
const { ApiError, asyncHandler, paginate, warrantyStatus, ci } = require('../utils/helpers');

/* ---- product catalog (OEM-owned) ---- */
exports.listProducts = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'oem' ? { oemId: req.user.companyId } : {};
  res.json(await paginate(Product, filter, req, { search: ['brand', 'model', 'category'], filters: ['brand', 'category'] }));
});

exports.createProduct = asyncHandler(async (req, res) => {
  const oemId = req.user.role === 'admin' ? req.body.oemId : req.user.companyId;
  const { brand, model, category, warrantyMonths } = req.body;
  if (!brand || !model) throw new ApiError(400, 'Brand and model are required');
  res.status(201).json(await Product.create({ oemId, brand, model, category, warrantyMonths }));
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...(req.user.role === 'oem' && { oemId: req.user.companyId }) };
  const doc = await Product.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
  if (!doc) throw new ApiError(404, 'Product not found');
  res.json(doc);
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...(req.user.role === 'oem' && { oemId: req.user.companyId }) };
  if (!(await Product.findOneAndDelete(filter))) throw new ApiError(404, 'Product not found');
  res.json({ ok: true });
});

/* ---- product passports / warranty records ---- */
const withStatus = (p) => ({ ...p, warrantyStatus: warrantyStatus(p.warrantyEnd) });

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
  const data = await paginate(ProductPassport, await passportScope(req), req, { search: ['customerName', 'customerPhone', 'brand', 'model', 'serialNumber', 'warrantyNo'] });
  data.items = data.items.map(withStatus);
  if (req.query.status && req.query.status !== 'all') {
    data.items = data.items.filter((p) => p.warrantyStatus === req.query.status);
  }
  res.json(data);
});

exports.createPassport = asyncHandler(async (req, res) => {
  const b = req.body;
  const doc = { ...b };
  if (req.user.role === 'customer') {
    doc.customerId = req.customer._id;
    doc.customerName = req.customer.name;
    doc.customerPhone = req.customer.phone;
  } else if (b.customerPhone) {
    const c = await Customer.findOne({ phone: b.customerPhone }).lean();
    if (c) doc.customerId = c._id;
  }
  if (!doc.brand || !doc.model || !doc.serialNumber) throw new ApiError(400, 'Brand, model and serial number are required');
  if (!doc.purchaseDate) throw new ApiError(400, 'Purchase date is required');
  doc.warrantyStart = doc.warrantyStart || doc.purchaseDate;
  if (!doc.warrantyEnd && doc.productId) {
    const product = await Product.findById(doc.productId).lean();
    if (product?.warrantyMonths) {
      const end = new Date(doc.warrantyStart);
      end.setMonth(end.getMonth() + product.warrantyMonths);
      doc.warrantyEnd = end;
    }
  }
  res.status(201).json(withStatus((await ProductPassport.create(doc)).toObject()));
});

exports.updatePassport = asyncHandler(async (req, res) => {
  const scope = await passportScope(req);
  const doc = await ProductPassport.findOneAndUpdate({ _id: req.params.id, ...scope }, req.body, { new: true, runValidators: true });
  if (!doc) throw new ApiError(404, 'Passport not found');
  res.json(withStatus(doc.toObject()));
});

exports.passportScope = passportScope;
