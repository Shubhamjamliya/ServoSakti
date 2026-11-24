const Plan = require('../models/Plan');
const PlanSubscription = require('../models/PlanSubscription');
const Payment = require('../models/Payment');
const Setting = require('../models/Setting');
const { ApiError, ci } = require('../utils/helpers');
const { money, warrantyClaimable } = require('./pricing.service');
const { notify } = require('./realtime');

/**
 * AMC / CMC plans. A plan is bought for one product serial, starts on payment, gives a number of PM visits and breakdown
 * cover after a waiting period. Older, unverified or out-of-warranty products need a working pre-inspection first.
 */

const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

async function availablePlans(passport) {
  if (!passport.subtypeId) return [];
  const plans = await Plan.find({ subtypeId: passport.subtypeId, active: true }).sort({ type: 1, price: 1 }).lean();
  return plans.filter((p) => p.seller === 'platform' || !p.brand || (passport.brand && ci(passport.brand).test(p.brand)));
}

/** Active plan of a type that a new purchase would renew (renewing before expiry skips inspection and waiting period). */
const activeOfType = (passportId, type) => PlanSubscription.findOne({ passportId, type, status: 'active', endDate: { $gte: new Date() } }).sort({ endDate: -1 }).lean();

/** Why a pre-inspection is required, or null. */
async function inspectionReason(passport, type, settings) {
  if (await activeOfType(passport._id, type)) return null;
  const p = settings.pricing || {};
  const fresh = passport.inspectedAt && new Date(passport.inspectedAt) > addDays(new Date(), -(p.inspectionValidDays ?? 30));
  if (fresh) return null;
  if (!passport.verified) return 'The product has not been checked by our engineer yet';
  const ageMonths = passport.purchaseDate ? (Date.now() - new Date(passport.purchaseDate)) / (30.44 * 86400000) : Infinity;
  if (ageMonths >= (p.planInspectionAgeMonths ?? 12)) return 'The product is older than 1 year';
  const inWarranty = passport.warrantyEnd && new Date(passport.warrantyEnd) >= new Date() && warrantyClaimable(passport);
  if (!inWarranty) return 'The product is out of warranty';
  return null;
}

/** Inspection fee already paid in the validity window is adjusted in the plan price (once). */
async function inspectionCredit(passport, settings) {
  const p = settings.pricing || {};
  if (!passport.inspectedAt || !passport.inspectionFee) return 0;
  if (new Date(passport.inspectedAt) < addDays(new Date(), -(p.inspectionValidDays ?? 30))) return 0;
  const used = await PlanSubscription.exists({ passportId: passport._id, inspectionCredit: { $gt: 0 }, createdAt: { $gte: passport.inspectedAt }, status: { $in: ['active', 'expired'] } });
  return used ? 0 : passport.inspectionFee;
}

/** Plans the customer can buy for a product, each with its price and whether an inspection is needed first. */
async function offersFor(passport) {
  const settings = await Setting.get();
  const plans = await availablePlans(passport);
  const credit = await inspectionCredit(passport, settings);
  return Promise.all(plans.map(async (plan) => {
    const reason = await inspectionReason(passport, plan.type, settings);
    const renewing = await activeOfType(passport._id, plan.type);
    return { ...plan, payable: Math.max(0, money(plan.price - credit)), inspectionCredit: credit, inspectionRequired: !!reason, inspectionReason: reason, renewsUntil: renewing?.endDate };
  }));
}

async function subscribe(customer, plan, passport) {
  if (passport.blocked) throw new ApiError(403, 'This product is blocked. Please contact support.');
  if (!plan.active || String(plan.subtypeId) !== String(passport.subtypeId)) throw new ApiError(400, 'This plan does not fit this product');
  const settings = await Setting.get();
  const reason = await inspectionReason(passport, plan.type, settings);
  if (reason) throw new ApiError(409, `${reason}. Book an inspection first; the inspection fee is adjusted in the plan price.`);
  const renewing = await activeOfType(passport._id, plan.type);
  if (renewing && new Date(renewing.endDate) > addDays(new Date(), 30)) throw new ApiError(409, `This product already has an active ${plan.type.toUpperCase()} until ${new Date(renewing.endDate).toLocaleDateString('en-IN')}. Renewal opens 30 days before expiry.`);
  const credit = await inspectionCredit(passport, settings);
  const price = Math.max(0, money(plan.price - credit));
  await PlanSubscription.updateMany({ passportId: passport._id, customerId: customer._id, status: 'pending_payment' }, { status: 'cancelled', cancelReason: 'Replaced by a new checkout' });
  const sub = await PlanSubscription.create({
    planId: plan._id, planSnapshot: plan, type: plan.type, passportId: passport._id, customerId: customer._id,
    serialNumber: passport.serialNumber, brand: passport.brand, model: passport.model, price, inspectionCredit: credit, pmVisitsTotal: plan.pmVisits,
  });
  if (price <= 0) return { subscription: await activate(sub._id) };
  const checkout = await require('./payment.service').createOrder({ customer, purpose: 'plan', amount: price, subscriptionId: sub._id, description: plan.name });
  sub.paymentId = checkout.paymentId;
  await sub.save();
  return { subscription: sub, payment: checkout };
}

