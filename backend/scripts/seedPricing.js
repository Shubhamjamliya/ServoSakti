// Seeds everything the pricing flow needs: product types, customer prices, add-ons, parts, AMC/CMC plans, the pricing
// settings, payout rate cards for the demo OEM and the OEM → service company authorisation used by dispatch.
// Safe to re-run: rows are matched by their natural key and updated, nothing is deleted.
// Run `npm run seed:demo` first (it creates the demo accounts on 6261387233).
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Oem, Vendor, Engineer } = require('../src/models/accounts');
const Subtype = require('../src/models/Subtype');
const PriceCard = require('../src/models/PriceCard');
const AddOn = require('../src/models/AddOn');
const Part = require('../src/models/Part');
const Plan = require('../src/models/Plan');
const RateCard = require('../src/models/RateCard');
const Product = require('../src/models/Product');
const Authorization = require('../src/models/Authorization');
const Setting = require('../src/models/Setting');

const PHONE = '6261387233';
const BRANDS = ['Aftenza', 'Voltas', 'Luminous', 'Kirloskar', 'LG', 'Demo'];

// category → product types with their customer prices (₹, before GST): [pm, breakdown labour, installation, uninstallation, inspection], visit charge
const CATALOGUE = {
  'Air Conditioner': [
    ['Split AC 1.0 Ton', [549, 649, 1399, 599, 199], 199],
    ['Split AC 1.5 Ton', [599, 699, 1499, 649, 199], 199],
    ['Split AC 2.0 Ton', [699, 799, 1799, 749, 199], 199],
    ['Window AC 1.5 Ton', [499, 599, 999, 449, 199], 199],
  ],
  Generator: [
    ['DG Set up to 62.5 kVA', [1999, 1499, 4999, 2499, 499], 499],
    ['DG Set 125 kVA', [2999, 1999, 7999, 3499, 699], 699],
  ],
  Inverter: [['Home Inverter up to 1.5 kVA', [399, 449, 699, 299, 149], 149]],
  Pump: [['Monoblock Pump up to 1 HP', [449, 549, 899, 399, 149], 149]],
  'Washing Machine': [
    ['Front Load Washing Machine', [599, 549, 699, 399, 199], 199],
    ['Top Load Washing Machine', [499, 449, 599, 349, 199], 199],
  ],
  Refrigerator: [
    ['Single Door Refrigerator', [449, 499, 399, 299, 199], 199],
    ['Double Door Refrigerator', [549, 599, 499, 349, 199], 199],
  ],
};
const JOBS = ['pm', 'breakdown', 'installation', 'uninstallation', 'inspection'];

// [name, code, unit, price, coveredBy, categories]
const PARTS = [
  ['PCB', 'PCB', 'piece', 3200, ['warranty', 'cmc'], ['Air Conditioner']],
  ['Compressor', 'COMP', 'piece', 8500, ['warranty', 'cmc'], ['Air Conditioner', 'Refrigerator']],
  ['Fan motor', 'FANM', 'piece', 1800, ['warranty', 'cmc'], ['Air Conditioner']],
  ['Capacitor', 'CAP', 'piece', 450, ['warranty', 'cmc'], ['Air Conditioner', 'Pump']],
  ['Gas refill (full)', 'GAS', 'piece', 2500, [], ['Air Conditioner', 'Refrigerator']],
  ['Copper pipe', 'CU', 'ft', 450, [], ['Air Conditioner']],
  ['Outdoor stand', 'STAND', 'piece', 800, [], ['Air Conditioner']],
  ['Drain pipe', 'DRAIN', 'ft', 40, [], ['Air Conditioner']],
  ['AVR', 'AVR', 'piece', 4500, ['warranty', 'cmc'], ['Generator']],
  ['Fuel filter', 'FF', 'piece', 650, [], ['Generator']],
  ['Oil filter', 'OF', 'piece', 550, [], ['Generator']],
  ['Engine oil change', 'OIL', 'set', 3200, [], ['Generator']],
  ['Inverter battery', 'BATT', 'piece', 9500, [], ['Inverter']],
  ['Inverter PCB', 'IPCB', 'piece', 1800, ['warranty', 'cmc'], ['Inverter']],
  ['Impeller', 'IMP', 'piece', 900, ['warranty', 'cmc'], ['Pump']],
  ['Motor rewinding', 'WIND', 'piece', 2200, ['warranty', 'cmc'], ['Pump']],
  ['Drum bearing', 'BRG', 'set', 1600, ['warranty', 'cmc'], ['Washing Machine']],
  ['Inlet valve', 'VALVE', 'piece', 650, ['warranty', 'cmc'], ['Washing Machine']],
  ['Door gasket', 'GASKET', 'piece', 1100, [], ['Refrigerator', 'Washing Machine']],
];

// [name, price, jobTypes, categories]
const ADD_ONS = [
  ['Jet-pump deep cleaning', 299, ['pm'], ['Air Conditioner']],
  ['Anti-rust coil coating', 399, ['pm', 'installation'], ['Air Conditioner']],
  ['Drum descaling', 349, ['pm'], ['Washing Machine']],
  ['Stabiliser health check', 149, [], []],
];

// product type → [AMC price, CMC price, PM visits]
const PLANS = {
  'Split AC 1.0 Ton': [2299, 4499, 3], 'Split AC 1.5 Ton': [2499, 4999, 3], 'Split AC 2.0 Ton': [2999, 5999, 3], 'Window AC 1.5 Ton': [1999, 3999, 3],
  'DG Set up to 62.5 kVA': [8999, 15999, 4], 'DG Set 125 kVA': [12000, 22000, 4],
  'Home Inverter up to 1.5 kVA': [999, 1999, 2], 'Monoblock Pump up to 1 HP': [899, 1799, 2],
  'Front Load Washing Machine': [1499, 2999, 2], 'Top Load Washing Machine': [1299, 2499, 2],
  'Single Door Refrigerator': [1199, 2299, 2], 'Double Door Refrigerator': [1499, 2799, 2],
};

