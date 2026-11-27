const crypto = require('crypto');
const ServiceRequest = require('../models/ServiceRequest');
const FieldReport = require('../models/FieldReport');
const DayLog = require('../models/DayLog');
const Engineer = require('../models/Engineer');
const Customer = require('../models/Customer');
const ProductPassport = require('../models/ProductPassport');
const Subtype = require('../models/Subtype');
const Part = require('../models/Part');
const Setting = require('../models/Setting');
const { ApiError, asyncHandler, istDate, haversineKm } = require('../utils/helpers');
const { sendOtpSms } = require('../utils/sms');
const { scopeFor } = require('./serviceRequest.controller');
const settlement = require('../services/settlement.service');
const booking = require('../services/booking.service');
const payments = require('../services/payment.service');
const plans = require('../services/plan.service');
const { notify, notifyAdmins, notifyCompany, audit } = require('../services/realtime');

const today = (engineerId) => DayLog.findOne({ engineerId, date: istDate() });

/* ---- Day Start (compulsory). There is no manual end: a cron job closes the day at 23:59 IST. ---- */
exports.dayStart = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') throw new ApiError(400, 'Location (lat, lng) is required for Day Start');
  const existing = await today(req.engineer._id);
  if (existing) return res.json(existing);
  const day = await DayLog.create({ engineerId: req.engineer._id, date: istDate(), startedAt: new Date(), startLocation: { lat, lng } });
  req.engineer.location = { lat, lng, at: new Date() };
  await req.engineer.save();
  res.status(201).json(day);
});

exports.day = asyncHandler(async (req, res) => res.json({ date: istDate(), day: await today(req.engineer._id) }));

/** The engineer's own job: ownership is enforced through scopeFor (engineerId). */
const myJob = async (req) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Job not found');
  return sr;
};
const requireDay = async (req) => {
  const day = await today(req.engineer._id);
  if (!day || day.closedAt) throw new ApiError(400, 'Day Start is required before field activity');
};

exports.checkIn = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  await requireDay(req);
  if (!['assigned', 'in_progress'].includes(sr.status)) throw new ApiError(409, `Cannot check in to a job that is ${sr.status}`);
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') throw new ApiError(400, 'Location is required for check-in');
  const distanceKm = haversineKm({ lat, lng }, sr.location);
  const report = await FieldReport.findOneAndUpdate(
    { serviceRequestId: sr._id },
    { $set: { engineerId: req.engineer._id, checkIn: { lat, lng, at: new Date(), distanceKm } } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const firstArrival = sr.status === 'assigned';
  sr.status = 'in_progress';
  await sr.save();
  req.engineer.location = { lat, lng, at: new Date() };
  await req.engineer.save();
  if (sr.customerId) await notify([sr.customerId], 'Engineer has arrived', `${req.engineer.name} has started work on ${sr.srNumber}`, 'service');
  // urgent slot missed: the customer gets the urgent surcharge back
  if (firstArrival && sr.slot === 'urgent' && sr.priceSnapshot?.surcharge) {
    const { pricing: p } = await Setting.get();
    if (Date.now() > new Date(sr.createdAt).getTime() + (p.urgentWithinHours ?? 3) * 3600000) await booking.waiveSurcharge(sr, 'Urgent slot missed, surcharge refunded');
  }
  res.json(report);
});

/* ---- on-site product check, parts and payment. The engineer reports facts; the system sets every price. ---- */
const requireStarted = (sr) => {
  if (sr.status !== 'in_progress') throw new ApiError(409, 'Check in at the site first');
};

/**
 * Nameplate photo + the facts the engineer sees (subtype, service needed, physical damage). Any price change goes to
 * the customer as a revised quote (increase) or is applied and refunded at once (decrease).
 */
