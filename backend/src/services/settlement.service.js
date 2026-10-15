const RateCard = require('../models/RateCard');
const Payout = require('../models/Payout');
const Incentive = require('../models/Incentive');
const Engineer = require('../models/Engineer');
const Setting = require('../models/Setting');
const { ci, istMonth } = require('../utils/helpers');
const { notify } = require('./realtime');

/**
 * Creates the payout for an approved call. The rate card is copied into `rateSnapshot`
 * so later rate-card edits never rewrite historical settlements.
 */
async function createPayout(sr, report, actorId) {
  const settings = await Setting.get();
  const engineer = sr.engineerId ? await Engineer.findById(sr.engineerId).lean() : null;
  const card = await RateCard.findOne({ oemId: sr.oemId, brand: ci(sr.brand || ''), jobType: sr.jobType, warranty: sr.warranty, active: true }).lean();
  const distanceKm = report?.checkIn?.distanceKm ?? null;

  const payout = {
    serviceRequestId: sr._id, srNumber: sr.srNumber, oemId: sr.oemId, vendorId: sr.vendorId, engineerId: sr.engineerId,
    engineerType: engineer?.engineerType, brand: sr.brand, jobType: sr.jobType, warranty: sr.warranty, distanceKm,
    history: [{ status: 'created', at: new Date(), by: actorId, note: 'Call approved' }],
  };

  if (card) {
    const slab = distanceKm == null ? null : (card.distanceSlabs || []).find((s) => distanceKm >= s.fromKm && distanceKm <= s.toKm);
    const travel = slab?.amount || 0;
    payout.rateCardId = card._id;
    payout.rateSnapshot = { ...card, appliedSlab: slab || null };
    payout.vendorAmount = card.vendorPayout + travel;
    payout.engineerAmount = card.engineerPayout + travel;
    payout.platformFee = card.platformFee;
    payout.tax = Math.round(((payout.vendorAmount * settings.gstPercent) / 100) * 100) / 100;
  } else {
    payout.rateMissing = true;
  }

  // Repeat visits follow a separately configured rule.
  if (sr.repeatOf && settings.repeatCallPayout === 'hold') {
    payout.approval = 'held';
    payout.holdReason = 'Repeat call — held per payment policy';
  }
  return Payout.create(payout);
}

/** Counts an approved call toward the engineer's monthly threshold and flags recharge eligibility. */
async function recordApprovedCall(sr) {
  if (!sr.engineerId) return null;
  const settings = await Setting.get();
  const engineer = await Engineer.findById(sr.engineerId).lean();
  const inc = await Incentive.findOneAndUpdate(
    { engineerId: sr.engineerId, month: istMonth() },
    { $inc: { approvedCalls: 1 }, $setOnInsert: { engineerName: engineer?.name, rechargeDays: settings.rechargeDays } },
    { upsert: true, new: true }
  );
  if (!inc.rechargeEligible && inc.approvedCalls >= settings.minApprovedCallsForRecharge) {
    inc.rechargeEligible = true;
    await inc.save();
    await notify([engineer?._id], 'Recharge unlocked', `You completed ${inc.approvedCalls} approved calls this month`, 'incentive');
  }
  return inc;
}

module.exports = { createPayout, recordApprovedCall };
