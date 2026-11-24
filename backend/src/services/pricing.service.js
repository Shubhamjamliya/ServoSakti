const Subtype = require('../models/Subtype');
const PriceCard = require('../models/PriceCard');
const AddOn = require('../models/AddOn');
const PlanSubscription = require('../models/PlanSubscription');
const Zone = require('../models/Zone');
const { ApiError, ci, haversineKm } = require('../utils/helpers');
const coupons = require('./coupon.service');
const { couponDiscount } = coupons;

/**
 * Customer pricing. Every amount comes from admin tables (PriceCard, AddOn, Part, Setting.pricing); nobody types a price.
 *
 *   Total = (service or visit + distance + slot surcharge + add-ons + parts − prepaid discount) × (1 + GST)
 *
 * Coverage then sets lines to ₹0:
 *   OEM warranty → breakdown labour/visit + parts marked "warranty"
 *   AMC          → PM and breakdown labour/visit (parts charged)
 *   CMC          → PM and breakdown labour/visit + parts marked "cmc"
 * Surcharges and add-ons are never covered. Distance is covered only when Settings → distanceUnderCoverage is off.
 */

const { money } = require('../utils/helpers');
const JOB_LABEL = { pm: 'Preventive maintenance', breakdown: 'Breakdown repair', installation: 'Installation', uninstallation: 'Uninstallation', inspection: 'Inspection', other: 'Service' };
const COVERAGE_LABEL = { warranty: 'OEM warranty', amc: 'AMC', cmc: 'CMC' };
const SURCHARGE_LABEL = { same_day: 'Same-day slot', urgent: 'Urgent slot', sunday: 'Sunday / holiday slot', night: 'Night slot' };

/** Does this coverage make the labour / visit of this job type free? */
const coversLabour = (coverage, jobType) => {
  if (coverage === 'warranty') return jobType === 'breakdown';
  if (coverage === 'amc' || coverage === 'cmc') return jobType === 'breakdown' || jobType === 'pm';
  return false;
};

/** OEM warranty counts only once approved; records created before verification existed count as approved. */
const warrantyClaimable = (p) => !p.warrantyVerification || p.warrantyVerification === 'approved';

/** Coverage for a job on a product at a date. Priority: OEM warranty → CMC → AMC → none. */
async function resolveCoverage(passport, jobType, at = new Date()) {
  if (!passport) return { coverage: 'none' };
  if (passport.warrantyEnd && new Date(passport.warrantyEnd) >= at && warrantyClaimable(passport) && coversLabour('warranty', jobType)) return { coverage: 'warranty' };
  const subs = await PlanSubscription.find({ passportId: passport._id, status: 'active', startDate: { $lte: at }, endDate: { $gte: at } }).lean();
  for (const type of ['cmc', 'amc']) {
    const sub = subs.find((s) => s.type === type);
    if (!sub || !coversLabour(type, jobType)) continue;
    if (jobType === 'breakdown' && sub.breakdownFrom && new Date(sub.breakdownFrom) > at) continue; // still in the waiting period
    if (jobType === 'pm' && sub.pmVisitsUsed >= sub.pmVisitsTotal) continue; // PM visits used up: extra PM is charged
    return { coverage: type, subscription: sub };
  }
  return { coverage: 'none' };
}

/** A brand-specific card wins over the generic (all-brands) card. */
async function findPriceCard(subtypeId, jobType, brand) {
  const cards = await PriceCard.find({ subtypeId, jobType, active: true }).lean();
  return cards.find((c) => c.brand && brand && ci(brand).test(c.brand)) || cards.find((c) => !c.brand) || null;
}

/* ---- distance: measured from the zone's centre, so the price is known before anyone is assigned ---- */
const centroid = (coords = []) => ({
  lat: coords.reduce((a, c) => a + c.latitude, 0) / (coords.length || 1),
  lng: coords.reduce((a, c) => a + c.longitude, 0) / (coords.length || 1),
});

async function distanceFromHub(zoneId, location) {
  if (!zoneId || location?.lat == null) return null;
  const zone = await Zone.findById(zoneId).lean();
  return zone?.coordinates?.length ? haversineKm(centroid(zone.coordinates), location) : null;
}