/** Payment received: the plan starts now, or when the current plan of the same type ends (renewal). */
async function activate(subscriptionId) {
  const sub = await PlanSubscription.findById(subscriptionId);
  if (!sub || sub.status === 'active') return sub;
  const current = await PlanSubscription.findOne({ _id: { $ne: sub._id }, passportId: sub.passportId, type: sub.type, status: 'active', endDate: { $gte: new Date() } }).sort({ endDate: -1 });
  const start = current ? current.endDate : new Date();
  const plan = sub.planSnapshot || {};
  Object.assign(sub, {
    status: 'active', startDate: start, endDate: addMonths(start, plan.durationMonths || 12),
    breakdownFrom: current ? start : addDays(start, plan.waitingDays || 0),
  });
  await sub.save();
  if (sub.customerId) await notify([sub.customerId], `${sub.type.toUpperCase()} activated`, `${plan.name} for ${sub.brand} ${sub.model || ''} (${sub.serialNumber}) is active until ${sub.endDate.toLocaleDateString('en-IN')}`, 'plan');
  return sub;
}

/**
 * Refund on cancellation: full within the first days if no visit was used; after that pro-rata for the unused time minus
 * the value of PM visits used. `beyondRepair` (product cannot be fixed during the plan) refunds pro-rata only.
 */
function refundFor(sub, settings, { beyondRepair = false } = {}) {
  const p = settings.pricing || {};
  const now = Date.now();
  const start = new Date(sub.startDate).getTime();
  const end = new Date(sub.endDate).getTime();
  if (now < start) return sub.price; // renewal that has not started yet
  if (!beyondRepair && sub.pmVisitsUsed === 0 && now - start <= (p.planFullRefundDays ?? 7) * 86400000) return sub.price;
  const unused = Math.max(0, (end - now) / (end - start));
  const visitValue = beyondRepair || !sub.pmVisitsTotal ? 0 : (sub.price / sub.pmVisitsTotal) * sub.pmVisitsUsed;
  return Math.max(0, Math.round(sub.price * unused - visitValue));
}

async function cancel(sub, actor, { reason, beyondRepair = false } = {}) {
  if (sub.status !== 'active') throw new ApiError(409, `This plan is ${sub.status}`);
  const settings = await Setting.get();
  const amount = refundFor(sub, settings, { beyondRepair });
  Object.assign(sub, { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, refundDue: amount });
  await sub.save();
  // the refund waits for the customer's choice (wallet / original payment) and the admin's approval
  if (amount > 0) await require('./refund.service').forSubscription(sub, amount, reason || 'Plan cancelled');
  else if (sub.customerId) await notify([sub.customerId], `${sub.type.toUpperCase()} cancelled`, 'No refund is due for this plan', 'plan');
  return sub;
}

/** A PM visit done under the plan counts against its visits. */
async function usePmVisit(sr) {
  if (!sr.subscriptionId || sr.jobType !== 'pm' || !['amc', 'cmc'].includes(sr.coverage)) return;
  await PlanSubscription.updateOne({ _id: sr.subscriptionId }, { $inc: { pmVisitsUsed: 1 } });
}

/** Ownership transfer: transferable plans move to the new owner, the rest end with a pro-rata refund to the old owner. */
async function transferPlans(passport, newOwnerId) {
  const subs = await PlanSubscription.find({ passportId: passport._id, status: 'active' });
  for (const sub of subs) {
    if (sub.planSnapshot?.transferable === false) await cancel(sub, null, { reason: 'Product changed owner (plan not transferable)' });
    else { sub.customerId = newOwnerId; await sub.save(); }
  }
}

/** Daily: expire plans, remind before expiry, and remind when a PM visit is due. */
async function dailyPlanJob() {
  const settings = await Setting.get();
  const now = new Date();
  await PlanSubscription.updateMany({ status: 'active', endDate: { $lt: now } }, { status: 'expired' });
  await PlanSubscription.updateMany({ status: 'pending_payment', createdAt: { $lt: addDays(now, -1) } }, { status: 'cancelled', cancelReason: 'Payment not completed' });
  const steps = settings.pricing?.planRenewalReminderDays || [30, 7];
  const active = await PlanSubscription.find({ status: 'active' });
  for (const sub of active) {
    const left = Math.ceil((sub.endDate - now) / 86400000);
    const due = steps.filter((d) => left <= d && !sub.remindersSent.includes(`renew-${d}`));
    if (due.length) {
      sub.remindersSent.push(...due.map((d) => `renew-${d}`));
      await notify([sub.customerId], `Renew your ${sub.type.toUpperCase()}`, `${sub.brand} ${sub.model || ''}: plan ends in ${left} days. Renew before expiry to skip the inspection.`, 'plan');
    }
    // PM visits spread evenly over the plan
    if (sub.pmVisitsTotal > sub.pmVisitsUsed) {
      const every = (sub.endDate - sub.startDate) / sub.pmVisitsTotal;
      const nextDue = new Date(sub.startDate.getTime() + every * sub.pmVisitsUsed);
      const key = `pm-${sub.pmVisitsUsed + 1}`;
      if (nextDue <= addDays(now, 3) && !sub.remindersSent.includes(key)) {
        sub.remindersSent.push(key);
        await notify([sub.customerId], 'PM visit due', `${sub.brand} ${sub.model || ''}: PM visit ${sub.pmVisitsUsed + 1} of ${sub.pmVisitsTotal} is due. Book a slot in the app.`, 'plan');
      }
    }
    if (sub.isModified()) await sub.save();
  }
}

module.exports = { availablePlans, offersFor, inspectionReason, subscribe, activate, refundFor, cancel, usePmVisit, transferPlans, dailyPlanJob };
