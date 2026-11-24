const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  key: { type: String, default: 'global', unique: true },
  acceptanceWindowMinutes: { type: Number, default: 10 },
  maxRadiusKm: { type: Number, default: 50 },
  maxEngineerLoad: { type: Number, default: 3 },
  autoDispatch: { type: Boolean, default: true },
  slaHours: { type: Schema.Types.Mixed, default: () => ({ Low: 72, Medium: 48, High: 24, Urgent: 8 }) },
  minApprovedCallsForRecharge: { type: Number, default: 5 },
  rechargeDays: { type: Number, default: 28 },
  rechargeTiming: { type: String, enum: ['month_end', 'next_month', 'after_approval'], default: 'month_end' }, // needs client confirmation
  repeatCallPayout: { type: String, enum: ['pay', 'hold'], default: 'hold' },
  gstPercent: { type: Number, default: 18 },
  enforceZones: { type: Boolean, default: true }, // reject requests whose address is outside every active zone (only once zones exist)
  warrantyReminderDays: { type: [Number], default: () => [30, 7, 1] },
  failedCallPayout: { type: String, enum: ['pay', 'hold', 'none'], default: 'hold' }, // needs client confirmation
  inactiveMonthRecharge: { type: String, enum: ['eligible', 'ineligible'], default: 'ineligible' }, // needs client confirmation
  businessSetup: {
    companyName: { type: String, default: 'Aftenza' },
    gstin: { type: String, default: '' }, // printed on customer invoices
    invoicePrefix: { type: String, default: 'INV' },
    appTagline: { type: String, default: '' }, // small line under the name in the customer app header
    email: { type: String, default: '' },
    phoneCountryCode: { type: String, default: '+91' },
    phoneNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    region: { type: String, default: 'India' },
    // each logo: { url, filename, publicId, provider }
    logo: Schema.Types.Mixed, favicon: Schema.Types.Mixed,
    oemLogo: Schema.Types.Mixed, vendorLogo: Schema.Types.Mixed, engineerLogo: Schema.Types.Mixed, customerLogo: Schema.Types.Mixed,
  },
  // Content of the customer app home screen, editable without a code change.
  customerHome: {
    subtitle: { type: String, default: 'Manage your products, raise service requests and track them in real time.' },
    banners: { type: [Schema.Types.Mixed], default: () => [
      { image: 'https://res.cloudinary.com/l9shqktb/image/upload/v1793634278/aftenza/banners/banner_service.jpg' },
      { image: 'https://res.cloudinary.com/l9shqktb/image/upload/v1793634280/aftenza/banners/banner_parts.jpg' },
      { image: 'https://res.cloudinary.com/l9shqktb/image/upload/v1793634283/aftenza/banners/banner_tracking.jpg' },
    ] },
    // The four home tiles: { key: 'request' | 'product' | 'warranty' | 'history', label, image }. Empty = app defaults.
    quickActions: { type: [Schema.Types.Mixed], default: () => [] },
  },
  // Customer pricing, payment and cancellation rules (services/pricing.service.js). Every number is editable in Settings.
  pricing: {
    distanceSlabs: { type: [{ fromKm: Number, toKm: Number, amount: Number, _id: false }], default: () => [{ fromKm: 0, toKm: 10, amount: 0 }, { fromKm: 10, toKm: 20, amount: 100 }, { fromKm: 20, toKm: 40, amount: 250 }] },
    outstationPerKm: { type: Number, default: 0 }, // beyond the last slab: 0 = not serviceable
    distanceUnderCoverage: { type: Boolean, default: true }, // warranty/AMC/CMC customers still pay the distance charge
    slotSurcharges: { type: Schema.Types.Mixed, default: () => ({ same_day: 99, urgent: 199, sunday: 149, night: 199 }) },
    urgentWithinHours: { type: Number, default: 3 },
    nightFromHour: { type: Number, default: 20 },
    holidays: { type: [String], default: () => [] }, // 'YYYY-MM-DD', charged like Sunday
    surchargeEngineerShare: { type: Number, default: 70 }, // % of slot surcharges paid to the engineer
    prepaidDiscountPercent: { type: Number, default: 5 }, // on service + add-ons, never on parts
    approvalWindowMinutes: { type: Number, default: 30 }, // a revised quote expires after this
    coverageGraceDays: { type: Number, default: 7 },
    paymentHoldMinutes: { type: Number, default: 15 }, // unpaid prepaid bookings are released after this
    cancellationFreeHours: { type: Number, default: 2 },
    cancellationFee: { type: Number, default: 99 },
    cancellationEngineerShare: { type: Number, default: 70 },
    maxReschedules: { type: Number, default: 2 },
    noShowWaitMinutes: { type: Number, default: 15 },
    noShowUnderCoverage: { type: Boolean, default: true }, // charge the visit even under warranty/AMC/CMC
    lateArrivalMinutes: { type: Number, default: 60 },
    cashLimit: { type: Number, default: 10000 }, // engineers holding more cash than this get no new jobs
    disputesEnabled: { type: Boolean, default: true }, // customers can report a problem after a visit
    disputeWindowDays: { type: Number, default: 7 },
    minWithdrawal: { type: Number, default: 500 }, // ₹, engineers and service companies
    repeatVisitDays: { type: Number, default: 30 },
    inspectionValidDays: { type: Number, default: 30 },
    planFullRefundDays: { type: Number, default: 7 },
    planInspectionAgeMonths: { type: Number, default: 12 },
    planRenewalReminderDays: { type: [Number], default: () => [30, 7] },
  },
  developerSettings: {
    imageUploadProvider: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
  },
}, { timestamps: true, minimize: false });

schema.statics.get = async function get() {
  return (await this.findOne({ key: 'global' })) || this.create({ key: 'global' });
};

module.exports = mongoose.model('Setting', schema);