function distanceCharge(km, pricing) {
  if (km == null) return { km: null, amount: 0 };
  const slabs = [...(pricing.distanceSlabs || [])].sort((a, b) => a.fromKm - b.fromKm);
  const slab = slabs.find((s) => km >= s.fromKm && km <= s.toKm);
  if (slab) return { km, amount: slab.amount || 0 };
  const last = slabs.at(-1);
  if (!last || km < slabs[0].fromKm) return { km, amount: 0 };
  if (pricing.outstationPerKm > 0) return { km, amount: Math.round(km * pricing.outstationPerKm), outstation: true };
  throw new ApiError(422, `This address is ${km} km from our service hub, beyond the serviceable distance`);
}

/* ---- slot surcharge: when two apply (urgent on a Sunday) only the highest is charged ---- */
const ist = (d) => {
  const t = new Date(new Date(d).getTime() + 330 * 60000);
  return { date: t.toISOString().slice(0, 10), day: t.getUTCDay(), hour: t.getUTCHours() };
};

/** Scheduled bookings for today are same-day; scheduled defaults to tomorrow 10:00 IST. */
function normalizeSlot(slot = 'scheduled', scheduledAt, now = new Date()) {
  if (slot === 'urgent') return { slot, scheduledAt: now };
  let at = scheduledAt ? new Date(scheduledAt) : null;
  if (at && Number.isNaN(at.getTime())) throw new ApiError(400, 'Invalid schedule date');
  if (at && at < new Date(now.getTime() - 5 * 60000)) throw new ApiError(400, 'Choose a time in the future');
  if (slot === 'same_day') return { slot, scheduledAt: at || now };
  if (!at) {
    const tomorrow = ist(new Date(now.getTime() + 86400000)).date;
    at = new Date(`${tomorrow}T10:00:00+05:30`);
  }
  return { slot: ist(at).date === ist(now).date ? 'same_day' : 'scheduled', scheduledAt: at };
}

function surchargeFor(slot, scheduledAt, pricing) {
  const rates = pricing.slotSurcharges || {};
  const t = ist(scheduledAt);
  const options = [];
  if (slot === 'urgent' || slot === 'same_day') options.push(slot);
  if (t.day === 0 || (pricing.holidays || []).includes(t.date)) options.push('sunday');
  if (t.hour >= (pricing.nightFromHour ?? 20)) options.push('night');
  const best = options.map((kind) => ({ kind, amount: Number(rates[kind]) || 0 })).sort((a, b) => b.amount - a.amount)[0];
  return best && best.amount > 0 ? best : null;
}

/**
 * Builds the bill from already-resolved inputs. Pure: no database access.
 *   card       { price, visitCharge }        visitOnly  bill only the visit (rejection, no-show)
 *   parts      [{ name, qty, price, coveredBy, partWarranty }]
 */
