const ServiceRequest = require('../models/ServiceRequest');
const ProductPassport = require('../models/ProductPassport');
const FieldReport = require('../models/FieldReport');
const DispatchLog = require('../models/DispatchLog');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const Setting = require('../models/Setting');
const { ApiError } = require('../utils/helpers');
const { billForState, stateOf, resolveCoverage, money } = require('./pricing.service');
const payments = require('./payment.service');
const coupons = require('./coupon.service');
const settlement = require('./settlement.service');
const { notify, notifyAdmins, notifyCompany, audit } = require('./realtime');

/**
 * The money side of a job after booking: confirming a paid booking, revised quotes on site, rejection / no-show,
 * cancellation fees and rescheduling. Rule: any increase needs the customer's approval; any decrease is applied
 * and refunded automatically; after a job is closed the price can only go down.
 */

const OPEN_BEFORE_VISIT = ['pending_payment', 'created', 'verified', 'offered', 'unassigned', 'assigned'];

/** A prepaid (or partly prepaid) booking was paid: release it to verification and dispatch. */
async function confirmBooking(sr) {
  sr.status = 'created';
  await sr.save();
  await notifyCompany(sr.oemId, 'New service request', `${sr.srNumber} · ${sr.brand} ${sr.model || ''} (${sr.city || '—'})`, 'service');
  await notifyAdmins('New service request', `${sr.srNumber} awaiting verification`, 'service');
  if (sr.customerId) await notify([sr.customerId], 'Booking confirmed', `${sr.srNumber}: payment received, we will assign an engineer shortly`, 'service');
  return sr;
}

/** Puts a new on-site state on the job (subtype, job type, parts, coverage) with its bill. */
function applyState(sr, state, bill) {
  Object.assign(sr, {
    subtypeId: state.subtypeId, subtypeName: state.subtypeName, jobType: state.jobType, coverage: state.coverage, subscriptionId: state.subscriptionId || undefined,
    parts: state.parts || [], repair: !!state.repair, damage: !!state.damage,
  });
  sr.warranty = state.coverage === 'warranty' ? 'warranty' : 'non_warranty';
  sr.bill = { ...bill, upfront: sr.bill?.upfront };
  sr.markModified('bill');
}

/** Coverage follows the job type: a PM booked under no cover can become a breakdown that IS under warranty, and the reverse. */
async function coverageFor(sr, jobType) {
  if (jobType === sr.jobType) return { coverage: sr.coverage, subscriptionId: sr.subscriptionId };
  const passport = sr.passportId ? await ProductPassport.findById(sr.passportId).lean() : null;
  const at = sr.priceSnapshot?.at ? new Date(sr.priceSnapshot.at) : sr.createdAt;
  const { coverage, subscription } = await resolveCoverage(passport, jobType, at);
  return { coverage, subscriptionId: subscription?._id || null };
}

/**
 * The engineer reported new facts. The system re-prices: lower → applied and refunded at once; higher → a quote the
 * customer must approve before work continues.
 */
async function proposeChange(sr, next, { reason, changes = [], actor }) {
  if (!sr.bill) throw new ApiError(409, 'This job has no customer price to revise');
  if (sr.quote?.status === 'pending') throw new ApiError(409, 'A revised price is already waiting for the customer');
  const base = stateOf(sr);
  const cover = next.jobType && next.jobType !== sr.jobType ? await coverageFor(sr, next.jobType) : {};
  const state = { ...base, ...cover, ...next };
  const { bill } = await billForState(sr, state);
  await payments.syncBill(sr);
  const oldTotal = sr.bill.total;
  const now = new Date();
  if (bill.total > oldTotal) {
    const { pricing } = await Setting.get();
    sr.quote = { status: 'pending', reason, changes, state, bill, oldTotal, newTotal: bill.total, createdAt: now, expiresAt: new Date(now.getTime() + (pricing.approvalWindowMinutes || 30) * 60000) };
    sr.markModified('quote');
    await sr.save();
    audit(actor, 'sr.quote.create', 'ServiceRequest', sr._id, { oldTotal, newTotal: bill.total, reason });
    if (sr.customerId) await notify([sr.customerId], 'Approve revised price', `${sr.srNumber}: ₹${oldTotal} → ₹${bill.total} (${reason}). Approve or reject in the app.`, 'quote');
    return { applied: false, quote: sr.quote };
  }
  applyState(sr, state, bill);
  sr.quote = { status: 'applied', reason, changes, oldTotal, newTotal: bill.total, createdAt: now };
  sr.markModified('quote');
  await payments.settleExcess(sr, 'Price lower after the on-site check');
  await sr.save();
  audit(actor, 'sr.quote.apply', 'ServiceRequest', sr._id, { oldTotal, newTotal: bill.total, reason });
  if (bill.total < oldTotal && sr.customerId) await notify([sr.customerId], 'Price reduced', `${sr.srNumber}: ₹${oldTotal} → ₹${bill.total} (${reason})`, 'quote');
  return { applied: true };
}

