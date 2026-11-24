const crypto = require('crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectTestDb, dropTestDb } = require('./testDb');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.USE_DEFAULT_OTP = 'true';
// never call Razorpay from tests: no keys = the mock provider
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';

const app = require('../src/app');
const { Admin, Oem, Vendor, Engineer, Customer } = require('../src/models/accounts');
const ServiceRequest = require('../src/models/ServiceRequest');
const ProductPassport = require('../src/models/ProductPassport');
const Payment = require('../src/models/Payment');
const Payout = require('../src/models/Payout');
const PlanSubscription = require('../src/models/PlanSubscription');
const RefundRequest = require('../src/models/RefundRequest');
const { buildBill, distanceCharge, surchargeFor } = require('../src/services/pricing.service');

const api = () => request(app);
const token = (doc, role) => jwt.sign({ id: doc._id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** A weekday (not Sunday) at 11:00 IST, `days` from now, so no Sunday/night surcharge sneaks in. */
const weekdayAt11 = (days = 2) => {
  let t = Date.now() + days * 86400000;
  while (new Date(t + 330 * 60000).getUTCDay() === 0) t += 86400000;
  return `${new Date(t + 330 * 60000).toISOString().slice(0, 10)}T11:00:00+05:30`;
};

jest.setTimeout(180000);

const ctx = {};

beforeAll(async () => {
  await connectTestDb('pricing');
  // accounts are created directly (logins are OTP / email based); tokens are signed the way auth.controller signs them
  const passwordHash = await bcrypt.hash('secret123', 4);
  const admin = await Admin.create({ name: 'Admin', email: 'admin@test.in', passwordHash });
  const oem = await Oem.create({ legalName: 'LG India', phone: '9100000001', authorizedBrands: ['LG'], passwordHash, status: 'approved' });
  const vendor = await Vendor.create({ legalName: 'Cool Care', phone: '9100000002', authorizedBrands: ['LG'], passwordHash, status: 'approved' });
  const engineer = await Engineer.create({ name: 'Ravi', phone: '9100000020', companyId: vendor._id, certifications: [{ brand: 'LG' }], passwordHash, status: 'approved' });
  const c1 = await Customer.create({ name: 'Asha', phone: '9100000010', passwordHash });
  const c2 = await Customer.create({ name: 'Ravi Buyer', phone: '9100000011', passwordHash });
  Object.assign(ctx, {
    admin: token(admin, 'admin'), oem: token(oem, 'oem'), vendor: token(vendor, 'vendor_owner'), engineer: token(engineer, 'engineer'),
    customer: token(c1, 'customer'), customer2: token(c2, 'customer'), vendorId: String(vendor._id), engineerId: String(engineer._id),
  });
  await api().post('/api/companies/authorizations').set(auth(ctx.oem)).send({ vendorId: ctx.vendorId, brands: ['LG'], cities: ['Indore'] }).expect(201);
  await api().post('/api/field/day-start').set(auth(ctx.engineer)).send({ lat: 22.72, lng: 75.86 }).expect(201);

  // pricing catalogue (admin)
  const cat = (path, body) => api().post(`/api/catalog/${path}`).set(auth(ctx.admin)).send(body);
  ctx.s15 = (await cat('subtypes', { category: 'Air Conditioner', name: 'Split AC 1.5 Ton' })).body._id;
  ctx.s20 = (await cat('subtypes', { category: 'Air Conditioner', name: 'Split AC 2 Ton' })).body._id;
  for (const [subtypeId, jobType, price] of [[ctx.s15, 'pm', 599], [ctx.s15, 'breakdown', 699], [ctx.s20, 'pm', 699], [ctx.s20, 'breakdown', 799], [ctx.s15, 'inspection', 199]]) {
    (await cat('price-cards', { subtypeId, jobType, price, visitCharge: 199 })).status === 201 || (() => { throw new Error('price card'); })();
  }
  ctx.pcb = (await cat('parts', { name: 'PCB', price: 3200, coveredBy: ['warranty', 'cmc'] })).body._id;
  ctx.gas = (await cat('parts', { name: 'Gas refill', code: 'GAS', price: 2500, coveredBy: [] })).body._id;
  ctx.amc = (await cat('plans', { name: 'AMC 1.5 Ton', type: 'amc', subtypeId: ctx.s15, price: 2499, pmVisits: 3, waitingDays: 15 })).body._id;

  // OEM catalogue: the model knows its subtype; payout cards per coverage
  ctx.productId = (await api().post('/api/products').set(auth(ctx.oem)).send({ brand: 'LG', model: 'KS-Q18', category: 'Air Conditioner', warrantyMonths: 12, subtypeId: ctx.s15 })).body._id;
  for (const [jobType, warranty] of [['pm', 'non_warranty'], ['breakdown', 'non_warranty'], ['breakdown', 'warranty'], ['pm', 'amc']]) {
    await api().post('/api/rate-cards').set(auth(ctx.oem)).send({ brand: 'LG', jobType, warranty, vendorPayout: 120, engineerPayout: 300, platformFee: 50 }).expect(201);
  }
});
afterAll(dropTestDb);

/** Admin verifies (auto-dispatch offers it) and then assigns our engineer directly. */
async function assignAndCheckIn(srId) {
  await api().patch(`/api/service-requests/${srId}/verify`).set(auth(ctx.admin)).send({}).expect(200);
  await api().post(`/api/dispatch/${srId}/assign`).set(auth(ctx.admin)).send({ engineerId: ctx.engineerId }).expect(200);
  await api().post(`/api/field/${srId}/check-in`).set(auth(ctx.engineer)).send({ lat: 22.7201, lng: 75.8581 }).expect(200);
}

async function evidence(srId) {
  await api().patch(`/api/field/${srId}/report`).set(auth(ctx.engineer)).send({ serialNumber: 'X', workDone: 'Serviced', beforePhotos: ['/a.jpg'], afterPhotos: ['/b.jpg'] }).expect(200);
  const otp = await api().post(`/api/field/${srId}/otp`).set(auth(ctx.engineer)).send({});
  await api().post(`/api/field/${srId}/otp/verify`).set(auth(ctx.engineer)).send({ otp: otp.body.devOtp }).expect(200);
}

const pay = (token, payment) => api().post('/api/payments/verify').set(auth(token)).send({ paymentId: payment.paymentId });

test('bill maths matches the flow document (worked examples, slabs, surcharges)', () => {
  const pricing = { distanceUnderCoverage: true, prepaidDiscountPercent: 5, distanceSlabs: [{ fromKm: 0, toKm: 10, amount: 0 }, { fromKm: 10, toKm: 20, amount: 100 }, { fromKm: 20, toKm: 40, amount: 250 }], slotSurcharges: { same_day: 99, urgent: 199, sunday: 149, night: 199 }, nightFromHour: 20 };
  const base = { gstPercent: 18, pricing, distance: { km: 14, amount: 100 }, paymentMode: 'postpaid' };

  const none = buildBill({ ...base, jobType: 'pm', card: { price: 699, visitCharge: 199 }, surcharge: { kind: 'urgent', amount: 199 }, addOns: [{ _id: 'a', name: 'Jet cleaning', price: 299 }] });
  expect(none.subtotal).toBe(1297);
  expect(none.total).toBe(1530);

  const pcb = [{ partId: 'p', name: 'PCB', qty: 1, price: 3200, coveredBy: ['warranty', 'cmc'] }];
  const amc = buildBill({ ...base, jobType: 'breakdown', repair: true, coverage: 'amc', card: { price: 699, visitCharge: 199 }, parts: pcb });
  expect(amc.total).toBe(3894);
  const cmc = buildBill({ ...base, jobType: 'breakdown', repair: true, coverage: 'cmc', card: { price: 699, visitCharge: 199 }, parts: pcb });
  expect(cmc.total).toBe(118);
  const cmcNoDistance = buildBill({ ...base, pricing: { ...pricing, distanceUnderCoverage: false }, jobType: 'breakdown', repair: true, coverage: 'cmc', card: { price: 699, visitCharge: 199 }, parts: pcb });
  expect(cmcNoDistance.total).toBe(0);
  // physical damage: coverage no longer applies
  expect(buildBill({ ...base, jobType: 'breakdown', repair: true, coverage: 'cmc', damage: true, card: { price: 699, visitCharge: 199 }, parts: pcb }).subtotal).toBe(3999);

  expect(distanceCharge(10, pricing).amount).toBe(0);
  expect(distanceCharge(14, pricing).amount).toBe(100);
  expect(() => distanceCharge(45, pricing)).toThrow(/serviceable/);
  expect(distanceCharge(45, { ...pricing, outstationPerKm: 10 }).amount).toBe(450);

  const sunday = '2026-11-29T11:00:00+05:30';
  expect(surchargeFor('scheduled', sunday, pricing)).toEqual({ kind: 'sunday', amount: 149 });
  expect(surchargeFor('urgent', sunday, pricing)).toEqual({ kind: 'urgent', amount: 199 }); // only the highest applies
  expect(surchargeFor('scheduled', '2026-11-30T21:00:00+05:30', pricing)).toEqual({ kind: 'night', amount: 199 });
  expect(surchargeFor('scheduled', '2026-11-30T11:00:00+05:30', pricing)).toBeNull();
});

test('booking: estimate, visit prepaid for an unverified product, revised quote approved, cash collected, payout', async () => {
  const passport = await api().post('/api/products/passports').set(auth(ctx.customer)).send({ productId: ctx.productId, serialNumber: 'LG-1', purchaseDate: '2024-01-10' });
  expect(passport.status).toBe(201);
  expect(passport.body.subtypeName).toBe('Split AC 1.5 Ton');
  expect(passport.body.verified).toBe(false);
  ctx.p1 = passport.body._id;

  const body = { passportId: ctx.p1, jobType: 'pm', slot: 'scheduled', scheduledAt: weekdayAt11(), paymentMode: 'postpaid' };
  const est = await api().post('/api/service-requests/estimate').set(auth(ctx.customer)).send(body);
  expect(est.status).toBe(200);
  expect(est.body.coverage).toBe('none');
  expect(est.body.bill.total).toBe(707); // 599 + 18%
  expect(est.body.bill.upfront).toBe(235); // unverified product: visit charge 199 + 18% upfront

  const created = await api().post('/api/service-requests').set(auth(ctx.customer)).send(body);
  expect(created.status).toBe(201);
  expect(created.body.status).toBe('pending_payment');
  expect(created.body.payment.mock).toBe(true);
  expect(created.body.payment.amount).toBe(23500);
  const srId = created.body._id;
  expect((await api().post('/api/service-requests').set(auth(ctx.customer)).send(body)).status).toBe(409); // one open request per product

  await pay(ctx.customer, created.body.payment).expect(200);
  let sr = await ServiceRequest.findById(srId);
  expect(sr.status).toBe('created');
  expect(sr.bill.paid).toBe(235);
  expect(sr.bill.due).toBe(472);

  await assignAndCheckIn(srId);
  await evidence(srId);
  expect((await api().post(`/api/field/${srId}/submit`).set(auth(ctx.engineer)).send({})).body.message).toMatch(/nameplate/);

  // nameplate says 2 Ton: higher price waits for the customer
  const v = await api().post(`/api/field/${srId}/verify-product`).set(auth(ctx.engineer)).send({ nameplatePhoto: '/np.jpg', serialNumber: 'LG-1', subtypeId: ctx.s20 });
  expect(v.status).toBe(200);
  expect(v.body.applied).toBe(false);
  expect(v.body.quote.newTotal).toBe(825);
  expect((await api().post(`/api/field/${srId}/submit`).set(auth(ctx.engineer)).send({})).status).toBe(409);

  await api().post(`/api/service-requests/${srId}/quote`).set(auth(ctx.customer)).send({ decision: 'approve' }).expect(200);
  sr = await ServiceRequest.findById(srId);
  expect(sr.subtypeName).toBe('Split AC 2 Ton');
  expect(sr.bill.total).toBe(825);
  expect(sr.bill.due).toBe(590);
  const p = await ProductPassport.findById(ctx.p1);
  expect(p.verified).toBe(true);
  expect(p.subtypeName).toBe('Split AC 2 Ton'); // the record is corrected for the next booking

  expect((await api().post(`/api/field/${srId}/submit`).set(auth(ctx.engineer)).send({})).status).toBe(402);
  expect((await api().post(`/api/field/${srId}/collect-cash`).set(auth(ctx.engineer)).send({ amount: 100 })).status).toBe(400);
  await api().post(`/api/field/${srId}/collect-cash`).set(auth(ctx.engineer)).send({ amount: 590 }).expect(200);
  await api().post(`/api/field/${srId}/submit`).set(auth(ctx.engineer)).send({}).expect(200);
  await api().patch(`/api/field/${srId}/review`).set(auth(ctx.oem)).send({ decision: 'approved' }).expect(200);

  const payout = await Payout.findOne({ serviceRequestId: srId }).lean();
  expect(payout.cashCollected).toBe(590);
  expect(payout.netPayable).toBe(120 + 300 - 590); // engineer holds more cash than the job pays out
});

test('lower price on site is applied; the difference waits as a refund request; webhook confirms payment', async () => {
  const passport = await api().post('/api/products/passports').set(auth(ctx.customer)).send({ brand: 'LG', serialNumber: 'LG-2', subtypeId: ctx.s20, purchaseDate: new Date().toISOString() });
  expect(passport.status).toBe(201);
  ctx.p2 = passport.body._id;
  const created = await api().post('/api/service-requests').set(auth(ctx.customer)).send({ passportId: ctx.p2, jobType: 'pm', scheduledAt: weekdayAt11(), paymentMode: 'prepaid' });
  expect(created.body.bill.discount).toBe(34.95); // 5% prepaid discount on the service
  expect(created.body.bill.total).toBe(784);
  const srId = created.body._id;

  // Razorpay webhook marks the order paid (signature over the raw body)
  const order = await Payment.findById(created.body.payment.paymentId);
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test_1', order_id: order.orderId } } } });
  const sig = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');
  expect((await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', 'bad').send(raw)).status).toBe(400);
  await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(raw).expect(200);
  expect((await ServiceRequest.findById(srId)).status).toBe('created');

  await assignAndCheckIn(srId);
  const v = await api().post(`/api/field/${srId}/verify-product`).set(auth(ctx.engineer)).send({ nameplatePhoto: '/np.jpg', subtypeId: ctx.s15 });
  expect(v.body.applied).toBe(true);
  const sr = await ServiceRequest.findById(srId);
  expect(sr.bill.total).toBe(671);
  expect(sr.bill.excess).toBe(113); // owed back, but not refunded automatically
  expect(sr.bill.refunded).toBe(0);
  expect(sr.bill.due).toBe(0);
  const rr = await RefundRequest.findOne({ serviceRequestId: srId }).lean();
  expect(rr.amount).toBe(113);
  expect(rr.status).toBe('awaiting_customer');
  expect((await Payment.findById(order._id)).refundedAmount).toBe(0);

  // admin ends the visited job: the customer keeps paying only the visit charge, the rest comes back
  const failed = await api().patch(`/api/field/${srId}/fail`).set(auth(ctx.admin)).send({ reason: 'Customer asked to stop' });
  expect(failed.body.status).toBe('failed');
  expect(failed.body.bill.total).toBe(223);
  expect(failed.body.bill.excess).toBe(784 - 223);
  expect((await RefundRequest.findOne({ serviceRequestId: srId })).amount).toBe(784 - 223); // the same request, updated
});

test('customer rejects the revised price: only the visit charge is kept', async () => {
  const passport = await api().post('/api/products/passports').set(auth(ctx.customer)).send({ brand: 'LG', serialNumber: 'LG-3', subtypeId: ctx.s15 });
  const created = await api().post('/api/service-requests').set(auth(ctx.customer)).send({ passportId: passport.body._id, jobType: 'breakdown', scheduledAt: weekdayAt11(), paymentMode: 'prepaid' });
  expect(created.body.bill.total).toBe(223); // visit 199 − 5% + 18%
  const srId = created.body._id;
  await pay(ctx.customer, created.body.payment).expect(200);
  await assignAndCheckIn(srId);
  await api().post(`/api/field/${srId}/verify-product`).set(auth(ctx.engineer)).send({ nameplatePhoto: '/np.jpg' }).expect(200);
  const parts = await api().put(`/api/field/${srId}/parts`).set(auth(ctx.engineer)).send({ parts: [{ partId: ctx.pcb, qty: 1 }], repair: true });
  expect(parts.body.applied).toBe(false);
  expect(parts.body.quote.newTotal).toBe(4560);

  await api().post(`/api/service-requests/${srId}/quote`).set(auth(ctx.customer)).send({ decision: 'reject' }).expect(200);
  const sr = await ServiceRequest.findById(srId);
  expect(sr.status).toBe('failed');
  expect(sr.bill.total).toBe(223);
  expect(sr.bill.due).toBe(0);
  expect(await Payout.exists({ serviceRequestId: srId })).toBeTruthy();
});

test('AMC: inspection rule, purchase, free PM, waiting period, cancellation refund', async () => {
  // LG-2 has no OEM warranty → inspection first
  let offers = await api().get(`/api/plans/offers?passportId=${ctx.p2}`).set(auth(ctx.customer));
  expect(offers.body.items[0].inspectionRequired).toBe(true);
  expect((await api().post('/api/plans/subscribe').set(auth(ctx.customer)).send({ planId: ctx.amc, passportId: ctx.p2 })).status).toBe(409);

  await ProductPassport.updateOne({ _id: ctx.p2 }, { inspectedAt: new Date(), inspectionFee: 235 });
  offers = await api().get(`/api/plans/offers?passportId=${ctx.p2}`).set(auth(ctx.customer));
  expect(offers.body.items[0].inspectionRequired).toBe(false);
  expect(offers.body.items[0].payable).toBe(2264); // inspection fee adjusted

  const sub = await api().post('/api/plans/subscribe').set(auth(ctx.customer)).send({ planId: ctx.amc, passportId: ctx.p2 });
  expect(sub.status).toBe(201);
  await pay(ctx.customer, sub.body.payment).expect(200);
  const active = await PlanSubscription.findById(sub.body.subscription._id);
  expect(active.status).toBe('active');
  expect(active.breakdownFrom > new Date(Date.now() + 14 * 86400000)).toBe(true);

  const pm = await api().post('/api/service-requests/estimate').set(auth(ctx.customer)).send({ passportId: ctx.p2, jobType: 'pm', scheduledAt: weekdayAt11() });
  expect(pm.body.coverage).toBe('amc');
  expect(pm.body.bill.total).toBe(0);
  const breakdown = await api().post('/api/service-requests/estimate').set(auth(ctx.customer)).send({ passportId: ctx.p2, jobType: 'breakdown', scheduledAt: weekdayAt11() });
  expect(breakdown.body.coverage).toBe('none'); // still in the 15-day waiting period

  await api().post(`/api/plans/subscriptions/${active._id}/cancel`).set(auth(ctx.customer)).send({}).expect(200);
  const cancelled = await PlanSubscription.findById(active._id);
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.refundDue).toBe(2264); // within 7 days, no visit used
  expect((await RefundRequest.findOne({ subscriptionId: active._id })).amount).toBe(2264);
});

test('late cancellation fee becomes a due that blocks the next booking until paid', async () => {
  const created = await api().post('/api/service-requests').set(auth(ctx.customer)).send({ passportId: ctx.p2, jobType: 'pm', scheduledAt: weekdayAt11(), paymentMode: 'postpaid' });
  expect(created.body.status).toBe('created'); // verified product, returning customer: nothing upfront
  const srId = created.body._id;
  await api().patch(`/api/service-requests/${srId}/verify`).set(auth(ctx.admin)).send({}).expect(200);
  await api().post(`/api/dispatch/${srId}/assign`).set(auth(ctx.admin)).send({ engineerId: ctx.engineerId }).expect(200);
  await ServiceRequest.updateOne({ _id: srId }, { scheduledAt: new Date(Date.now() + 3600000) }); // slot is 1 hour away

  const c = await api().patch(`/api/service-requests/${srId}/cancel`).set(auth(ctx.customer)).send({ reason: 'Not home' });
  expect(c.body.cancellation.fee).toBe(99);
  expect(c.body.bill.due).toBe(117);

  const next = await api().post('/api/service-requests').set(auth(ctx.customer)).send({ passportId: ctx.p1, jobType: 'pm', scheduledAt: weekdayAt11() });
  expect(next.status).toBe(402);
  const payRes = await api().post(`/api/service-requests/${srId}/pay`).set(auth(ctx.customer)).send({});
  await pay(ctx.customer, payRes.body.payment).expect(200);
  expect((await ServiceRequest.findById(srId)).bill.due).toBe(0);
  expect((await api().post('/api/service-requests/estimate').set(auth(ctx.customer)).send({ passportId: ctx.p1, jobType: 'pm', scheduledAt: weekdayAt11() })).status).toBe(200);
});

test('second-hand product: duplicate serial becomes an ownership transfer', async () => {
  const dup = await api().post('/api/products/passports').set(auth(ctx.customer2)).send({ brand: 'LG', serialNumber: 'lg-1', subtypeId: ctx.s15 });
  expect(dup.status).toBe(202);
  expect(dup.body.transferRequested).toBe(true);
  expect((await api().patch(`/api/products/passports/${ctx.p1}/transfer`).set(auth(ctx.admin)).send({ decision: 'approve' })).status).toBe(409); // admin needs proof
  const mine = await api().get('/api/products/transfers').set(auth(ctx.customer));
  expect(mine.body.items[0].role).toBe('owner');
  await api().patch(`/api/products/passports/${ctx.p1}/transfer`).set(auth(ctx.customer)).send({ decision: 'approve' }).expect(200);
  const p = await ProductPassport.findById(ctx.p1);
  expect(p.customerPhone).toBe('9100000011');
  expect(p.source).toBe('transferred');
  expect(p.ownerHistory).toHaveLength(1);
});

test('customer-added warranty counts only after admin verifies the invoice', async () => {
  const passport = await api().post('/api/products/passports').set(auth(ctx.customer2)).send({ productId: ctx.productId, serialNumber: 'LG-9', purchaseDate: new Date().toISOString(), invoiceUrl: '/invoice.pdf' });
  expect(passport.body.warrantyVerification).toBe('pending');
  const body = { passportId: passport.body._id, jobType: 'breakdown', scheduledAt: weekdayAt11() };
  expect((await api().post('/api/service-requests/estimate').set(auth(ctx.customer2)).send(body)).body.coverage).toBe('none');
  await api().patch(`/api/products/passports/${passport.body._id}/warranty`).set(auth(ctx.admin)).send({ decision: 'approve' }).expect(200);
  const est = await api().post('/api/service-requests/estimate').set(auth(ctx.customer2)).send(body);
  expect(est.body.coverage).toBe('warranty');
  expect(est.body.bill.total).toBe(0);
});
