const { Oem, Vendor, Engineer, Customer } = require('../models/accounts');
const ServiceRequest = require('../models/ServiceRequest');
const FieldReport = require('../models/FieldReport');
const Payout = require('../models/Payout');
const Dispute = require('../models/Dispute');
const Setting = require('../models/Setting');
const AuditLog = require('../models/AuditLog');
const { asyncHandler, paginate } = require('../utils/helpers');
const { buildStats } = require('./serviceRequest.controller');
const { audit } = require('../services/realtime');

exports.dashboard = asyncHandler(async (req, res) => {
  const [stats, oems, vendors, engineers, customers, pendingOems, pendingVendors, pendingEngineers, openDisputes, unassigned, money] = await Promise.all([
    buildStats({}, req.query.period),
    Oem.countDocuments(),
    Vendor.countDocuments(),
    Engineer.countDocuments({ status: 'approved' }),
    Customer.countDocuments(),
    Oem.countDocuments({ status: 'pending' }),
    Vendor.countDocuments({ status: 'pending' }),
    Engineer.countDocuments({ status: 'pending' }),
    Dispute.countDocuments({ status: 'open' }),
    ServiceRequest.countDocuments({ status: 'unassigned' }),
    Payout.aggregate([{ $group: { _id: null, vendor: { $sum: '$vendorAmount' }, engineer: { $sum: '$engineerAmount' }, fee: { $sum: '$platformFee' }, unpaid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, '$vendorAmount', 0] } } } }]),
  ]);
  res.json({
    ...stats, oems, vendors, engineers, customers,
    pendingApprovals: pendingOems + pendingVendors + pendingEngineers, pendingOems, pendingVendors, pendingEngineers, openDisputes, unassigned,
    money: money[0] || { vendor: 0, engineer: 0, fee: 0, unpaid: 0 },
  });
});

/** Applications waiting for a decision, per account type (sidebar badges). */
exports.pendingCounts = asyncHandler(async (req, res) => {
  const [oems, vendors, engineers] = await Promise.all([
    Oem.countDocuments({ status: 'pending' }), Vendor.countDocuments({ status: 'pending' }), Engineer.countDocuments({ status: 'pending' }),
  ]);
  res.json({ oems, vendors, engineers });
});

exports.approvals = asyncHandler(async (req, res) => {
  const [oems, vendors, engineers] = await Promise.all([
    Oem.find({ status: 'pending' }).lean(),
    Vendor.find({ status: 'pending' }).lean(),
    Engineer.find({ status: 'pending' }).populate('companyId', 'legalName').lean(),
  ]);
  const companies = [...oems.map((c) => ({ ...c, type: 'oem' })), ...vendors.map((c) => ({ ...c, type: 'vendor' }))];
  const items = [
    ...companies.map((c) => ({ id: c._id, kind: 'company', subtype: c.type, name: c.legalName, city: c.city, phone: c.phone, detail: (c.authorizedBrands || []).join(', '), gstin: c.gstin, kycDocs: c.kyc?.length || 0, createdAt: c.createdAt })),
    ...engineers.map((e) => ({ id: e._id, kind: 'engineer', subtype: e.engineerType, name: e.name, city: e.city, phone: e.phone, detail: (e.certifications || []).map((c) => c.brand).join(', '), company: e.companyId?.legalName || 'Independent', kycDocs: e.kyc?.length || 0, createdAt: e.createdAt })),
  ].sort((a, b) => a.createdAt - b.createdAt);
  res.json({ items, total: items.length });
});