/** Customer approves or rejects the revised price. Rejecting ends the job with only the visit charge. */
async function respondQuote(sr, decision, actor) {
  if (sr.quote?.status !== 'pending') throw new ApiError(409, 'There is no revised price waiting for you');
  if (new Date(sr.quote.expiresAt) < new Date()) throw new ApiError(409, 'This revised price has expired');
  const quote = { ...sr.quote, respondedAt: new Date() };
  if (decision === 'approve') {
    applyState(sr, quote.state, quote.bill);
    sr.quote = { ...quote, status: 'approved' };
    sr.markModified('quote');
    await payments.syncBill(sr);
    await sr.save();
    audit(actor, 'sr.quote.approve', 'ServiceRequest', sr._id, { newTotal: quote.newTotal });
    if (sr.engineerId) await notify([sr.engineerId], 'Customer approved', `${sr.srNumber}: revised price ₹${quote.newTotal} approved, continue the work`, 'quote');
    return sr;
  }
  if (decision !== 'reject') throw new ApiError(400, 'decision must be approve or reject');
  sr.quote = { ...quote, status: 'rejected' };
  sr.markModified('quote');
  audit(actor, 'sr.quote.reject', 'ServiceRequest', sr._id, { newTotal: quote.newTotal });
  return failWithVisitCharge(sr, 'Customer rejected the revised price', actor);
}

/** Quotes nobody answered in time: only the booked work is done at the booked price. */
async function expireQuotes() {
  const list = await ServiceRequest.find({ 'quote.status': 'pending', 'quote.expiresAt': { $lt: new Date() } });
  for (const sr of list) {
    sr.quote = { ...sr.quote, status: 'expired' };
    sr.markModified('quote');
    await sr.save();
    if (sr.engineerId) await notify([sr.engineerId], 'Revised price not approved', `${sr.srNumber}: the customer did not respond. Do only the booked work and offer a follow-up visit.`, 'quote');
  }
  return list.length;
}

/** Ends a job billing only the visit charge (rejected quote, customer not available). */
async function failWithVisitCharge(sr, reason, actor, { chargeVisit = false, noCharge = false } = {}) {
  if (sr.bill) {
    const { bill } = await billForState(sr, stateOf(sr), { visitOnly: true, chargeVisit });
    const zero = { lines: [], subtotal: 0, discount: 0, taxable: 0, gstPercent: bill.gstPercent, gst: 0, total: 0 };
    sr.bill = { ...(noCharge ? zero : bill), upfront: sr.bill.upfront };
    sr.markModified('bill');
  }
  sr.status = 'failed';
  sr.failReason = reason;
  if (sr.bill) await payments.settleExcess(sr, reason);
  await sr.save();
  const report = await FieldReport.findOne({ serviceRequestId: sr._id });
  await settlement.createPayout(sr, report, actor?.id, { failed: true });
  audit(actor, 'sr.fail', 'ServiceRequest', sr._id, { reason });
  if (sr.engineerId) await notify([sr.engineerId], 'Job ended', `${sr.srNumber}: ${reason}${sr.bill?.due ? `. Collect ₹${sr.bill.due}` : ''}`, 'service');
  if (sr.customerId) await notify([sr.customerId], 'Service visit ended', `${sr.srNumber}: ${reason}${sr.bill?.due ? `. Visit charge due: ₹${sr.bill.due}` : ''}`, 'service');
  return sr;
}

/** The urgent slot was missed (engineer arrived late): the surcharge is dropped and refunded. */
async function waiveSurcharge(sr, reason) {
  if (!sr.bill || !sr.priceSnapshot?.surcharge) return sr;
  sr.priceSnapshot = { ...sr.priceSnapshot, surcharge: null, surchargeWaived: reason };
  sr.markModified('priceSnapshot');
  const { bill } = await billForState(sr, stateOf(sr));
  applyState(sr, stateOf(sr), bill);
  await payments.settleExcess(sr, reason);
  await sr.save();
  if (sr.customerId) await notify([sr.customerId], 'Surcharge refunded', `${sr.srNumber}: ${reason}`, 'payment');
  return sr;
}

/**
 * Cancels before the visit. Customers pay a fee only when an engineer is already assigned and the slot is less than
 * the free window away (or the slot was urgent). An engineer running late makes the cancellation free.
 */