exports.verifyProduct = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  requireStarted(sr);
  const b = req.body;
  if (!b.nameplatePhoto) throw new ApiError(400, 'Take a photo of the nameplate (model and capacity sticker)');
  const passport = sr.passportId ? await ProductPassport.findById(sr.passportId) : null;
  const next = {};
  const changes = [];
  const flags = new Set(sr.flags || []);

  if (b.subtypeId && String(b.subtypeId) !== String(sr.subtypeId)) {
    const subtype = await Subtype.findOne({ _id: b.subtypeId, active: true }).lean();
    if (!subtype) throw new ApiError(400, 'Choose a valid product type');
    changes.push(`Product type ${sr.subtypeName || 'not set'} → ${subtype.name}`);
    Object.assign(next, { subtypeId: subtype._id, subtypeName: subtype.name });
    if (passport?.verified && passport.subtypeId && String(passport.subtypeId) !== String(subtype._id)) flags.add('Product type differs from the earlier verified record');
  }
  if (b.jobType && b.jobType !== sr.jobType) {
    changes.push(`Service ${sr.jobType} → ${b.jobType}`);
    next.jobType = b.jobType;
  }
  if (b.damage && !sr.damage) {
    if (!b.damageNote || !b.damagePhotos?.length) throw new ApiError(400, 'Describe the damage and add photos of it');
    if (sr.coverage !== 'none') changes.push('Physical damage found: coverage does not apply to this repair');
    next.damage = true;
  }
  const serial = String(b.serialNumber || '').trim();
  if (serial && passport?.serialNumber && serial.toUpperCase() !== String(passport.serialNumber).toUpperCase()) flags.add('Serial number differs from the registered product');

  sr.verification = { nameplatePhoto: b.nameplatePhoto, serialNumber: serial || sr.serialNumber, damageNote: b.damageNote, damagePhotos: b.damagePhotos || [], at: new Date() };
  sr.flags = [...flags];
  if (passport) {
    if (next.subtypeId) Object.assign(passport, { subtypeId: next.subtypeId, subtypeName: next.subtypeName });
    if (passport.subtypeId) Object.assign(passport, { verified: true, verifiedBy: req.engineer._id, verifiedAt: new Date() });
    await passport.save();
  }
  await FieldReport.updateOne({ serviceRequestId: sr._id }, { $set: { serialNumber: serial || sr.serialNumber } });
  audit(req.user, 'sr.verifyProduct', 'ServiceRequest', sr._id, { changes, flags: sr.flags });

  let result = { applied: true };
  if (sr.bill && Object.keys(next).length) result = await booking.proposeChange(sr, next, { reason: changes.join('; '), changes, actor: req.user });
  else await sr.save();
  res.json({ ...result, serviceRequest: sr });
});

/**
 * Parts and extras from the parts list (the full list each time) and, for breakdowns, the repair itself.
 * A part replaced on an earlier visit that fails inside its part warranty is free.
 */
exports.setParts = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  requireStarted(sr);
  if (sr.bill && !sr.verification?.nameplatePhoto) throw new ApiError(400, 'Verify the product (nameplate photo) first');
  const wanted = (req.body.parts || []).filter((p) => p.partId && Number(p.qty) > 0);
  const docs = await Part.find({ _id: { $in: wanted.map((p) => p.partId) }, active: true }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const earlier = sr.passportId
    ? await ServiceRequest.find({ _id: { $ne: sr._id }, passportId: sr.passportId, status: { $in: ['approved', 'closed'] } }).select('parts approvedAt').lean()
    : [];
  const parts = wanted.map((w) => {
    const part = byId.get(String(w.partId));
    if (!part) throw new ApiError(400, 'One of the parts is not in the parts list');
    if (part.subtypeIds?.length && sr.subtypeId && !part.subtypeIds.some((s) => String(s) === String(sr.subtypeId))) throw new ApiError(400, `${part.name} does not fit this product`);
    const since = Date.now() - (part.partWarrantyDays || 0) * 86400000;
    const partWarranty = earlier.some((e) => new Date(e.approvedAt) >= since && (e.parts || []).some((p) => String(p.partId) === String(part._id)));
    return { partId: part._id, name: part.name, code: part.code, unit: part.unit, qty: Number(w.qty), price: part.price, coveredBy: part.coveredBy || [], partWarranty };
  });
  const repair = sr.jobType === 'breakdown' ? req.body.repair !== false : sr.repair;
  if (!sr.bill) {
    Object.assign(sr, { parts, repair });
    await sr.save();
    return res.json({ applied: true, serviceRequest: sr });
  }
  const reason = parts.length ? `Parts: ${parts.map((p) => `${p.name} × ${p.qty}`).join(', ')}` : 'Repair confirmed';
  const result = await booking.proposeChange(sr, { parts, repair }, { reason, changes: [reason], actor: req.user });
  res.json({ ...result, serviceRequest: sr });
});

