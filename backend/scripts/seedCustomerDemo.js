// Fills the demo customer (phone 6261387233) with products, service requests in every status, bills, payments, an AMC,
// a revised price waiting for approval, a transfer request and notifications, so each state of the customer, engineer
// and admin apps can be checked. Safe to re-run: only this customer's own records are replaced.
// Run `npm run seed:demo` first (it creates the accounts). The pricing catalogue is seeded here too.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const seedPricing = require('./seedPricing');
const { Oem, Vendor, Engineer, Customer } = require('../src/models/accounts');
const ProductPassport = require('../src/models/ProductPassport');
const Product = require('../src/models/Product');
const ServiceRequest = require('../src/models/ServiceRequest');
const FieldReport = require('../src/models/FieldReport');
const Notification = require('../src/models/Notification');
const Payment = require('../src/models/Payment');
const Plan = require('../src/models/Plan');
const PlanSubscription = require('../src/models/PlanSubscription');
const Dispute = require('../src/models/Dispute');
const Counter = require('../src/models/Counter');
const Setting = require('../src/models/Setting');
const { detectZone } = require('../src/services/zone.service');
const { buildBill, withPayments, findPriceCard } = require('../src/services/pricing.service');

const PHONE = '6261387233';
const NAME = 'Ratnesh Ranve';
const DAY = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * DAY - h * 3600000);
const ahead = (d) => new Date(Date.now() + d * DAY);
const tomorrowAt11 = () => {
  const ist = new Date(Date.now() + DAY + 330 * 60000).toISOString().slice(0, 10);
  return new Date(`${ist}T11:00:00+05:30`);
};
const LOCATION = { lat: 22.7533, lng: 75.8937 }; // Vijay Nagar, Indore

const PRODUCTS = [
  { brand: 'Aftenza', model: 'DG Set 125 kVA', serialNumber: 'DG987654', category: 'Generator', type: 'DG Set 125 kVA', img: 'dg-set', bought: ago(200), months: 24 }, // in warranty
  { brand: 'Voltas', model: '1.5 Ton Split AC', serialNumber: 'AC554210', category: 'Air Conditioner', type: 'Split AC 1.5 Ton', img: 'air-conditioner', bought: ago(345), months: 12 }, // expiring soon + AMC
  { brand: 'Luminous', model: 'Zelio 1100 Inverter', serialNumber: 'INV220871', category: 'Inverter', type: 'Home Inverter up to 1.5 kVA', img: 'inverter', bought: ago(900), months: 24 }, // expired
  { brand: 'Kirloskar', model: 'Monoblock Pump 1HP', serialNumber: 'WP771903', category: 'Pump', type: 'Monoblock Pump up to 1 HP', img: 'water-pump', bought: ago(30), months: 36 }, // in warranty, new
  // bought elsewhere, added by the customer: warranty waits for the invoice check, product type not yet checked on site
  { brand: 'LG', model: 'LG 2 Ton Dual Inverter AC', serialNumber: 'LGAC20887', category: 'Air Conditioner', type: 'Split AC 2.0 Ton', img: 'air-conditioner', bought: ago(20), months: 12, selfAdded: true },
];