async function cancelBooking(sr, user, reason) {
  if (!OPEN_BEFORE_VISIT.includes(sr.status)) throw new ApiError(409, 'Cannot cancel at this stage');
  const { pricing } = await Setting.get();
  const now = Date.now();
  let fee = 0;
  if (user.role === 'customer' && sr.status === 'assigned' && sr.bill) {
    const at = sr.scheduledAt ? new Date(sr.scheduledAt).getTime() : now;
    const late = now > at + (pricing.lateArrivalMinutes || 60) * 60000;
    const inside = sr.slot === 'urgent' || at - now < (pricing.cancellationFreeHours ?? 2) * 3600000;
    if (inside && !late) fee = pricing.cancellationFee || 0;
  }
  sr.status = 'cancelled';
  sr.reviewNote = reason;
  sr.cancellation = { by: user.role, at: new Date(), fee, reason };
  if (sr.bill) {
    const gstPercent = sr.bill.gstPercent || 0;
    const lines = fee > 0 ? [{ code: 'cancellation', kind: 'cancellation', label: 'Late cancellation fee', qty: 1, unitPrice: fee, listAmount: fee, amount: fee, covered: false }] : [];
    const gst = money((fee * gstPercent) / 100);
    sr.bill = { lines, subtotal: fee, discount: 0, taxable: fee, gstPercent, gst, total: Math.round(fee + gst), upfront: sr.bill.upfront };
    sr.markModified('bill');
    await payments.settleExcess(sr, 'Booking cancelled');
  }
  await sr.save();
  await Payment.updateMany({ serviceRequestId: sr._id, status: 'created' }, { status: 'expired' });
  await DispatchLog.updateMany({ serviceRequestId: sr._id, outcome: 'pending' }, { outcome: 'rejected', reason: 'Request cancelled' });
  await coupons.release(sr._id); // cancelled before the visit: the coupon use goes back
  if (fee > 0 && sr.engineerId) {
    const engineerAmount = money((fee * (pricing.cancellationEngineerShare || 0)) / 100);
    await Payout.create({
      serviceRequestId: sr._id, srNumber: sr.srNumber, oemId: sr.oemId, vendorId: sr.vendorId, engineerId: sr.engineerId, brand: sr.brand, jobType: sr.jobType,
      engineerAmount, platformFee: money(fee - engineerAmount), netPayable: engineerAmount, history: [{ status: 'created', at: new Date(), by: user.id, note: 'Late cancellation fee share' }],
    });
  }
  audit(user, 'sr.cancel', 'ServiceRequest', sr._id, { reason, fee });
  if (sr.engineerId) await notify([sr.engineerId], 'Job cancelled', `${sr.srNumber} was cancelled by the ${user.role}`, 'service');
  return sr;
}

/** Customer moves the visit. Price stays as booked. */
async function reschedule(sr, scheduledAt, user) {
  if (!OPEN_BEFORE_VISIT.filter((s) => s !== 'pending_payment').includes(sr.status)) throw new ApiError(409, 'Cannot reschedule at this stage');
  if (sr.slot === 'urgent') throw new ApiError(409, 'Urgent visits cannot be rescheduled; cancel and book again instead');
  const { pricing } = await Setting.get();
  if (sr.reschedules >= (pricing.maxReschedules ?? 2)) throw new ApiError(409, `A visit can be rescheduled at most ${pricing.maxReschedules ?? 2} times`);
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime()) || at <= new Date()) throw new ApiError(400, 'Choose a time in the future');
  if (sr.scheduledAt && new Date(sr.scheduledAt).getTime() - Date.now() < (pricing.cancellationFreeHours ?? 2) * 3600000) {
    throw new ApiError(409, `Visits can be moved only up to ${pricing.cancellationFreeHours ?? 2} hours before the slot`);
  }
  sr.scheduledAt = at;
  sr.reschedules += 1;
  await sr.save();
  audit(user, 'sr.reschedule', 'ServiceRequest', sr._id, { scheduledAt: at });
  if (sr.engineerId) await notify([sr.engineerId], 'Visit rescheduled', `${sr.srNumber} moved to ${at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 'service');
  return sr;
}

/** Prepaid bookings left unpaid are released after the hold window. */
async function expireUnpaidBookings() {
  const { pricing } = await Setting.get();
  const before = new Date(Date.now() - (pricing.paymentHoldMinutes || 15) * 60000);
  const list = await ServiceRequest.find({ status: 'pending_payment', createdAt: { $lt: before } });
  for (const sr of list) {
    sr.status = 'cancelled';
    sr.cancellation = { by: 'system', at: new Date(), fee: 0, reason: 'Payment not completed' };
    await sr.save();
    await Payment.updateMany({ serviceRequestId: sr._id, status: 'created' }, { status: 'expired' });
    await coupons.release(sr._id);
    // nothing is billed for a booking that never started; anything paid from the wallet towards it is owed back
    if (sr.bill) {
      sr.bill = { lines: [], subtotal: 0, discount: 0, taxable: 0, gstPercent: sr.bill.gstPercent, gst: 0, total: 0, upfront: sr.bill.upfront };
      sr.markModified('bill');
      await payments.settleExcess(sr, 'Booking released before payment completed');
    }
    await sr.save();
    if (sr.customerId) await notify([sr.customerId], 'Booking released', `${sr.srNumber}: payment was not completed in time. Please book again.`, 'service');
  }
  return list.length;
}

module.exports = { confirmBooking, proposeChange, respondQuote, expireQuotes, failWithVisitCharge, waiveSurcharge, cancelBooking, reschedule, expireUnpaidBookings, applyState };