/** Cash handed over by the customer for what is due. */
exports.collectCash = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  if (!['in_progress', 'failed'].includes(sr.status)) throw new ApiError(409, 'Cash can be collected only during or at the end of the visit');
  if (sr.quote?.status === 'pending') throw new ApiError(409, 'Wait for the customer to approve or reject the revised price');
  await payments.recordCash(sr, req.engineer, Number(req.body.amount));
  await sr.save();
  audit(req.user, 'sr.cash', 'ServiceRequest', sr._id, { amount: req.body.amount });
  if (sr.customerId) await notify([sr.customerId], 'Payment received', `${sr.srNumber}: ₹${req.body.amount} paid in cash to ${req.engineer.name}`, 'payment');
  res.json(sr);
});

/** Customer not at home: allowed after waiting at the site (GPS check-in proves the visit). Charges the visit. */
exports.noShow = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  requireStarted(sr);
  const report = await FieldReport.findOne({ serviceRequestId: sr._id }).lean();
  const { pricing: p } = await Setting.get();
  const waited = report?.checkIn?.at ? (Date.now() - new Date(report.checkIn.at)) / 60000 : 0;
  if (waited < (p.noShowWaitMinutes ?? 15)) throw new ApiError(409, `Wait at least ${p.noShowWaitMinutes ?? 15} minutes after check-in and call the customer before marking a no-show`);
  res.json(await booking.failWithVisitCharge(sr, 'Customer not available at the site', req.user, { chargeVisit: p.noShowUnderCoverage !== false }));
});

exports.saveReport = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  if (!['in_progress'].includes(sr.status)) throw new ApiError(409, 'Check in before adding service evidence');
  const keys = ['crmRef', 'serialNumber', 'readings', 'workDone', 'remarks', 'beforePhotos', 'afterPhotos', 'customerSignature', 'efsrUrl', 'productWorking'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => keys.includes(k)));
  res.json(await FieldReport.findOneAndUpdate({ serviceRequestId: sr._id }, { $set: patch }, { new: true }));
});

exports.report = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) }).lean();
  if (!sr) throw new ApiError(404, 'Job not found');
  res.json(await FieldReport.findOne({ serviceRequestId: sr._id }).lean());
});

/**
 * Closure OTP for the customer: one random 4-digit code, the same on their tracking page, in the push notification and
 * in the SMS (texted only when USE_DEFAULT_OTP is off). A resend keeps the unexpired code so earlier messages stay valid.
 * The engineer never sees it; they get it from the customer.
 */
exports.sendOtp = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  if (sr.status !== 'in_progress') throw new ApiError(409, 'Job is not in progress');
  const useDefault = process.env.USE_DEFAULT_OTP === 'true';
  const current = sr.otp?.code && !sr.otp.verified && sr.otp.expiresAt > new Date() ? sr.otp.code : null;
  const code = current || String(crypto.randomInt(1000, 10000));
  sr.otp = { code, expiresAt: new Date(Date.now() + 15 * 60000), verified: false };
  await sr.save();
  if (!useDefault && sr.customerPhone) {
    try { await sendOtpSms(sr.customerPhone, code); } catch (e) { console.error('[SMS]', e.message); throw new ApiError(502, 'Could not send the OTP to the customer. Please try again.'); }
  }
  if (sr.customerId) {
    const cust = await Customer.findById(sr.customerId).lean();
    if (cust) await notify([cust._id], 'Service completion OTP', `Share OTP ${code} with the engineer to confirm service ${sr.srNumber}`, 'otp');
  }
  res.json({ sent: true });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  if (!sr.otp?.code || sr.otp.expiresAt < new Date()) throw new ApiError(400, 'OTP expired — request a new one');
  if (String(req.body.otp) !== sr.otp.code) throw new ApiError(400, 'Incorrect OTP');
  sr.otp.verified = true;
  await sr.save();
  res.json({ verified: true });
});

