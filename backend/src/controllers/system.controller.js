const Setting = require('../models/Setting');
const ServiceRequest = require('../models/ServiceRequest');
const DispatchLog = require('../models/DispatchLog');
const FieldReport = require('../models/FieldReport');
const Payout = require('../models/Payout');
const Incentive = require('../models/Incentive');
const Dispute = require('../models/Dispute');
const DayLog = require('../models/DayLog');
const Notification = require('../models/Notification');
const AiComplaint = require('../models/AiComplaint');
const Counter = require('../models/Counter');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { uploadImageBuffer, removeUploadedFile } = require('../services/storage.service');
const { isCloudinaryConfigured } = require('../utils/cloudinary');
const { audit } = require('../services/realtime');

const TEXT_FIELDS = ['companyName', 'email', 'phoneCountryCode', 'phoneNumber', 'address', 'state', 'pincode', 'region'];
const LOGO_FIELDS = ['logo', 'favicon', 'oemLogo', 'vendorLogo', 'engineerLogo', 'customerLogo'];
exports.LOGO_FIELDS = LOGO_FIELDS;

const brandingOf = (s) => {
  const b = s.businessSetup?.toObject ? s.businessSetup.toObject() : s.businessSetup || {};
  return { ...b, ...Object.fromEntries(LOGO_FIELDS.map((f) => [f, b[f]?.url || null])) };
};

/** Public: company name + logos for login screens and the favicon (no secrets). */
exports.branding = asyncHandler(async (req, res) => {
  const b = brandingOf(await Setting.get());
  res.json({ companyName: b.companyName, ...Object.fromEntries(LOGO_FIELDS.map((f) => [f, b[f]])) });
});

exports.getBusinessSetup = asyncHandler(async (req, res) => {
  res.json({ businessSetup: brandingOf(await Setting.get()) });
});

exports.updateBusinessSetup = asyncHandler(async (req, res) => {
  const s = await Setting.get();
  const current = s.businessSetup.toObject();
  const $set = {};
  TEXT_FIELDS.forEach((f) => { if (req.body[f] !== undefined) $set[`businessSetup.${f}`] = String(req.body[f]).trim(); });
  for (const f of LOGO_FIELDS) {
    const file = req.files?.[f]?.[0];
    if (file) {
      const stored = await uploadImageBuffer(file.buffer, f === 'favicon' ? { width: 256, height: 256 } : { width: 1200, height: 1200 });
      await removeUploadedFile(current[f]);
      $set[`businessSetup.${f}`] = stored;
    } else if (req.body[`remove_${f}`] === 'true') {
      await removeUploadedFile(current[f]);
      $set[`businessSetup.${f}`] = null;
    }
  }
  const updated = await Setting.findOneAndUpdate({ key: 'global' }, { $set }, { new: true });
  audit(req.user, 'business-setup.update', 'Setting', updated._id, Object.keys($set));
  res.json({ businessSetup: brandingOf(updated) });
});

exports.getDeveloper = asyncHandler(async (req, res) => {
  const s = await Setting.get();
  res.json({ developerSettings: s.developerSettings, cloudinaryConfigured: isCloudinaryConfigured() });
});

exports.updateDeveloper = asyncHandler(async (req, res) => {
  const { imageUploadProvider } = req.body;
  if (!['local', 'cloudinary'].includes(imageUploadProvider)) throw new ApiError(400, 'imageUploadProvider must be "local" or "cloudinary"');
  if (imageUploadProvider === 'cloudinary' && !isCloudinaryConfigured()) throw new ApiError(400, 'Cloudinary is not configured on the server (missing CLOUDINARY_* env vars)');
  const s = await Setting.findOneAndUpdate({ key: 'global' }, { $set: { 'developerSettings.imageUploadProvider': imageUploadProvider } }, { new: true, upsert: true });
  audit(req.user, 'developer.upload-provider', 'Setting', s._id, { imageUploadProvider });
  res.json({ developerSettings: s.developerSettings });
});

// Transactional data only. Accounts, products, passports, rate cards, authorizations and settings are never touched.
const GROUPS = [
  { key: 'serviceRequests', label: 'Service requests', Model: ServiceRequest },
  { key: 'dispatchLogs', label: 'Dispatch logs', Model: DispatchLog },
  { key: 'fieldReports', label: 'Field reports', Model: FieldReport },
  { key: 'payouts', label: 'Payouts / settlements', Model: Payout },
  { key: 'incentives', label: 'Incentives', Model: Incentive },
  { key: 'disputes', label: 'Disputes', Model: Dispute },
  { key: 'dayLogs', label: 'Engineer day logs', Model: DayLog },
  { key: 'aiComplaints', label: 'AI complaints', Model: AiComplaint },
  { key: 'notifications', label: 'Notifications', Model: Notification },
];
const CONFIRM_PHRASE = 'DELETE OPERATIONAL DATA';

exports.operationalCounts = asyncHandler(async (req, res) => {
  const groups = await Promise.all(GROUPS.map(async (g) => ({ key: g.key, label: g.label, count: await g.Model.estimatedDocumentCount() })));
  res.json({ groups, total: groups.reduce((a, g) => a + g.count, 0), confirmPhrase: CONFIRM_PHRASE });
});

exports.clearOperationalData = asyncHandler(async (req, res) => {
  if (req.body.confirm !== CONFIRM_PHRASE) throw new ApiError(400, `Type "${CONFIRM_PHRASE}" to confirm`);
  const cleared = {};
  let total = 0;
  for (const g of GROUPS) {
    const { deletedCount } = await g.Model.deleteMany({});
    cleared[g.key] = deletedCount;
    total += deletedCount;
  }
  await Counter.deleteOne({ key: 'sr' }); // SR numbers restart
  audit(req.user, 'developer.clear-operational-data', 'System', null, cleared);
  res.json({ cleared, total });
});
