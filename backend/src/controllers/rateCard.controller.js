const RateCard = require('../models/RateCard');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const { audit } = require('../services/realtime');

// Each OEM owns its rate cards; there is deliberately no universal rate card.
const scope = (req) => (req.user.role === 'admin' ? {} : { oemId: req.user.companyId });
const FIELDS = ['brand', 'jobType', 'warranty', 'distanceSlabs', 'vendorPayout', 'engineerPayout', 'platformFee', 'active'];
const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => FIELDS.includes(k)));

exports.list = asyncHandler(async (req, res) => {
  const data = await paginate(RateCard, scope(req), req, { search: ['brand'], filters: ['brand', 'jobType', 'warranty', 'oemId'], populate: { path: 'oemId', select: 'legalName' } });
  data.items = data.items.map((r) => ({ ...r, oemName: r.oemId?.legalName, oemId: r.oemId?._id || r.oemId }));
  res.json(data);
});

exports.create = asyncHandler(async (req, res) => {
  const oemId = req.user.role === 'admin' ? req.body.oemId : req.user.companyId;
  if (!oemId) throw new ApiError(400, 'oemId is required');
  const card = await RateCard.create({ ...pick(req.body), oemId });
  audit(req.user, 'ratecard.create', 'RateCard', card._id);
  res.status(201).json(card);
});

exports.update = asyncHandler(async (req, res) => {
  const card = await RateCard.findOneAndUpdate({ _id: req.params.id, ...scope(req) }, pick(req.body), { new: true, runValidators: true });
  if (!card) throw new ApiError(404, 'Rate card not found');
  audit(req.user, 'ratecard.update', 'RateCard', card._id);
  res.json(card);
});

exports.remove = asyncHandler(async (req, res) => {
  if (!(await RateCard.findOneAndDelete({ _id: req.params.id, ...scope(req) }))) throw new ApiError(404, 'Rate card not found');
  res.json({ ok: true });
});
