// Money end to end: coupons, wallets, refunds (customer chooses, admin approves), cash on site, payouts, service
// company cash handover + deposit, withdrawals, disputes — plus double clicks / retries (idempotency) and races.
const crypto = require('crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectTestDb, dropTestDb } = require('./testDb');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.USE_DEFAULT_OTP = 'true';
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';

const app = require('../src/app');
const { Admin, Oem, Vendor, Engineer, Customer } = require('../src/models/accounts');
const ServiceRequest = require('../src/models/ServiceRequest');
const ProductPassport = require('../src/models/ProductPassport');
const Payment = require('../src/models/Payment');
const Payout = require('../src/models/Payout');
const Wallet = require('../src/models/Wallet');
const WalletTxn = require('../src/models/WalletTxn');
const Coupon = require('../src/models/Coupon');
const RefundRequest = require('../src/models/RefundRequest');
const Setting = require('../src/models/Setting');

const api = () => request(app);
const token = (doc, role) => jwt.sign({ id: doc._id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};
const CENTER = { lat: 22.72, lng: 75.86 };

/** Wallet balance / cash held in rupees. */
const walletOf = async (ownerType, ownerId) => {
  const w = await Wallet.findOne({ ownerType, ownerId }).lean();
  return { balance: (w?.balance || 0) / 100, cashHeld: (w?.cashHeld || 0) / 100 };
};
const weekdayAt11 = (days = 2) => {
  let t = Date.now() + days * 86400000;
  while (new Date(t + 330 * 60000).getUTCDay() === 0) t += 86400000;
  return `${new Date(t + 330 * 60000).toISOString().slice(0, 10)}T11:00:00+05:30`;
};

jest.setTimeout(240000);

beforeAll(async () => {
  await connectTestDb('money');
  const passwordHash = await bcrypt.hash('x', 4);
  const admin = await Admin.create({ name: 'Admin', email: 'm@test.in', passwordHash });
  const oem = await Oem.create({ legalName: 'LG India', phone: '9300000001', authorizedBrands: ['LG'], passwordHash, status: 'approved' });
  const vendor = await Vendor.create({ legalName: 'Cool Care', phone: '9300000002', authorizedBrands: ['LG'], passwordHash, status: 'approved' });
  const engineer = await Engineer.create({ name: 'Ravi', phone: '9300000020', companyId: vendor._id, certifications: [{ brand: 'LG' }], passwordHash, status: 'approved' });
  const home = { label: 'Home', line: '1 MG Road', city: 'Indore', lat: CENTER.lat, lng: CENTER.lng, isDefault: true };
  const far = { label: 'Far', line: 'Outskirts', city: 'Indore', lat: CENTER.lat + 0.12, lng: CENTER.lng, isDefault: false }; // ~13 km from the zone centre
  const c1 = await Customer.create({ name: 'Asha', phone: '9300000010', passwordHash, addresses: [home, far] });
  const c2 = await Customer.create({ name: 'Bina', phone: '9300000011', passwordHash, addresses: [home] });
  const c3 = await Customer.create({ name: 'Chetan', phone: '9300000012', passwordHash, addresses: [home] });
  Object.assign(ctx, {
    admin: token(admin, 'admin'), oem: token(oem, 'oem'), vendor: token(vendor, 'vendor_owner'), engineer: token(engineer, 'engineer'),
    c1: token(c1, 'customer'), c2: token(c2, 'customer'), c3: token(c3, 'customer'),
    c1Id: c1._id, vendorId: vendor._id, engineerId: engineer._id, farAddressId: String(c1.addresses[1]._id),
  });

  // Indore zone: a square around the centre (distance is measured from its centre)
  await api().post('/api/zones').set(auth(ctx.admin)).send({ name: 'Indore', city: 'Indore', coordinates: [
    { latitude: CENTER.lat - 0.2, longitude: CENTER.lng - 0.2 }, { latitude: CENTER.lat - 0.2, longitude: CENTER.lng + 0.2 },
    { latitude: CENTER.lat + 0.2, longitude: CENTER.lng + 0.2 }, { latitude: CENTER.lat + 0.2, longitude: CENTER.lng - 0.2 },
  ] }).expect(201);
  await api().post('/api/companies/authorizations').set(auth(ctx.oem)).send({ vendorId: String(vendor._id), brands: ['LG'], cities: ['Indore'] }).expect(201);

  const cat = (path, body) => api().post(`/api/catalog/${path}`).set(auth(ctx.admin)).send(body);
  ctx.s15 = (await cat('subtypes', { category: 'Air Conditioner', name: 'Split AC 1.5 Ton' })).body._id;
  await cat('price-cards', { subtypeId: ctx.s15, jobType: 'pm', price: 599, visitCharge: 199 }).expect(201);
  await cat('price-cards', { subtypeId: ctx.s15, jobType: 'breakdown', price: 699, visitCharge: 199 }).expect(201);
  await api().post('/api/rate-cards').set(auth(ctx.oem)).send({ brand: 'LG', jobType: 'pm', warranty: 'non_warranty', vendorPayout: 120, engineerPayout: 300, platformFee: 50 }).expect(201);

  // verified products so only coupon / wallet rules decide the upfront amount
  const mk = (customer, serial) => ProductPassport.create({ customerId: customer._id, customerName: customer.name, customerPhone: customer.phone, brand: 'LG', serialNumber: serial, subtypeId: ctx.s15, subtypeName: 'Split AC 1.5 Ton', verified: true, warrantyVerification: 'none', source: 'self_added' });
  ctx.p1 = String((await mk(c1, 'M-1'))._id);
  ctx.p1b = String((await mk(c1, 'M-1B'))._id);
  ctx.p1c = String((await mk(c1, 'M-1C'))._id);
  ctx.p2 = String((await mk(c2, 'M-2'))._id);
  ctx.p3 = String((await mk(c3, 'M-3'))._id);

  await api().post('/api/coupons').set(auth(ctx.admin)).send({ code: 'welcome10', title: '10% off first booking', type: 'percent', value: 10, maxDiscount: 100, minOrder: 300, firstBookingOnly: true }).expect(201);
  await api().post('/api/coupons').set(auth(ctx.admin)).send({ code: 'FLAT50', title: 'Flat 50', type: 'flat', value: 50, minOrder: 500, usageLimit: 1 }).expect(201);
  await api().post('/api/coupons').set(auth(ctx.admin)).send({ code: 'BIG', title: 'Big order only', type: 'flat', value: 100, minOrder: 5000 }).expect(201);
});
afterAll(dropTestDb);

const pay = (t, payment) => api().post('/api/payments/verify').set(auth(t)).send({ paymentId: payment.paymentId });

test('coupon + prepaid discount + distance + GST: every rupee as specified', async () => {
  const body = { passportId: ctx.p1, addressId: ctx.farAddressId, jobType: 'pm', scheduledAt: weekdayAt11(), paymentMode: 'prepaid', couponCode: 'WELCOME10' };
  const est = await api().post('/api/service-requests/estimate').set(auth(ctx.c1)).send(body);
  expect(est.status).toBe(200);
  const b = est.body.bill;
  expect(b.lines.map((l) => [l.kind, l.amount])).toEqual([['service', 599], ['distance', 100]]);
  expect(b.prepaidDiscount).toBe(29.95);   // 5% of 599
  expect(b.couponDiscount).toBe(56.91);    // 10% of (599 − 29.95) = 56.905 → 56.91
  expect(b.discount).toBe(86.86);
  expect(b.taxable).toBe(612.14);          // 699 − 86.86
  expect(b.gst).toBe(110.19);              // 18% of 612.14 = 110.1852
  expect(b.total).toBe(722);               // 722.33 rounded
  expect(b.upfront).toBe(722);

  // a coupon that does not fit shows a message on the estimate and refuses the booking
  const big = await api().post('/api/service-requests/estimate').set(auth(ctx.c1)).send({ ...body, couponCode: 'BIG' });
  expect(big.body.couponError).toBeUndefined(); // valid code; just below its minimum…
  expect(big.body.bill.couponDiscount).toBe(0);
  expect(big.body.bill.couponNote).toMatch(/5000/);
  const bad = await api().post('/api/service-requests/estimate').set(auth(ctx.c1)).send({ ...body, couponCode: 'NOPE' });
  expect(bad.body.couponError).toMatch(/not valid/);
  expect((await api().post('/api/service-requests').set(auth(ctx.c1)).send({ ...body, couponCode: 'NOPE' })).status).toBe(400);

  const created = await api().post('/api/service-requests').set(auth(ctx.c1)).send(body);
  expect(created.status).toBe(201);
  expect(created.body.payment.amount).toBe(72200);
  ctx.srCoupon = created.body._id;
  await pay(ctx.c1, created.body.payment).expect(200);
  expect((await Coupon.findOne({ code: 'WELCOME10' })).usedCount).toBe(1);

  // the same customer cannot use it again
  const again = await api().post('/api/service-requests/estimate').set(auth(ctx.c1)).send({ ...body, passportId: ctx.p1b });
  expect(again.body.couponError).toMatch(/already used|first booking/);
});

test('cancel before the visit: coupon use returned, refund waits for customer choice and admin approval (once)', async () => {
  const sr = ctx.srCoupon;
  await api().patch(`/api/service-requests/${sr}/cancel`).set(auth(ctx.c1)).send({ reason: 'Plans changed' }).expect(200);
  expect((await Coupon.findOne({ code: 'WELCOME10' })).usedCount).toBe(0);
  const doc = await ServiceRequest.findById(sr).lean();
  expect(doc.bill.total).toBe(0);
  expect(doc.bill.excess).toBe(722);
  expect((await Payment.findOne({ serviceRequestId: sr, status: 'paid' })).refundedAmount).toBe(0); // nothing automatic

  const list = await api().get('/api/refunds').set(auth(ctx.c1));
  const rr = list.body.items.find((r) => String(r.serviceRequestId) === sr);
  expect(rr.status).toBe('awaiting_customer');
  expect(rr.sourceRefundable).toBe(722);
  expect((await api().patch(`/api/refunds/${rr._id}/decide`).set(auth(ctx.admin)).send({ decision: 'approve' })).status).toBe(409); // customer must choose first

  await api().patch(`/api/refunds/${rr._id}/choose`).set(auth(ctx.c1)).send({ destination: 'source' }).expect(200);
  // two approve clicks at once: exactly one moves the money
  const [a, b] = await Promise.all([
    api().patch(`/api/refunds/${rr._id}/decide`).set(auth(ctx.admin)).send({ decision: 'approve' }),
    api().patch(`/api/refunds/${rr._id}/decide`).set(auth(ctx.admin)).send({ decision: 'approve' }),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  const p = await Payment.findOne({ serviceRequestId: sr, status: 'paid' });
  expect(p.refundedAmount).toBe(722);
  const after = await ServiceRequest.findById(sr).lean();
  expect(after.bill.refunded).toBe(722);
  expect(after.bill.excess).toBe(0);
  expect((await RefundRequest.findById(rr._id)).status).toBe('completed');
});

test('wallet: admin credit is idempotent, pays a booking, and refunds can go back to the wallet', async () => {
  const requestId = crypto.randomUUID();
  for (let i = 0; i < 2; i += 1) {
    await api().post('/api/wallet/adjust').set(auth(ctx.admin)).send({ ownerType: 'customer', ownerId: String(ctx.c1Id), direction: 'credit', amount: 500, note: 'Goodwill', requestId }).expect(200);
  }
  expect((await walletOf('customer', ctx.c1Id)).balance).toBe(500); // second submit was a no-op

  // urgent slot on a first booking: surcharge 199 + visit charge 199 must be prepaid = 398 × 1.18 = 469.64 → 470.
  // The wallet covers it, so no Razorpay checkout at all.
  const created = await api().post('/api/service-requests').set(auth(ctx.c1)).send({ passportId: ctx.p1b, jobType: 'pm', slot: 'urgent', paymentMode: 'postpaid', useWallet: true });
  expect(created.status).toBe(201);
  expect(created.body.bill.upfront).toBe(470);
  expect(created.body.payment).toBeNull();
  expect(created.body.status).toBe('created'); // confirmed straight away
  expect((await walletOf('customer', ctx.c1Id)).balance).toBe(30);
  expect(created.body.bill.paid).toBe(470);
  ctx.srWallet = created.body._id;

  // wallet smaller than the amount: wallet part + Razorpay for the rest; confirmed only once both are in
  await api().post('/api/wallet/adjust').set(auth(ctx.admin)).send({ ownerType: 'customer', ownerId: String(ctx.c1Id), direction: 'credit', amount: 70, note: 'Test', requestId: crypto.randomUUID() }).expect(200);
  const part = await api().post('/api/service-requests').set(auth(ctx.c1)).send({ passportId: ctx.p1c, jobType: 'pm', paymentMode: 'prepaid', scheduledAt: weekdayAt11(), useWallet: true });
  expect(part.body.bill.upfront).toBe(671); // prepaid: (599 − 29.95) = 569.05 + 18% (102.43) = 671.48 → 671
  expect(part.body.status).toBe('pending_payment');
  expect(part.body.payment.amount).toBe((part.body.bill.upfront - 100) * 100); // 100 came from the wallet
  expect((await walletOf('customer', ctx.c1Id)).balance).toBe(0);
  await pay(ctx.c1, part.body.payment).expect(200);
  expect((await ServiceRequest.findById(part.body._id)).status).toBe('created');

  // cancel the urgent one: 470 owed back; this time to the wallet
  await api().patch(`/api/service-requests/${ctx.srWallet}/cancel`).set(auth(ctx.c1)).send({ reason: 'x' }).expect(200);
  const rr = (await api().get('/api/refunds').set(auth(ctx.c1))).body.items.find((r) => String(r.serviceRequestId) === ctx.srWallet);
  expect(rr.amount).toBe(470);
  await api().patch(`/api/refunds/${rr._id}/choose`).set(auth(ctx.c1)).send({ destination: 'wallet' }).expect(200);
  await api().patch(`/api/refunds/${rr._id}/decide`).set(auth(ctx.admin)).send({ decision: 'approve' }).expect(200);
  expect((await walletOf('customer', ctx.c1Id)).balance).toBe(470);
  const kinds = (await WalletTxn.find({ ownerType: 'customer', ownerId: ctx.c1Id }).sort({ createdAt: 1 }).lean()).map((t) => t.kind);
  expect(kinds).toEqual(['adjustment', 'wallet_payment', 'adjustment', 'wallet_payment', 'refund']);
});

test('cash on site → payout → service company takes the cash → deposits it → engineer withdraws', async () => {
  // a priced visit, paid in cash on site
  const created = await api().post('/api/service-requests').set(auth(ctx.c2)).send({ passportId: ctx.p2, jobType: 'pm', scheduledAt: weekdayAt11(), paymentMode: 'postpaid' });
  expect(created.body.bill.upfront).toBe(235); // first booking: visit charge 199 + 18% prepaid
  await pay(ctx.c2, created.body.payment).expect(200);
  const sr = created.body._id;
  expect((await ServiceRequest.findById(sr)).status).toBe('created');
  ctx.srCash = sr;
  await api().patch(`/api/service-requests/${sr}/verify`).set(auth(ctx.admin)).send({}).expect(200);
  await api().post(`/api/dispatch/${sr}/assign`).set(auth(ctx.admin)).send({ engineerId: String(ctx.engineerId) }).expect(200);
  await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: true, ...CENTER }).expect(200);
  await api().post(`/api/field/${sr}/check-in`).set(auth(ctx.engineer)).send(CENTER).expect(200);
  await api().post(`/api/field/${sr}/verify-product`).set(auth(ctx.engineer)).send({ nameplatePhoto: '/np.jpg' }).expect(200);
  await api().patch(`/api/field/${sr}/report`).set(auth(ctx.engineer)).send({ serialNumber: 'M-2', workDone: 'PM done', beforePhotos: ['/a.jpg'], afterPhotos: ['/b.jpg'] }).expect(200);
  const otp = await api().post(`/api/field/${sr}/otp`).set(auth(ctx.engineer)).send({});
  await api().post(`/api/field/${sr}/otp/verify`).set(auth(ctx.engineer)).send({ otp: otp.body.devOtp }).expect(200);

  const bill = (await ServiceRequest.findById(sr).lean()).bill;
  expect(bill.total).toBe(707); // 599 × 1.18 = 706.82
  expect(bill.due).toBe(472);   // 707 − 235 prepaid
  // two taps on "collected": the second finds nothing due
  const [x, y] = await Promise.all([
    api().post(`/api/field/${sr}/collect-cash`).set(auth(ctx.engineer)).send({ amount: 472 }),
    api().post(`/api/field/${sr}/collect-cash`).set(auth(ctx.engineer)).send({ amount: 472 }),
  ]);
  expect([x.status, y.status].filter((s) => s === 200)).toHaveLength(1);
  expect(await Payment.countDocuments({ serviceRequestId: sr, provider: 'cash' })).toBe(1);
  expect(await walletOf('engineer', ctx.engineerId)).toEqual({ balance: -472, cashHeld: 472 });

  await api().post(`/api/field/${sr}/submit`).set(auth(ctx.engineer)).send({}).expect(200);
  await api().patch(`/api/field/${sr}/review`).set(auth(ctx.oem)).send({ decision: 'approved' }).expect(200);

  // payout approval credits both wallets once, however many times it is clicked
  const payout = await Payout.findOne({ serviceRequestId: sr }).lean();
  expect(payout.engineerAmount).toBe(300);
  expect(payout.vendorAmount).toBe(120);
  await Promise.all([1, 2, 3].map(() => api().patch(`/api/settlements/payouts/${payout._id}`).set(auth(ctx.admin)).send({ action: 'approve' })));
  expect(await walletOf('engineer', ctx.engineerId)).toEqual({ balance: -172, cashHeld: 472 });
  expect(await walletOf('vendor', ctx.vendorId)).toEqual({ balance: 120, cashHeld: 0 });

  // service company receives the engineer's cash
  const h = await api().post('/api/wallet/cash/handover').set(auth(ctx.vendor)).send({ engineerId: String(ctx.engineerId) });
  expect(h.body.amount).toBe(472);
  expect((await api().post('/api/wallet/cash/handover').set(auth(ctx.vendor)).send({ engineerId: String(ctx.engineerId) })).status).toBe(409);
  expect(await walletOf('engineer', ctx.engineerId)).toEqual({ balance: 300, cashHeld: 0 });
  expect(await walletOf('vendor', ctx.vendorId)).toEqual({ balance: -352, cashHeld: 472 });

  // ...and deposits it to the platform; the admin confirms once
  expect((await api().post('/api/wallet/cash/deposits').set(auth(ctx.vendor)).send({ amount: 800, reference: 'UTR1' })).status).toBe(400); // more than held
  const dep = await api().post('/api/wallet/cash/deposits').set(auth(ctx.vendor)).send({ amount: 472, reference: 'UTR1', method: 'bank' });
  expect(dep.status).toBe(201);
  await api().patch(`/api/wallet/cash/deposits/${dep.body._id}`).set(auth(ctx.admin)).send({ decision: 'confirm' }).expect(200);
  expect((await api().patch(`/api/wallet/cash/deposits/${dep.body._id}`).set(auth(ctx.admin)).send({ decision: 'confirm' })).status).toBe(409);
  expect(await walletOf('vendor', ctx.vendorId)).toEqual({ balance: 120, cashHeld: 0 });

  // engineer withdraws 300: needs bank details, respects the minimum, holds the money, can be rejected or paid
  expect((await api().post('/api/wallet/withdrawals').set(auth(ctx.engineer)).send({ amount: 300 })).status).toBe(400); // minimum 500
  await Setting.updateOne({ key: 'global' }, { 'pricing.minWithdrawal': 100 });
  expect((await api().post('/api/wallet/withdrawals').set(auth(ctx.engineer)).send({ amount: 300 })).body.message).toMatch(/bank/);
  expect((await api().put('/api/wallet/bank').set(auth(ctx.engineer)).send({ accountName: 'Ravi', accountNumber: '12345678901', ifsc: 'hdfc0001234' })).status).toBe(200);
  expect((await api().post('/api/wallet/withdrawals').set(auth(ctx.engineer)).send({ amount: 301 })).status).toBe(409); // more than the balance
  const [w1, w2] = await Promise.all([
    api().post('/api/wallet/withdrawals').set(auth(ctx.engineer)).send({ amount: 150 }),
    api().post('/api/wallet/withdrawals').set(auth(ctx.engineer)).send({ amount: 150 }),
  ]);
  expect([w1.status, w2.status].sort()).toEqual([201, 409]); // only one open request
  const wd = w1.status === 201 ? w1.body : w2.body;
  expect((await walletOf('engineer', ctx.engineerId)).balance).toBe(150);
  await api().patch(`/api/wallet/withdrawals/${wd._id}`).set(auth(ctx.admin)).send({ action: 'reject', note: 'Wrong account' }).expect(200);
  expect((await walletOf('engineer', ctx.engineerId)).balance).toBe(300);
  const wd2 = await api().post('/api/wallet/withdrawals').set(auth(ctx.engineer)).send({ amount: 300 });
  expect((await api().patch(`/api/wallet/withdrawals/${wd2.body._id}`).set(auth(ctx.admin)).send({ action: 'paid' })).status).toBe(400); // reference needed
  await api().patch(`/api/wallet/withdrawals/${wd2.body._id}`).set(auth(ctx.admin)).send({ action: 'paid', reference: 'UTR-77' }).expect(200);
  expect((await api().patch(`/api/wallet/withdrawals/${wd2.body._id}`).set(auth(ctx.admin)).send({ action: 'reject', note: 'x' })).status).toBe(409);
  expect((await walletOf('engineer', ctx.engineerId)).balance).toBe(0);

  // the ledger always explains the balance
  for (const [type, id] of [['engineer', ctx.engineerId], ['vendor', ctx.vendorId], ['customer', ctx.c1Id]]) {
    const txns = await WalletTxn.find({ ownerType: type, ownerId: id }).lean();
    const sum = txns.reduce((a, t) => a + (t.direction === 'credit' ? t.amount : -t.amount), 0);
    expect(sum / 100).toBe((await walletOf(type, id)).balance);
  }
});

test('dispute credit note: refund limited to what was paid; only the online part can go back to source', async () => {
  const sr = ctx.srCash;
  await api().post(`/api/service-requests/${sr}/dispute`).set(auth(ctx.c2)).send({ category: 'Wrong charge', reason: 'Charged for a part not used' }).expect(201);
  const d = (await api().get('/api/settlements/disputes').set(auth(ctx.admin))).body.items.find((x) => x.srNumber && String(x.serviceRequestId) === sr);
  expect((await api().patch(`/api/settlements/disputes/${d._id}`).set(auth(ctx.admin)).send({ decision: 'approved', outcome: 'Partial refund', refundAmount: 800 })).status).toBe(400); // more than paid
  await api().patch(`/api/settlements/disputes/${d._id}`).set(auth(ctx.admin)).send({ decision: 'approved', outcome: 'Partial refund', refundAmount: 200 }).expect(200);
  const doc = await ServiceRequest.findById(sr).lean();
  expect(doc.bill.total).toBe(507);
  expect(doc.bill.excess).toBe(200);
  const rr = (await api().get('/api/refunds').set(auth(ctx.c2))).body.items[0];
  expect(rr.preApproved).toBe(true);
  expect(rr.sourceRefundable).toBe(235); // only the online prepayment; the 472 cash can only come back via the wallet
  const done = await api().patch(`/api/refunds/${rr._id}/choose`).set(auth(ctx.c2)).send({ destination: 'wallet' });
  expect(done.body.status).toBe('completed'); // pre-approved: no second admin step
  const cId = (await Customer.findOne({ phone: '9300000011' }))._id;
  expect((await walletOf('customer', cId)).balance).toBe(200);
  expect((await ServiceRequest.findById(sr).lean()).bill.excess).toBe(0);
});

test('coupon usage limit holds under simultaneous bookings', async () => {
  const body = (p) => ({ passportId: p, jobType: 'pm', scheduledAt: weekdayAt11(), paymentMode: 'postpaid', couponCode: 'FLAT50' });
  const [a, b] = await Promise.all([
    api().post('/api/service-requests').set(auth(ctx.c3)).send(body(ctx.p3)),
    api().post('/api/service-requests').set(auth(ctx.c1)).send(body(ctx.p1)),
  ]);
  const ok = [a, b].filter((r) => r.status === 201);
  expect(ok).toHaveLength(1);
  expect(ok[0].body.bill.couponDiscount).toBe(50);
  expect(ok[0].body.bill.total).toBe(648); // (599 − 50) × 1.18 = 647.82
  expect((await Coupon.findOne({ code: 'FLAT50' })).usedCount).toBe(1);
  expect(await ServiceRequest.countDocuments({ 'priceSnapshot.coupon.code': 'FLAT50' })).toBe(1); // the losing booking was not saved
});

test('invoice PDF downloads for the customer and is refused before anything is billed', async () => {
  const res = await api().get(`/api/service-requests/${ctx.srCash}/invoice`).set(auth(ctx.c2)).buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('application/pdf');
  expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  expect((await api().get(`/api/service-requests/${ctx.srCash}/invoice`).set(auth(ctx.c1))).status).toBe(404); // not hers
});