function buildBill({ jobType, coverage = 'none', subscription, card, addOns = [], parts = [], distance, surcharge, paymentMode, repair, damage, repeat, visitOnly, chargeVisit, gstPercent, pricing, coupon }) {
  const cov = damage ? 'none' : coverage;
  const labourFree = coversLabour(cov, jobType);
  const freeNote = labourFree ? COVERAGE_LABEL[cov] : repeat ? 'Repeat visit' : undefined;
  const lines = [];
  const add = ({ qty = 1, unitPrice, covered, ...rest }) => {
    const listAmount = money(unitPrice * qty);
    lines.push({ ...rest, qty, unitPrice: money(unitPrice), listAmount, covered: !!covered, amount: covered ? 0 : listAmount });
  };

  if (visitOnly) {
    add({ code: 'visit', kind: 'visit', label: 'Visit / inspection charge', unitPrice: card.visitCharge, covered: !chargeVisit && (labourFree || repeat), note: chargeVisit ? undefined : freeNote });
  } else {
    if (jobType === 'breakdown' && !repair) {
      add({ code: 'visit', kind: 'visit', label: 'Visit / inspection charge', unitPrice: card.visitCharge, covered: labourFree || repeat, note: freeNote });
    } else {
      const label = jobType === 'breakdown' ? 'Repair labour (visit charge adjusted)' : JOB_LABEL[jobType] || 'Service';
      add({ code: 'service', kind: 'service', label, unitPrice: card.price, covered: labourFree || repeat, note: freeNote });
    }
    if (distance?.amount > 0) {
      const covered = cov !== 'none' && pricing.distanceUnderCoverage === false;
      add({ code: 'distance', kind: 'distance', label: `Distance charge (${distance.km} km)`, unitPrice: distance.amount, covered, note: covered ? COVERAGE_LABEL[cov] : undefined });
    }
    if (surcharge?.amount > 0) add({ code: `surcharge_${surcharge.kind}`, kind: 'surcharge', label: SURCHARGE_LABEL[surcharge.kind], unitPrice: surcharge.amount });
    addOns.forEach((a) => add({ code: `addon_${a._id}`, kind: 'addon', label: a.name, unitPrice: a.price }));
    const gasFree = cov !== 'none' && subscription?.planSnapshot?.gasIncluded;
    parts.forEach((p) => {
      const byCoverage = cov !== 'none' && (p.coveredBy || []).includes(cov) && coversLabour(cov, jobType);
      const byGas = gasFree && String(p.code || '').toUpperCase() === 'GAS';
      const covered = byCoverage || byGas || p.partWarranty;
      add({
        code: `part_${p.partId}`, kind: 'part', label: p.name, qty: p.qty || 1, unitPrice: p.price, covered,
        note: p.partWarranty ? 'Part warranty' : covered ? COVERAGE_LABEL[cov] : undefined,
      });
    });
  }

  const sum = (kinds) => lines.filter((l) => !kinds || kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
  const subtotal = money(sum());
  // discounts only touch service, visit and add-on charges: prepaid first, then the coupon on what is left
  const eligible = money(sum(['service', 'visit', 'addon']));
  const prepaidDiscount = paymentMode === 'prepaid' ? money((eligible * (pricing.prepaidDiscountPercent || 0)) / 100) : 0;
  const couponOff = couponDiscount(coupon, eligible, money(eligible - prepaidDiscount));
  const discount = money(prepaidDiscount + couponOff);
  const taxable = money(subtotal - discount);
  const gst = money((taxable * (gstPercent || 0)) / 100);
  return {
    lines, subtotal, prepaidDiscount, couponDiscount: couponOff, couponCode: coupon?.code, couponNote: coupon && !couponOff && eligible > 0 ? `${coupon.code} needs ₹${coupon.minOrder} of service charges` : undefined,
    discount, taxable, gstPercent, gst, total: Math.round(taxable + gst),
  };
}

/** Writes what has been paid against a bill: due = still to collect, excess = to refund. */
function withPayments(bill, paid = 0, refunded = 0) {
  const net = money(paid - refunded);
  return { ...bill, paid: money(paid), refunded: money(refunded), due: Math.max(0, money(bill.total - net)), excess: Math.max(0, money(net - bill.total)) };
}

/** Amount (with GST) of the given line kinds. */
const amountWithGst = (bill, kinds) => {
  const base = bill.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
  return Math.round(base * (1 + (bill.gstPercent || 0) / 100));
};

/**
 * What must be paid before the booking is confirmed.
 *   prepaid  → the whole estimate
 *   postpaid → slot surcharge, plus the visit charge for breakdowns, unverified products and first bookings
 */
function upfrontFor(bill, { paymentMode, jobType, mustPrepayVisit, card }) {
  if (paymentMode === 'prepaid') return bill.total;
  let base = bill.lines.filter((l) => l.kind === 'surcharge').reduce((a, l) => a + l.amount, 0);
  if (jobType === 'breakdown' || mustPrepayVisit) {
    const labour = bill.lines.find((l) => l.kind === 'visit' || l.kind === 'service');
    if (labour && labour.amount > 0) base += Math.min(labour.amount, card.visitCharge);
  }
  return Math.min(bill.total, Math.round(base * (1 + (bill.gstPercent || 0) / 100)));
}

/**
 * Everything needed to book: coverage, the estimate and the upfront amount. Throws with a clear message when something is not priced.
 */
async function quoteBooking({ passport, subtypeId, brand, jobType, slot, scheduledAt, addOnIds = [], location, zoneId, paymentMode = 'postpaid', repeat = false, firstBooking = false, settings, now = new Date(), couponCode, customerId, strictCoupon = false }) {
  const pricing = settings.pricing || {};
  const subtype = subtypeId ? await Subtype.findById(subtypeId).lean() : null;
  if (!subtype) throw new ApiError(400, 'Choose the product type (for example Split AC 1.5 Ton) first');
  const card = await findPriceCard(subtype._id, jobType, brand);
  if (!card) throw new ApiError(422, `No price is set yet for ${subtype.name} · ${JOB_LABEL[jobType] || jobType}. Please contact support.`);

  const when = normalizeSlot(slot, scheduledAt, now);
  // coverage is decided on the booking date; a visit far in the future is checked on its own date
  const graceMs = (pricing.coverageGraceDays ?? 7) * 86400000;
  const coverageAt = when.scheduledAt - now > graceMs ? when.scheduledAt : now;
  const { coverage, subscription } = await resolveCoverage(passport, jobType, coverageAt);

  const ids = [...new Set((addOnIds || []).map(String))];
  const addOns = ids.length ? await AddOn.find({ _id: { $in: ids }, active: true }).lean() : [];
  if (addOns.length !== ids.length) throw new ApiError(400, 'One of the add-ons is no longer available');
  const misfit = addOns.find((a) => (a.subtypeIds?.length && !a.subtypeIds.some((s) => String(s) === String(subtype._id))) || (a.jobTypes?.length && !a.jobTypes.includes(jobType)));
  if (misfit) throw new ApiError(400, `${misfit.name} is not available for this service`);

  const distance = distanceCharge(await distanceFromHub(zoneId, location), pricing);
  const surcharge = surchargeFor(when.slot, when.scheduledAt, pricing);
  // coupon: an invalid code fails the booking, but on the estimate it only shows a message
  let coupon = null;
  let couponError;
  if (couponCode) {
    try { coupon = await coupons.validate(couponCode, { customerId, jobType, subtypeId: subtype._id, firstBooking, at: now }); } catch (e) { if (strictCoupon) throw e; couponError = e.message; }
  }
  const couponSnap = coupon ? coupons.snapshotOf(coupon) : undefined;
  const bill = buildBill({ jobType, coverage, subscription, card, addOns, distance, surcharge, paymentMode, repeat, gstPercent: settings.gstPercent, pricing, coupon: couponSnap });
  const mustPrepayVisit = !passport?.verified || firstBooking;
  bill.upfront = upfrontFor(bill, { paymentMode, jobType, mustPrepayVisit, card });

  return {
    subtype, card, coverage, subscription, addOns, distance, surcharge, slot: when.slot, scheduledAt: when.scheduledAt, bill, coupon, couponError,
    snapshot: {
      subtypeId: subtype._id, subtypeName: subtype.name, jobType, card: { _id: card._id, price: card.price, visitCharge: card.visitCharge, brand: card.brand },
      addOns: addOns.map((a) => ({ _id: a._id, name: a.name, price: a.price })), distance, surcharge, gstPercent: settings.gstPercent,
      pricing: { distanceUnderCoverage: pricing.distanceUnderCoverage, prepaidDiscountPercent: pricing.prepaidDiscountPercent, surchargeEngineerShare: pricing.surchargeEngineerShare },
      repeat, coverage, subscriptionId: subscription?._id, at: now, coupon: couponSnap,
    },
  };
}

/**
 * Re-prices a booked job with a new on-site state (subtype, job type, parts, repair, damage).
 * The booking-time snapshot is reused for distance, surcharge, add-ons and, when the subtype/job are unchanged, the card itself.
 */
async function billForState(sr, state, { visitOnly = false, chargeVisit = false } = {}) {
  const snap = sr.priceSnapshot || {};
  const sameCard = String(state.subtypeId) === String(snap.subtypeId) && state.jobType === snap.jobType;
  const card = sameCard && snap.card ? snap.card : await findPriceCard(state.subtypeId, state.jobType, sr.brand);
  if (!card) throw new ApiError(422, 'No price is set for this product type and service. Ask the admin to add one.');
  const subscriptionId = state.subscriptionId !== undefined ? state.subscriptionId : sr.subscriptionId;
  const subscription = subscriptionId ? await PlanSubscription.findById(subscriptionId).lean() : null;
  const coverage = state.coverage || sr.coverage || 'none';
  return {
    card,
    bill: buildBill({
      jobType: state.jobType, coverage, subscription, card, addOns: snap.addOns || [], parts: state.parts || [], distance: snap.distance, surcharge: snap.surcharge,
      paymentMode: sr.paymentMode, repair: state.repair, damage: state.damage, repeat: snap.repeat, visitOnly, chargeVisit,
      gstPercent: snap.gstPercent ?? 18, pricing: snap.pricing || {}, coupon: snap.coupon,
    }),
  };
}

const stateOf = (sr) => ({
  subtypeId: sr.subtypeId, subtypeName: sr.subtypeName, jobType: sr.jobType, coverage: sr.coverage, subscriptionId: sr.subscriptionId,
  parts: (sr.parts || []).map((p) => (p.toObject ? p.toObject() : { ...p })), repair: sr.repair, damage: sr.damage,
});

module.exports = {
  JOB_LABEL, COVERAGE_LABEL, money, coversLabour, warrantyClaimable, resolveCoverage, findPriceCard, distanceCharge, normalizeSlot, surchargeFor,
  buildBill, withPayments, amountWithGst, upfrontFor, quoteBooking, billForState, stateOf,
};
