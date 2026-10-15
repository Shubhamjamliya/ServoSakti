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
  businessSetup: {
    companyName: { type: String, default: 'Servoshakti' },
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
  developerSettings: {
    imageUploadProvider: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
  },
}, { timestamps: true, minimize: false });

schema.statics.get = async function get() {
  return (await this.findOne({ key: 'global' })) || this.create({ key: 'global' });
};

module.exports = mongoose.model('Setting', schema);