/** Company-wise / city-wise MIS. groupBy = oem | vendor | city */
exports.mis = asyncHandler(async (req, res) => {
  const groupBy = req.query.groupBy || 'oem';
  const field = { oem: '$oemId', vendor: '$vendorId', city: '$city' }[groupBy] || '$oemId';
  const rows = await ServiceRequest.aggregate([
    { $group: {
      _id: field, requests: { $sum: 1 },
      closed: { $sum: { $cond: [{ $in: ['$status', ['approved', 'closed']] }, 1, 0] } },
      warranty: { $sum: { $cond: [{ $eq: ['$warranty', 'warranty'] }, 1, 0] } },
      breaches: { $sum: { $cond: [{ $eq: ['$slaBreached', true] }, 1, 0] } },
      repeats: { $sum: { $cond: [{ $ifNull: ['$repeatOf', false] }, 1, 0] } },
    } },
    ...(groupBy === 'city' ? [] : [{ $lookup: { from: groupBy === 'vendor' ? 'vendors' : 'oems', localField: '_id', foreignField: '_id', as: 'co' } }]),
  ]);
  const pay = await Payout.aggregate([{ $group: { _id: field === '$city' ? null : field, vendorAmount: { $sum: '$vendorAmount' }, platformFee: { $sum: '$platformFee' } } }]);
  const payMap = new Map(pay.map((p) => [String(p._id), p]));
  const items = rows.map((r) => ({
    id: String(r._id), name: groupBy === 'city' ? r._id || '—' : r.co?.[0]?.legalName || '—',
    requests: r.requests, closed: r.closed, warranty: r.warranty, breaches: r.breaches, repeats: r.repeats,
    vendorAmount: payMap.get(String(r._id))?.vendorAmount || 0, platformFee: payMap.get(String(r._id))?.platformFee || 0,
  }));
  res.json({ items, total: items.length, groupBy });
});

/** Quality per service company: TAT, first-time-fix, repeats, rating, evidence completeness. */
exports.quality = asyncHandler(async (req, res) => {
  const srs = await ServiceRequest.find({ vendorId: { $ne: null }, status: { $nin: ['cancelled'] } }).populate('vendorId', 'legalName').lean();
  const reports = await FieldReport.find({ serviceRequestId: { $in: srs.map((s) => s._id) } }).lean();
  const rep = new Map(reports.map((r) => [String(r.serviceRequestId), r]));
  const groups = new Map();
  for (const s of srs) {
    const key = String(s.vendorId._id);
    const g = groups.get(key) || { id: key, name: s.vendorId.legalName, calls: 0, done: 0, repeats: 0, tatSum: 0, tatN: 0, ratingSum: 0, ratingN: 0, complete: 0, reported: 0 };
    g.calls += 1;
    if (['approved', 'closed'].includes(s.status)) { g.done += 1; if (s.approvedAt) { g.tatSum += (s.approvedAt - s.createdAt) / 3600000; g.tatN += 1; } }
    if (s.repeatOf) g.repeats += 1;
    if (s.rating) { g.ratingSum += s.rating; g.ratingN += 1; }
    const r = rep.get(String(s._id));
    if (r?.submittedAt) { g.reported += 1; if (r.beforePhotos?.length && r.afterPhotos?.length && r.serialNumber && (r.customerSignature || s.otp?.verified)) g.complete += 1; }
    groups.set(key, g);
  }
  const items = [...groups.values()].map((g) => ({
    id: g.id, name: g.name, calls: g.calls, completed: g.done,
    avgTatHours: g.tatN ? Math.round((g.tatSum / g.tatN) * 10) / 10 : 0,
    firstTimeFix: g.done ? Math.round((1 - g.repeats / g.done) * 100) : 0,
    repeatCalls: g.repeats, rating: g.ratingN ? Math.round((g.ratingSum / g.ratingN) * 10) / 10 : 0,
    evidenceComplete: g.reported ? Math.round((g.complete / g.reported) * 100) : 0,
  }));
  res.json({ items, total: items.length });
});

exports.getSettings = asyncHandler(async (req, res) => res.json(await Setting.get()));

exports.updateSettings = asyncHandler(async (req, res) => {
  const allowed = ['acceptanceWindowMinutes', 'maxRadiusKm', 'maxEngineerLoad', 'autoDispatch', 'slaHours', 'minApprovedCallsForRecharge', 'rechargeDays', 'rechargeTiming', 'repeatCallPayout', 'gstPercent'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const s = await Setting.findOneAndUpdate({ key: 'global' }, patch, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
  audit(req.user, 'settings.update', 'Setting', s._id, patch);
  res.json(s);
});

exports.auditLogs = asyncHandler(async (req, res) => {
  res.json(await paginate(AuditLog, {}, req, { search: ['action', 'entity'], filters: ['entity'], sort: { createdAt: -1 } }));
});
