const crypto = require('crypto');
const ServiceRequest = require('../models/ServiceRequest');
const FieldReport = require('../models/FieldReport');
const DayLog = require('../models/DayLog');
const Engineer = require('../models/Engineer');
const Customer = require('../models/Customer');
const { ApiError, asyncHandler, istDate, haversineKm } = require('../utils/helpers');
const { scopeFor } = require('./serviceRequest.controller');
const settlement = require('../services/settlement.service');
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
  sr.status = 'in_progress';
  await sr.save();
  req.engineer.location = { lat, lng, at: new Date() };
  await req.engineer.save();
  res.json(report);
});

exports.saveReport = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  if (!['in_progress'].includes(sr.status)) throw new ApiError(409, 'Check in before adding service evidence');
  const keys = ['crmRef', 'serialNumber', 'readings', 'workDone', 'remarks', 'beforePhotos', 'afterPhotos', 'customerSignature', 'efsrUrl'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => keys.includes(k)));
  res.json(await FieldReport.findOneAndUpdate({ serviceRequestId: sr._id }, { $set: patch }, { new: true }));
});

exports.report = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) }).lean();
  if (!sr) throw new ApiError(404, 'Job not found');
  res.json(await FieldReport.findOne({ serviceRequestId: sr._id }).lean());
});

/** Generates a 6-digit OTP for the customer. In production this is sent over SMS; here it is returned only outside production. */
exports.sendOtp = asyncHandler(async (req, res) => {
  const sr = await myJob(req);
  if (sr.status !== 'in_progress') throw new ApiError(409, 'Job is not in progress');
  const code = String(crypto.randomInt(100000, 999999));
  sr.otp = { code, expiresAt: new Date(Date.now() + 15 * 60000), verified: false };
  await sr.save();
  if (sr.customerId) {
    const cust = await Customer.findById(sr.customerId).lean();
    if (cust) await notify([cust._id], 'Service completion OTP', `Share OTP ${code} with the engineer to confirm service ${sr.srNumber}`, 'otp');
  }
  res.json({ sent: true, ...(process.env.NODE_ENV === 'production' ? {} : { devOtp: code }) });
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
    const eng = await Engineer.findById(sr.engineerId).lean();
    await notify([eng?._id], 'Call approved', `${sr.srNumber} was approved`, 'review');
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