exports.submit = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  await requireDay(req);
  if (sr.status !== 'in_progress') throw new ApiError(409, 'Job is not in progress');
  const report = await FieldReport.findOne({ serviceRequestId: sr._id });
  if (!report?.checkIn?.at) throw new ApiError(400, 'GPS check-in is required');
  if (!report.serialNumber) throw new ApiError(400, 'Equipment serial number is required');
  if (!report.workDone) throw new ApiError(400, 'Describe the work performed');
  if (!report.beforePhotos?.length || !report.afterPhotos?.length) throw new ApiError(400, 'Before and after photos are required');
  if (!sr.otp?.verified && !report.customerSignature) throw new ApiError(400, 'Customer OTP or signature is required to close the service');
  if (sr.bill) {
    if (!sr.verification?.nameplatePhoto) throw new ApiError(400, 'Verify the product with a nameplate photo first');
    if (sr.quote?.status === 'pending') throw new ApiError(409, 'The customer has not answered the revised price yet');
    await payments.syncBill(sr);
    if (sr.bill.due > 0) throw new ApiError(402, `₹${sr.bill.due} is still due. Collect it in cash or ask the customer to pay in the app.`);
  }
  report.submittedAt = new Date();
  report.review = { status: 'pending' };
  await report.save();
  sr.status = 'under_review';
  sr.completedAt = new Date();
  await sr.save();
  await notifyCompany(sr.oemId, 'eFSR submitted', `${sr.srNumber} is awaiting review`, 'review');
  await notifyCompany(sr.vendorId, 'eFSR submitted', `${sr.srNumber} is awaiting review`, 'review');
  await notifyAdmins('eFSR submitted', `${sr.srNumber} is awaiting review`, 'review');
  res.json({ status: sr.status });
});

/** Admin / OEM / vendor owner reviews the evidence. Approval releases the call to billing, incentive and payout rules. */
exports.review = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new ApiError(400, 'decision must be approved or rejected');
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (sr.status !== 'under_review') throw new ApiError(409, 'Nothing to review');
  const report = await FieldReport.findOne({ serviceRequestId: sr._id });
  report.review = { by: req.user.id, status: decision, note, at: new Date() };
  await report.save();
  sr.reviewNote = note;

  if (decision === 'approved') {
    sr.status = 'approved';
    sr.approvedAt = new Date();
    await sr.save();
    const payout = await settlement.createPayout(sr, report, req.user.id);
    await settlement.recordApprovedCall(sr);
    await plans.usePmVisit(sr);
    // a working pre-inspection unlocks AMC/CMC purchase; its fee is adjusted in the plan price
    if (sr.jobType === 'inspection' && sr.passportId && report.productWorking !== false) {
      await ProductPassport.updateOne({ _id: sr.passportId }, { inspectedAt: new Date(), inspectionFee: sr.bill?.total || 0 });
    }
    const eng = await Engineer.findById(sr.engineerId).lean();
    await notify([eng?._id], 'Call approved', `${sr.srNumber} was approved`, 'review');
    if (sr.customerId) await notify([sr.customerId], 'Service completed', `${sr.srNumber} is complete — please confirm and rate the service`, 'service');
    audit(req.user, 'sr.approve', 'ServiceRequest', sr._id, { payout: String(payout._id) });
  } else {
    sr.status = 'in_progress'; // engineer must redo / add evidence
    await sr.save();
    const eng = await Engineer.findById(sr.engineerId).lean();
    await notify([eng?._id], 'Call rejected', `${sr.srNumber}: ${note || 'please redo the service evidence'}`, 'review');
    audit(req.user, 'sr.reject', 'ServiceRequest', sr._id, { note });
  }
  res.json(sr);
});

/** Marks a call as failed (customer unavailable, wrong equipment, etc.). Payment follows the failedCallPayout policy. */
exports.fail = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'A reason is required');
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (!['assigned', 'in_progress', 'under_review'].includes(sr.status)) throw new ApiError(409, `Cannot fail a call that is ${sr.status}`);
  // a visited job is billed the visit charge only; one never visited costs the customer nothing. Overpayment is refunded.
  res.json(await booking.failWithVisitCharge(sr, reason, req.user, { noCharge: sr.status === 'assigned' }));
});
