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

const TEXT_FIELDS = ['gstin', 'invoicePrefix', 'companyName', 'appTagline', 'email', 'phoneCountryCode', 'phoneNumber', 'address', 'state', 'pincode', 'region'];
const LOGO_FIELDS = ['logo', 'favicon', 'oemLogo', 'vendorLogo', 'engineerLogo', 'customerLogo'];
exports.LOGO_FIELDS = LOGO_FIELDS;

const brandingOf = (s) => {
  const b = s.businessSetup?.toObject ? s.businessSetup.toObject() : s.businessSetup || {};
  return { ...b, ...Object.fromEntries(LOGO_FIELDS.map((f) => [f, b[f]?.url || null])) };
};

/** Public: company name + logos for login screens and the favicon (no secrets). */
exports.branding = asyncHandler(async (req, res) => {
  const setting = await Setting.get();
  const b = brandingOf(setting);
  res.json({
    companyName: b.companyName, appTagline: b.appTagline || '', customerHome: setting.customerHome, ...Object.fromEntries(LOGO_FIELDS.map((f) => [f, b[f]])),
    // customer-facing rules the apps need before login (no secrets)
    rules: { disputesEnabled: setting.pricing?.disputesEnabled !== false, disputeWindowDays: setting.pricing?.disputeWindowDays ?? 7 },
  });
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

const QUICK_KEYS = ['request', 'product', 'warranty', 'history'];
const str = (v, max = 80) => String(v ?? '').trim().slice(0, max);

exports.getCustomerHome = asyncHandler(async (req, res) => {
  res.json({ customerHome: (await Setting.get()).customerHome });
});

/** Home screen content of the customer app: greeting line, banner slides and the four tile labels/images. */
exports.updateCustomerHome = asyncHandler(async (req, res) => {
  const { subtitle, banners, quickActions } = req.body;
  if (!Array.isArray(banners) || banners.length > 8) throw new ApiError(400, 'banners must be a list of up to 8 slides');
  const clean = {
    subtitle: str(subtitle, 200),
    banners: banners.map((b) => ({ title: str(b.title), highlight: str(b.highlight), chips: (Array.isArray(b.chips) ? b.chips : []).map((c) => str(c, 30)).filter(Boolean).slice(0, 3), image: str(b.image, 500) }))
      .filter((b) => b.title || b.highlight || b.image),
    quickActions: (Array.isArray(quickActions) ? quickActions : []).filter((q) => QUICK_KEYS.includes(q.key)).map((q) => ({ key: q.key, label: str(q.label, 40), image: str(q.image, 500) })),
  };
  const s = await Setting.findOneAndUpdate({ key: 'global' }, { $set: { customerHome: clean } }, { new: true, upsert: true });
  audit(req.user, 'customer-home.update', 'Setting', s._id, { banners: clean.banners.length });
  res.json({ customerHome: s.customerHome });
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
  { key: 'payments', label: 'Customer payments', Model: require('../models/Payment') },
  { key: 'planSubscriptions', label: 'AMC / CMC subscriptions', Model: require('../models/PlanSubscription') },
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