// payout per job type: [vendor, engineer, platform fee]
const PAYOUTS = { pm: [120, 250, 50], breakdown: [150, 300, 60], installation: [300, 500, 100], uninstallation: [150, 300, 50], inspection: [60, 120, 20], other: [100, 200, 40] };
const TRAVEL = [{ fromKm: 0, toKm: 10, amount: 0 }, { fromKm: 10, toKm: 25, amount: 60 }, { fromKm: 25, toKm: 50, amount: 150 }];

// demo OEM models → their product type
const MODEL_TYPES = { 'DG Set 125 kVA': 'DG Set 125 kVA', '1.5 Ton Split AC': 'Split AC 1.5 Ton', 'Zelio 1100 Inverter': 'Home Inverter up to 1.5 kVA', 'Monoblock Pump 1HP': 'Monoblock Pump up to 1 HP' };

const upsert = async (Model, key, doc) => Model.findOneAndUpdate(key, { $set: { ...key, ...doc } }, { upsert: true, new: true, setDefaultsOnInsert: true });

async function seedPricing() {
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

  // product types + customer prices
  const types = {};
  for (const [category, list] of Object.entries(CATALOGUE)) {
    for (const [i, [name, prices, visitCharge]] of list.entries()) {
      const st = await upsert(Subtype, { category, name }, { sortOrder: i, active: true });
      types[name] = st;
      bump('product types');
      // "Other" services are priced like breakdown labour
      for (const [jobType, price] of [...JOBS.map((job, j) => [job, prices[j]]), ['other', prices[1]]]) {
        await upsert(PriceCard, { subtypeId: st._id, jobType, brand: '' }, { price, visitCharge, active: true });
        bump('customer prices');
      }
    }
  }
  const idsFor = (categories) => Object.values(types).filter((t) => categories.includes(t.category)).map((t) => t._id);

  for (const [name, code, unit, price, coveredBy, categories] of PARTS) {
    await upsert(Part, { name }, { code, unit, price, coveredBy, partWarrantyDays: 90, subtypeIds: idsFor(categories), active: true });
    bump('parts');
  }
  for (const [name, price, jobTypes, categories] of ADD_ONS) {
    await upsert(AddOn, { name }, { price, jobTypes, subtypeIds: idsFor(categories), active: true });
    bump('add-ons');
  }
  for (const [typeName, [amc, cmc, pmVisits]] of Object.entries(PLANS)) {
    const st = types[typeName];
    await upsert(Plan, { name: `AMC ${typeName} – 1 year` }, { type: 'amc', subtypeId: st._id, durationMonths: 12, price: amc, pmVisits, waitingDays: 15, seller: 'platform', transferable: true, active: true });
    await upsert(Plan, { name: `CMC ${typeName} – 1 year` }, { type: 'cmc', subtypeId: st._id, durationMonths: 12, price: cmc, pmVisits, waitingDays: 15, seller: 'platform', transferable: true, active: true });
    counts.plans = (counts.plans || 0) + 2;
  }

  // pricing settings: write the defaults once if this database predates them (admin edits are kept)
  await Setting.get();
  const raw = await Setting.collection.findOne({ key: 'global' });
  if (!raw.pricing) {
    const defaults = new Setting().toObject().pricing;
    await Setting.collection.updateOne({ key: 'global' }, { $set: { pricing: defaults } });
    counts['pricing settings'] = 1;
  }

  // demo network: OEM, service company and engineers handle these brands in Indore
  const oem = await Oem.findOne({ phone: PHONE });
  const vendor = await Vendor.findOne({ phone: PHONE });
  if (oem && vendor) {
    await Oem.updateOne({ _id: oem._id }, { $addToSet: { authorizedBrands: { $each: BRANDS } } });
    await Vendor.updateOne({ _id: vendor._id }, { $addToSet: { authorizedBrands: { $each: BRANDS }, serviceAreas: 'Indore' } });
    await upsert(Authorization, { oemId: oem._id, vendorId: vendor._id }, { brands: BRANDS, cities: ['Indore'], status: 'active', backup: false });
    const certs = BRANDS.map((brand) => ({ brand }));
    await Engineer.updateMany({ companyId: vendor._id }, { $set: { certifications: certs, status: 'approved', active: true, available: true } });

    for (const brand of BRANDS) {
      for (const [jobType, [vendorPayout, engineerPayout, platformFee]] of Object.entries(PAYOUTS)) {
        for (const warranty of ['warranty', 'non_warranty', 'amc', 'cmc']) {
          await upsert(RateCard, { oemId: oem._id, brand, jobType, warranty, subtypeId: null }, { vendorPayout, engineerPayout, platformFee, distanceSlabs: TRAVEL, active: true });
          bump('payout rate cards');
        }
      }
    }
    // the demo OEM's models know their product type
    for (const [model, typeName] of Object.entries(MODEL_TYPES)) {
      const r = await Product.updateMany({ oemId: oem._id, model }, { $set: { subtypeId: types[typeName]._id } });
      if (r.modifiedCount) counts['models linked'] = (counts['models linked'] || 0) + r.modifiedCount;
    }
  } else {
    console.warn('Demo OEM / service company not found — run `npm run seed:demo` to add rate cards and authorisation.');
  }
  return { counts, types };
}

module.exports = seedPricing;

if (require.main === module) {
  (async () => {
    await connectDB();
    const { counts } = await seedPricing();
    console.log('Pricing seeded:', Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
    await mongoose.disconnect();
  })().catch((e) => { console.error(e); process.exit(1); });
}
