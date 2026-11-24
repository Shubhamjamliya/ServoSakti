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
/**
 * Payout rate card for a job. The coverage the job ran under picks the card (AMC/CMC fall back to the non-warranty card),
 * and a card for the job's subtype wins over the brand-wide one.
 */
async function findRateCard(sr) {
  const wanted = sr.coverage && sr.coverage !== 'none' ? sr.coverage : sr.warranty;
  const order = ['amc', 'cmc'].includes(wanted) ? [wanted, 'non_warranty'] : [wanted];
  const cards = await RateCard.find({ oemId: sr.oemId, brand: ci(sr.brand || ''), jobType: sr.jobType, warranty: { $in: order }, active: true }).lean();
  for (const w of order) {
    const card = cards.find((c) => c.warranty === w && sr.subtypeId && String(c.subtypeId) === String(sr.subtypeId)) || cards.find((c) => c.warranty === w && !c.subtypeId);
    if (card) return card;
  }
  return null;
}

const { money: round2 } = require('../utils/helpers');

async function createPayout(sr, report, actorId, { failed = false } = {}) {
  const settings = await Setting.get();
  if (failed && settings.failedCallPayout === 'none') return null;
  const engineer = sr.engineerId ? await Engineer.findById(sr.engineerId).lean() : null;
  const card = await findRateCard(sr);
  const distanceKm = report?.checkIn?.distanceKm ?? null;

  const payout = {
    serviceRequestId: sr._id, srNumber: sr.srNumber, oemId: sr.oemId, vendorId: sr.vendorId, engineerId: sr.engineerId,
    engineerType: engineer?.engineerType, brand: sr.brand, jobType: sr.jobType, warranty: sr.warranty, coverage: sr.coverage, distanceKm,
    cashCollected: sr.cashCollected || 0,
    history: [{ status: 'created', at: new Date(), by: actorId, note: failed ? 'Call failed' : 'Call approved' }],
  };

  if (card) {
    const slab = distanceKm == null ? null : (card.distanceSlabs || []).find((s) => distanceKm >= s.fromKm && distanceKm <= s.toKm);
    const travel = slab?.amount || 0;
    payout.rateCardId = card._id;
    payout.rateSnapshot = { ...card, appliedSlab: slab || null };
    // the service company's share exists only when a service company did the job (independent engineers have none)
    payout.vendorAmount = sr.vendorId && engineer?.engineerType !== 'independent' ? card.vendorPayout + travel : 0;
    // independent engineers can have their own rate; company engineers are paid by their company at the standard rate
    const base = engineer?.engineerType === 'independent' && card.independentEngineerPayout != null ? card.independentEngineerPayout : card.engineerPayout;
    // the engineer earns a share of any slot surcharge the customer paid (urgent, same day, Sunday, night)
    const surcharge = (sr.bill?.lines || []).filter((l) => l.kind === 'surcharge').reduce((a, l) => a + l.amount, 0);
    payout.surchargeShare = round2((surcharge * (settings.pricing?.surchargeEngineerShare ?? 0)) / 100);
    payout.engineerAmount = base + travel + payout.surchargeShare;
    payout.platformFee = card.platformFee;
    payout.tax = round2((payout.vendorAmount * settings.gstPercent) / 100);
  } else {
    payout.rateMissing = true;
  }
  payout.netPayable = round2((payout.vendorAmount || 0) + (payout.engineerAmount || 0) - payout.cashCollected);

  if (failed && settings.failedCallPayout === 'hold') {
    payout.approval = 'held';
    payout.holdReason = 'Failed call — held per payment policy';
  }
  // Repeat visits follow a separately configured rule.
  if (!failed && sr.repeatOf && settings.repeatCallPayout === 'hold') {
    payout.approval = 'held';
    payout.holdReason = 'Repeat call — held per payment policy';
  }
  if (sr.flags?.length) {
    payout.approval = 'held';
    payout.holdReason = `Flagged for review: ${sr.flags.join('; ')}`;
  }
  // Warranty jobs are billed to the OEM in the monthly claim: labour cost plus covered parts at list price.
  if (!failed && sr.coverage === 'warranty') {
    const parts = (sr.bill?.lines || []).filter((l) => l.kind === 'part' && l.covered).reduce((a, l) => a + l.listAmount, 0);
    sr.oemClaim = { status: 'pending', amount: round2((payout.vendorAmount || 0) + (payout.engineerAmount || 0) + (payout.platformFee || 0) + parts) };
    await sr.save();
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
  const blocked = engineer?.active === false && settings.inactiveMonthRecharge === 'ineligible'; // inactive-month rule (client to confirm)
  if (!inc.rechargeEligible && !blocked && inc.approvedCalls >= settings.minApprovedCallsForRecharge) {
    inc.rechargeEligible = true;
    await inc.save();
    await notify([engineer?._id], 'Recharge unlocked', `You completed ${inc.approvedCalls} approved calls this month`, 'incentive');
  }
  return inc;
}

module.exports = { createPayout, recordApprovedCall, findRateCard };