(async () => {
  await connectDB();
  const customer = await Customer.findOne({ phone: PHONE });
  const oem = await Oem.findOne({ phone: PHONE });
  const vendor = await Vendor.findOne({ phone: PHONE });
  if (!customer || !oem || !vendor) throw new Error('Run `npm run seed:demo` first');

  const { counts, types } = await seedPricing();
  const settings = await Setting.get();
  await Setting.updateOne({ key: 'global', 'businessSetup.companyName': { $in: [null, '', 'Servoshakti'] } }, { $set: { 'businessSetup.companyName': 'Aftenza' } });

  // engineers: the demo login (6261387233) gets the live jobs; Amit and Rohit did the older ones
  const passwordHash = await bcrypt.hash('admin@123', 10);
  const certifications = ['Aftenza', 'Voltas', 'Luminous', 'Kirloskar', 'LG', 'Demo'].map((brand) => ({ brand }));
  const helpers = [];
  for (const [name, phone] of [['Amit Sharma', '9000000001'], ['Rohit Verma', '9000000002']]) {
    await Engineer.updateOne({ phone }, { $set: { name, phone, passwordHash, companyId: vendor._id, engineerType: 'company', city: 'Indore', serviceTerritories: ['Indore'], certifications, status: 'approved', active: true } }, { upsert: true });
    helpers.push(await Engineer.findOne({ phone }));
  }
  const demoEngineer = await Engineer.findOne({ phone: PHONE });
  const [amit, rohit] = helpers;

  const zone = await detectZone(LOCATION.lat, LOCATION.lng);
  const address = { label: 'Home', line: '42, Vijay Nagar', landmark: 'Near Treasure Island Mall', city: 'Indore', state: 'Madhya Pradesh', pincode: '452010', ...LOCATION, zoneId: zone?._id, zoneName: zone?.name, isDefault: true };
  await Customer.updateOne({ _id: customer._id }, { $set: { name: NAME, email: 'ratnesh@example.com', addresses: [address] } });
  const fullAddress = `${address.line}, ${address.landmark}, ${address.city} ${address.pincode}`;

  // replace this customer's earlier demo records
  const oldSrs = await ServiceRequest.find({ customerId: customer._id }).select('_id').lean();
  await Promise.all([
    ProductPassport.deleteMany({ customerId: customer._id }),
    ServiceRequest.deleteMany({ customerId: customer._id }),
    FieldReport.deleteMany({ serviceRequestId: { $in: oldSrs.map((s) => s._id) } }),
    Payment.deleteMany({ customerId: customer._id }),
    PlanSubscription.deleteMany({ customerId: customer._id }),
    Dispute.deleteMany({ customerId: customer._id }),
    Notification.deleteMany({ userId: customer._id }),
  ]);

  /* ---- products ---- */
  const passports = [];
  for (const p of PRODUCTS) {
    const subtype = types[p.type];
    let catalog = null;
    if (!p.selfAdded) {
      catalog = await Product.findOne({ oemId: oem._id, brand: p.brand, model: p.model });
      if (!catalog) catalog = await Product.create({ oemId: oem._id, brand: p.brand, model: p.model, category: p.category, warrantyMonths: p.months, subtypeId: subtype._id });
    }
    const end = new Date(p.bought); end.setMonth(end.getMonth() + p.months);
    passports.push(await ProductPassport.create({
      customerId: customer._id, customerName: NAME, customerPhone: PHONE, productId: catalog?._id,
      warrantyNo: p.selfAdded ? undefined : `WR-${p.serialNumber}`, brand: p.brand, model: p.model, serialNumber: p.serialNumber,
      purchaseDate: p.bought, warrantyStart: p.bought, warrantyEnd: end, images: [`/images/products/${p.img}.png`],
      category: subtype.category, subtypeId: subtype._id, subtypeName: subtype.name,
      source: p.selfAdded ? 'self_added' : 'app', verified: !p.selfAdded, verifiedBy: p.selfAdded ? undefined : amit._id, verifiedAt: p.selfAdded ? undefined : ago(40),
      warrantyVerification: p.selfAdded ? 'pending' : 'approved', invoiceUrl: p.selfAdded ? `/images/products/${p.img}.png` : undefined,
    }));
  }
  const [dg, ac, inverter, pump] = passports;

  /* ---- AMC on the Voltas AC: bought 80 days ago, 1 of 3 PM visits used ---- */
  const amcPlan = await Plan.findOne({ type: 'amc', subtypeId: ac.subtypeId, seller: 'platform' }).lean();
  const amcStart = ago(80);
  const amc = await PlanSubscription.create({
    planId: amcPlan._id, planSnapshot: amcPlan, type: 'amc', passportId: ac._id, customerId: customer._id, serialNumber: ac.serialNumber, brand: ac.brand, model: ac.model,
    price: amcPlan.price, startDate: amcStart, endDate: new Date(amcStart.getTime() + 365 * DAY), breakdownFrom: new Date(amcStart.getTime() + amcPlan.waitingDays * DAY),
    pmVisitsTotal: amcPlan.pmVisits, pmVisitsUsed: 1, status: 'active', remindersSent: ['pm-1'],
  });
  const amcPayment = await Payment.create({ customerId: customer._id, purpose: 'plan', subscriptionId: amc._id, amount: amcPlan.price, provider: 'mock', orderId: `mock_order_${amc._id}`, paymentId: `mock_pay_${amc._id}`, status: 'paid', paidAt: amcStart });
  await PlanSubscription.updateOne({ _id: amc._id }, { paymentId: amcPayment._id });

  /* ---- service requests, each priced with the real pricing engine ---- */
  const gas = await mongoose.model('Part').findOne({ code: 'GAS' }).lean();
  const priced = async (pp, jobType, o = {}) => {
    const card = await findPriceCard(pp.subtypeId, jobType, pp.brand);
    const distance = { km: null, amount: 0 };
    const input = { jobType, coverage: o.coverage || 'none', subscription: o.subscription, card, parts: o.parts || [], distance, surcharge: null, paymentMode: o.paymentMode || 'postpaid', repair: o.repair, visitOnly: o.visitOnly, chargeVisit: o.chargeVisit, gstPercent: settings.gstPercent, pricing: settings.pricing };
    const snapshot = {
      subtypeId: pp.subtypeId, subtypeName: pp.subtypeName, jobType, card: { _id: card._id, price: card.price, visitCharge: card.visitCharge, brand: card.brand },
      addOns: [], distance, surcharge: null, gstPercent: settings.gstPercent,
      pricing: { distanceUnderCoverage: settings.pricing.distanceUnderCoverage, prepaidDiscountPercent: settings.pricing.prepaidDiscountPercent, surchargeEngineerShare: settings.pricing.surchargeEngineerShare },
      repeat: false, coverage: input.coverage, subscriptionId: o.subscription?._id, at: o.created,
    };
    return { bill: buildBill(input), snapshot, input };
  };

  const done = (status) => ['approved', 'closed'].includes(status);
  async function request(pp, r) {
    const created = ago(r.d, 2);
    const priced_ = await priced(pp, r.jobType, { ...r, created });
    const { snapshot } = priced_;
    // a free cancellation bills nothing
    const bill = r.status === 'cancelled' ? { lines: [], subtotal: 0, discount: 0, taxable: 0, gstPercent: settings.gstPercent, gst: 0, total: 0 } : priced_.bill;
    const coverage = r.coverage || 'none';
    const sr = await ServiceRequest.create({
      srNumber: `SR-${1000 + (await Counter.next('sr'))}`,
      customerId: customer._id, customerName: NAME, customerPhone: PHONE,
      passportId: pp._id, oemId: oem._id, vendorId: r.engineer || r.status === 'unassigned' ? vendor._id : undefined, engineerId: r.engineer?._id,
      brand: pp.brand, model: pp.model, serialNumber: pp.serialNumber,
      city: address.city, address: fullAddress, location: LOCATION, zoneId: zone?._id, zoneName: zone?.name,
      jobType: r.jobType, warranty: coverage === 'warranty' ? 'warranty' : 'non_warranty', priority: r.priority || 'Medium', issue: r.issue, origin: 'platform', status: r.status,
      subtypeId: pp.subtypeId, subtypeName: pp.subtypeName, coverage, subscriptionId: r.subscription?._id,
      slot: 'scheduled', scheduledAt: r.scheduledAt || new Date(created.getTime() + DAY), paymentMode: r.paymentMode || 'postpaid',
      parts: r.parts || [], repair: !!r.repair, bill: { ...bill, upfront: r.upfront || 0 }, priceSnapshot: snapshot,
      verification: r.verified ? { nameplatePhoto: pp.images[0], serialNumber: pp.serialNumber, at: new Date(created.getTime() + 3 * 3600000) } : undefined,
      tatDueAt: ahead(2 - r.d), completedAt: done(r.status) || r.status === 'under_review' ? new Date(created.getTime() + 6 * 3600000) : undefined,
      approvedAt: done(r.status) ? new Date(created.getTime() + 9 * 3600000) : undefined, closedAt: r.status === 'closed' ? new Date(created.getTime() + 10 * 3600000) : undefined,
      rating: r.rating, feedback: r.feedback, failReason: r.failReason, quote: r.quote,
      cancellation: r.status === 'cancelled' ? { by: 'customer', at: new Date(created.getTime() + 3600000), fee: 0, reason: 'Fixed it myself' } : undefined,
      createdAt: created, updatedAt: created,
    });
    // what has been paid on it, as Payment records (the bill's paid / due are derived from these)
    for (const [provider, amount] of r.payments || []) {
      if (!(amount > 0)) continue;
      await Payment.create({
        customerId: customer._id, purpose: provider === 'cash' ? 'bill' : 'booking', serviceRequestId: sr._id, amount, provider,
        orderId: provider === 'mock' ? `mock_order_${sr._id}` : undefined, paymentId: provider === 'mock' ? `mock_pay_${sr._id}` : undefined,
        status: 'paid', paidAt: new Date(created.getTime() + 7 * 3600000), collectedBy: provider === 'cash' ? r.engineer?._id : undefined, depositedAt: provider === 'cash' ? ago(Math.max(0, r.d - 1)) : undefined,
      });
    }
    const paid = (r.payments || []).reduce((a, [, amount]) => a + (amount || 0), 0);
    sr.bill = { ...withPayments(sr.bill, paid, 0), upfront: r.upfront || 0 };
    sr.cashCollected = (r.payments || []).filter(([p]) => p === 'cash').reduce((a, [, amount]) => a + amount, 0);
    sr.paymentStatus = sr.bill.total <= 0 ? 'not_required' : sr.bill.due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
    sr.markModified('bill');
    await sr.save();
    if (r.checkedIn || r.status === 'under_review' || done(r.status)) {
      const finished = r.status !== 'in_progress';
      await FieldReport.create({
        serviceRequestId: sr._id, engineerId: r.engineer?._id, serialNumber: pp.serialNumber,
        checkIn: { lat: LOCATION.lat + 0.0004, lng: LOCATION.lng + 0.0003, at: new Date(created.getTime() + 2 * 3600000), distanceKm: 0.1 },
        workDone: finished ? r.workDone || 'Serviced and tested' : undefined, beforePhotos: finished ? [pp.images[0]] : [], afterPhotos: finished ? [pp.images[0]] : [],
        submittedAt: finished ? new Date(created.getTime() + 6 * 3600000) : undefined,
        review: { status: done(r.status) ? 'approved' : 'pending' },
      });
    }
    return sr;
  }

  // a breakdown under AMC: labour free, gas refill is not covered → revised price waits for the customer
  const acState = await priced(ac, 'breakdown', { coverage: 'amc', subscription: amc, repair: true, parts: [{ partId: gas._id, name: gas.name, code: gas.code, unit: gas.unit, qty: 1, price: gas.price, coveredBy: gas.coveredBy, partWarranty: false }] });
  const acQuote = {
    status: 'pending', reason: 'Parts: Gas refill (full) × 1', changes: ['Parts: Gas refill (full) × 1'],
    state: { subtypeId: ac.subtypeId, subtypeName: ac.subtypeName, jobType: 'breakdown', coverage: 'amc', subscriptionId: amc._id, parts: acState.input.parts, repair: true, damage: false },
    bill: acState.bill, oldTotal: 0, newTotal: acState.bill.total, createdAt: ago(0, 0.5), expiresAt: ahead(1),
  };

  const visitPaid = async (pp, jobType) => Math.round((await findPriceCard(pp.subtypeId, jobType, pp.brand)).visitCharge * (1 + settings.gstPercent / 100));
  const pmDg = await priced(dg, 'pm', {});
  const invRepair = await priced(inverter, 'breakdown', { repair: true });
  const pumpVisit = await priced(pump, 'breakdown', { visitOnly: true, chargeVisit: true });

  const REQUESTS = [
    [dg, { status: 'assigned', d: 0, engineer: demoEngineer, jobType: 'pm', issue: 'Quarterly preventive maintenance', scheduledAt: tomorrowAt11() }],
    [dg, { status: 'closed', d: 40, engineer: rohit, jobType: 'pm', issue: 'Scheduled preventive maintenance', priority: 'Low', verified: true, payments: [['cash', pmDg.bill.total]], rating: 5, feedback: 'Quick and professional service.' }],
    [ac, { status: 'in_progress', d: 0, engineer: demoEngineer, jobType: 'breakdown', coverage: 'amc', subscription: amc, issue: 'Not cooling properly', priority: 'High', verified: true, checkedIn: true, quote: acQuote }],
    [ac, { status: 'closed', d: 75, engineer: amit, jobType: 'pm', coverage: 'amc', subscription: amc, issue: 'AMC preventive maintenance visit 1', priority: 'Low', verified: true, rating: 4, feedback: 'Good, arrived slightly late.' }],
    [inverter, { status: 'under_review', d: 4, engineer: amit, jobType: 'breakdown', repair: true, issue: 'Battery not charging', verified: true, payments: [['cash', invRepair.bill.total]], workDone: 'Cleaned terminals, replaced fuse, tested charging' }],
    [inverter, { status: 'cancelled', d: 20, jobType: 'other', issue: 'Display flickering', priority: 'Low' }],
    [pump, { status: 'unassigned', d: 0, jobType: 'breakdown', coverage: 'warranty', issue: 'Low water pressure' }],
    [pump, { status: 'approved', d: 6, engineer: amit, jobType: 'breakdown', coverage: 'warranty', repair: true, issue: 'Motor not starting', verified: true, workDone: 'Replaced capacitor under warranty' }],
    [pump, { status: 'failed', d: 12, engineer: rohit, jobType: 'breakdown', visitOnly: true, chargeVisit: true, issue: 'Pump making noise', failReason: 'Customer not available at the site', payments: [['cash', pumpVisit.bill.total]] }],
  ];
  const srs = [];
  for (const [pp, r] of REQUESTS) srs.push(await request(pp, r));

  // another customer asks to take over the inverter (second-hand sale): approve or reject from My Products
  const buyer = await Customer.findOneAndUpdate({ phone: '9300000001' }, { $set: { name: 'Suresh Patel', phone: '9300000001', active: true }, $setOnInsert: { passwordHash } }, { upsert: true, new: true });
  await ProductPassport.updateOne({ _id: inverter._id }, { transfer: { status: 'pending', requestedBy: buyer._id, requestedName: buyer.name, requestedPhone: buyer.phone, requestedAt: ago(0, 5) } });

  const note = (title, body, type, d, read) => ({ userId: customer._id, role: 'customer', title, body, type, read, createdAt: ago(d), updatedAt: ago(d) });
  await Notification.insertMany([
    note('Approve revised price', `${srs[2].srNumber}: ₹0 → ₹${acQuote.newTotal} (gas refill is not covered by AMC). Approve or reject in the app.`, 'quote', 0.02, false),
    note('Ownership transfer request', 'Suresh Patel wants to take over Luminous Zelio 1100 Inverter (INV220871). Approve or reject in My Products.', 'transfer', 0.2, false),
    note('Engineer assigned', `Demo Engineer will visit tomorrow for your DG Set PM (${srs[0].srNumber}).`, 'assigned', 0.3, false),
    note('Warranty expiring soon', 'Voltas 1.5 Ton Split AC warranty ends in under 30 days. Your AMC keeps labour free.', 'warranty', 0.5, false),
    note('Warranty verification needed', 'We are checking the invoice for your LG 2 Ton AC.', 'warranty', 1, true),
    note('Service completed', `${srs[7].srNumber} is complete — please rate the service.`, 'service', 5, false),
    note('AMC activated', `AMC for Voltas 1.5 Ton Split AC is active until ${amc.endDate.toLocaleDateString('en-IN')}.`, 'plan', 80, true),
  ]);

  console.log('Pricing:', Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
  console.log(`Customer ${PHONE}: ${passports.length} products, ${srs.length} service requests (${srs.map((s) => `${s.srNumber} ${s.status}`).join(', ')}), 1 active AMC, 1 transfer request, 7 notifications.`);
  console.log(`Zone for the home address: ${zone?.name || 'none (no zone covers it — add one in Service Zones or turn off the service-area check)'}`);
  console.log(`Logins: customer / engineer / service company ${PHONE} (OTP), OEM ${PHONE} / admin@123, admin admin@gmail.com / admin@123`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
