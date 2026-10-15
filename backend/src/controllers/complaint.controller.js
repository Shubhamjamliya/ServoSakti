const AiComplaint = require('../models/AiComplaint');
const ProductPassport = require('../models/ProductPassport');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const { notify, notifyAdmins, audit } = require('../services/realtime');

/**
 * Phase 1B workflow, kept separate from field-service work orders.
 * The actual outbound AI call is an external provider integration; here we manage the data model, states and fallbacks so
 * a provider can be plugged into `queueCall` later without redesigning the core platform.
 */
const summarize = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
};

const scope = (req) => (req.user.role === 'customer' ? { customerId: req.customer._id } : req.user.role === 'admin' ? {} : { _id: null });

exports.create = asyncHandler(async (req, res) => {
  const { passportId, transcript, inputMode } = req.body;
  if (!transcript?.trim()) throw new ApiError(400, 'Describe the problem');
  const passport = passportId ? await ProductPassport.findById(passportId).lean() : null;
  if (passportId && !passport) throw new ApiError(404, 'Product passport not found');
  const doc = await AiComplaint.create({
    customerId: req.customer._id, passportId, brand: passport?.brand, model: passport?.model,
    inputMode, transcript, summary: summarize(transcript),
  });
  res.status(201).json(doc);
});

exports.list = asyncHandler(async (req, res) => {
  res.json(await paginate(AiComplaint, scope(req), req, { search: ['brand', 'model', 'summary', 'call.srNumber'], filters: ['status'] }));
});

/** Customer confirms/edits the summary; this queues the outbound brand customer-care call. */
exports.confirm = asyncHandler(async (req, res) => {
  const c = await AiComplaint.findOne({ _id: req.params.id, ...scope(req) });
  if (!c) throw new ApiError(404, 'Complaint not found');
  if (c.status !== 'draft') throw new ApiError(409, 'Complaint already confirmed');
  if (req.body.summary) c.summary = summarize(req.body.summary);
  c.customerConfirmed = true;
  c.call.consent = req.body.consent === true; // recording/transcript only where consented
  c.call.status = 'queued';
  c.status = 'confirmed';
  await c.save();
  notifyAdmins('AI complaint queued', `${c.brand || 'Brand'} · ${c.summary}`, 'complaint');
  res.json(c);
});

/** Records the call outcome (from the telephony provider webhook or an operator). */
exports.callResult = asyncHandler(async (req, res) => {
  const { outcome, srNumber, expectedTat, notes, failureReason } = req.body;
  const c = await AiComplaint.findById(req.params.id);
  if (!c) throw new ApiError(404, 'Complaint not found');
  if (outcome === 'registered') {
    if (!srNumber) throw new ApiError(400, 'Brand SR number is required');
    Object.assign(c.call, { status: 'registered', srNumber, expectedTat, notes, failureReason: undefined });
    c.status = 'registered';
    c.followUpAt = new Date(Date.now() + 24 * 3600000);
  } else if (outcome === 'failed') {
    c.call.status = 'failed';
    c.call.failureReason = failureReason || 'Call failed';
    c.call.retries += 1;
    c.status = c.call.retries >= 3 ? 'escalated' : 'confirmed'; // retry up to 3 times, then escalate to a human operator
    if (c.status === 'escalated') c.call.status = 'human_handoff';
  } else if (outcome === 'human_handoff') {
    c.call.status = 'human_handoff';
    c.status = 'escalated';
  } else throw new ApiError(400, 'outcome must be registered, failed or human_handoff');
  await c.save();
  const cust = await require('../models/Customer').findById(c.customerId).lean();
  if (cust) notify([cust._id], 'Complaint update', outcome === 'registered' ? `Registered with ${c.brand}. SR ${srNumber}` : 'We are retrying your complaint', 'complaint');
  audit(req.user, `complaint.${outcome}`, 'AiComplaint', c._id);
  res.json(c);
});

exports.retry = asyncHandler(async (req, res) => {
  const c = await AiComplaint.findById(req.params.id);
  if (!c) throw new ApiError(404, 'Complaint not found');
  c.call.status = 'queued';
  c.status = 'confirmed';
  await c.save();
  res.json(c);
});

/** Used by the follow-up cron: registered complaints with no update after the due time get escalated. */
exports.runFollowUps = async () => {
  const due = await AiComplaint.find({ status: 'registered', followUpAt: { $lt: new Date() } });
  for (const c of due) {
    c.followUpCount += 1;
    c.followUpAt = new Date(Date.now() + 24 * 3600000);
    if (c.followUpCount >= 3) c.status = 'escalated';
    await c.save();
    await notifyAdmins('Complaint follow-up due', `${c.brand || ''} SR ${c.call.srNumber} needs a status check`, 'complaint');
  }
  return due.length;
};
