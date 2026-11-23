const Plan = require('../models/Plan');
const PlanSubscription = require('../models/PlanSubscription');
const ProductPassport = require('../models/ProductPassport');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const plans = require('../services/plan.service');
const { audit } = require('../services/realtime');

const ownPassport = async (req, id) => {
  const p = await ProductPassport.findOne({ _id: id, $or: [{ customerId: req.customer._id }, { customerPhone: req.customer.phone }] }).lean();
  if (!p) throw new ApiError(404, 'Product not found');
  return p;
};

/** AMC/CMC plans for one of the customer's products, with the price and whether an inspection is needed first. */
exports.offers = asyncHandler(async (req, res) => {
  const passport = await ownPassport(req, req.query.passportId);
  if (!passport.subtypeId) return res.json({ items: [], message: 'Set the product type (for example Split AC 1.5 Ton) to see plans' });
  res.json({ items: await plans.offersFor(passport) });
});

exports.subscribe = asyncHandler(async (req, res) => {
  const passport = await ownPassport(req, req.body.passportId);
  const plan = await Plan.findById(req.body.planId).lean();
  if (!plan) throw new ApiError(404, 'Plan not found');
  const result = await plans.subscribe(req.customer, plan, passport);
  audit(req.user, 'plan.subscribe', 'PlanSubscription', result.subscription._id, { planId: plan._id });
  res.status(201).json(result);
});

const scope = async (req) => {
  if (req.user.role === 'admin') return {};
  if (req.user.role === 'customer') return { customerId: req.customer._id };
  if (req.user.role === 'oem') return { planId: { $in: (await Plan.find({ oemId: req.user.companyId }).select('_id').lean()).map((p) => p._id) } };
  return { _id: null };
};

exports.subscriptions = asyncHandler(async (req, res) => {
  const filter = await scope(req);
  if (req.query.passportId) filter.passportId = req.query.passportId;
  const data = await paginate(PlanSubscription, filter, req, { search: ['serialNumber', 'brand', 'model'], filters: ['status', 'type'] });
  data.items = data.items.map((s) => ({ ...s, planName: s.planSnapshot?.name, pmVisitsLeft: Math.max(0, (s.pmVisitsTotal || 0) - (s.pmVisitsUsed || 0)) }));
  res.json(data);
});

/** Customer cancels their plan, or admin ends it (beyondRepair = product cannot be fixed, pro-rata refund only). */
exports.cancel = asyncHandler(async (req, res) => {
  const sub = await PlanSubscription.findOne({ _id: req.params.id, ...(await scope(req)) });
  if (!sub) throw new ApiError(404, 'Plan not found');
  const beyondRepair = req.user.role === 'admin' && !!req.body.beyondRepair;
  await plans.cancel(sub, req.user, { reason: req.body.reason || (beyondRepair ? 'Product beyond repair' : 'Cancelled by customer'), beyondRepair });
  audit(req.user, 'plan.cancel', 'PlanSubscription', sub._id, { refund: sub.refundAmount });
  res.json(sub);
});
