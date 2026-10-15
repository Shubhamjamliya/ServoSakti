const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectTestDb, dropTestDb } = require('./testDb');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
const app = require('../src/app');
const Admin = require('../src/models/Admin');
const ServiceRequest = require('../src/models/ServiceRequest');
const DispatchLog = require('../src/models/DispatchLog');
const { expireOffers } = require('../src/services/dispatch.service');
const closeEngineerDays = require('../src/jobs/closeEngineerDays');
const DayLog = require('../src/models/DayLog');

const api = () => request(app);
const login = async (phone, password = 'secret123') => (await api().post('/api/auth/login').send({ phone, password })).body.token;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

jest.setTimeout(180000);

beforeAll(async () => {
  await connectTestDb('flow');
  await Admin.create({ name: 'Admin', phone: '7004356247', passwordHash: await bcrypt.hash('secret123', 10) });
});
afterAll(dropTestDb);

const ctx = {};

test('registration, approval and role-gated login', async () => {
  const oem = await api().post('/api/auth/register-company').send({
    type: 'oem', company: { legalName: 'Fuji Electric', city: 'Pune', authorizedBrands: ['Fuji'] }, owner: { name: 'Fuji Owner', phone: '9000000001', password: 'secret123' },
  });
  expect(oem.status).toBe(201);
  ctx.oemCompany = oem.body.companyId;
  const vendor = await api().post('/api/auth/register-company').send({
    type: 'vendor', company: { legalName: 'Sharma Services', city: 'Indore', authorizedBrands: ['Fuji'] }, owner: { name: 'Sharma', phone: '9000000002', password: 'secret123' },
  });
  ctx.vendorCompany = vendor.body.companyId;
  const oem2 = await api().post('/api/auth/register-company').send({
    type: 'oem', company: { legalName: 'Other OEM', authorizedBrands: ['Delta'] }, owner: { name: 'Other', phone: '9000000003', password: 'secret123' },
  });
  ctx.oem2Company = oem2.body.companyId;

  // cannot log in before approval
  expect((await api().post('/api/auth/login').send({ phone: '9000000001', password: 'secret123' })).status).toBe(403);

  ctx.admin = await login('7004356247');
  for (const id of [ctx.oemCompany, ctx.vendorCompany, ctx.oem2Company]) {
    expect((await api().patch(`/api/companies/${id}/status`).set(auth(ctx.admin)).send({ status: 'approved' })).status).toBe(200);
  }
  ctx.oem = await login('9000000001');
  ctx.vendor = await login('9000000002');
  ctx.oem2 = await login('9000000003');
  expect(ctx.oem && ctx.vendor).toBeTruthy();

  const cust = await api().post('/api/auth/register-customer').send({ name: 'Patel Textiles', phone: '9000000010', password: 'secret123' });
  expect(cust.status).toBe(201);
  ctx.customer = cust.body.token;
});

test('vendor adds an engineer; admin approves; roles are enforced', async () => {
  expect((await api().post('/api/engineers').set(auth(ctx.customer)).send({})).status).toBe(403);
  const created = await api().post('/api/engineers').set(auth(ctx.vendor)).send({
    name: 'Ravi Engineer', phone: '9000000020', password: 'secret123', city: 'Indore', skills: ['drives'],
    certifications: [{ brand: 'Fuji' }],
  });
  expect(created.status).toBe(201);
  ctx.engineerId = created.body._id;
  expect((await api().post('/api/auth/login').send({ phone: '9000000020', password: 'secret123' })).status).toBe(403);

  const pending = await api().get('/api/admin/approvals').set(auth(ctx.admin));
  expect(pending.body.items.some((i) => i.name === 'Ravi Engineer')).toBe(true);
  await api().patch(`/api/engineers/${ctx.engineerId}/status`).set(auth(ctx.admin)).send({ status: 'approved' }).expect(200);
  ctx.engineer = await login('9000000020');
});

test('OEM sets up catalog, authorization and rate card', async () => {
  const product = await api().post('/api/products').set(auth(ctx.oem)).send({ brand: 'Fuji', model: 'FRENIC-Ace', category: 'Drive', warrantyMonths: 24 });
  expect(product.status).toBe(201);
  ctx.productId = product.body._id;
  await api().post('/api/companies/authorizations').set(auth(ctx.oem)).send({ vendorId: ctx.vendorCompany, brands: ['Fuji'], cities: ['Indore'] }).expect(201);
  const card = await api().post('/api/rate-cards').set(auth(ctx.oem)).send({
    brand: 'Fuji', jobType: 'breakdown', warranty: 'warranty', vendorPayout: 900, engineerPayout: 600, platformFee: 100,
    distanceSlabs: [{ fromKm: 0, toKm: 25, amount: 50 }],
  });
  expect(card.status).toBe(201);
  // another OEM cannot see this OEM's rate cards
  expect((await api().get('/api/rate-cards').set(auth(ctx.oem2))).body.total).toBe(0);
});

test('full service lifecycle: request -> dispatch -> field -> approval -> payout -> closure', async () => {
  const passport = await api().post('/api/products/passports').set(auth(ctx.customer)).send({
    productId: ctx.productId, brand: 'Fuji', model: 'FRENIC-Ace', serialNumber: 'FJ-1', purchaseDate: new Date().toISOString(),
  });
  expect(passport.status).toBe(201);
  expect(passport.body.warrantyStatus).toBe('In Warranty');

  const created = await api().post('/api/service-requests').set(auth(ctx.customer)).send({ passportId: passport.body._id, issue: 'Drive tripping', city: 'Indore', priority: 'High', location: { lat: 22.7196, lng: 75.8577 } });
  expect(created.status).toBe(201);
  expect(created.body.status).toBe('created');
  expect(created.body.warranty).toBe('warranty');
  ctx.sr = created.body._id;

  // multi-company separation
  expect((await api().get(`/api/service-requests/${ctx.sr}`).set(auth(ctx.oem2))).status).toBe(404);
  expect((await api().get('/api/service-requests').set(auth(ctx.oem2))).body.total).toBe(0);

  // OEM verifies -> vendor picked -> auto dispatch offers the local engineer (priority 1)
  const verified = await api().patch(`/api/service-requests/${ctx.sr}/verify`).set(auth(ctx.oem)).send({});
  expect(verified.status).toBe(200);
  const sr = await ServiceRequest.findById(ctx.sr);
  expect(String(sr.vendorId)).toBe(ctx.vendorCompany);
  expect(sr.status).toBe('offered');

  // engineer lands on location after Day Start
  const offers = await api().get('/api/dispatch/offers').set(auth(ctx.engineer));
  expect(offers.body.total).toBe(1);
  expect(offers.body.items[0].priority).toBe(1);
  const logId = offers.body.items[0]._id;
  expect((await api().post(`/api/dispatch/offers/${logId}/accept`).set(auth(ctx.engineer)).send({})).body.message).toMatch(/Day Start/);
  await api().post('/api/field/day-start').set(auth(ctx.engineer)).send({ lat: 22.72, lng: 75.86 }).expect(201);
  await api().post(`/api/dispatch/offers/${logId}/accept`).set(auth(ctx.engineer)).send({}).expect(200);
  expect((await ServiceRequest.findById(ctx.sr)).status).toBe('assigned');

  // engineer privacy: only own job visible; vendor sees it; OEM2 does not
  expect((await api().get('/api/service-requests').set(auth(ctx.engineer))).body.total).toBe(1);

  // field execution
  await api().post(`/api/field/${ctx.sr}/check-in`).set(auth(ctx.engineer)).send({ lat: 22.7201, lng: 75.8581 }).expect(200);
  expect((await api().post(`/api/field/${ctx.sr}/submit`).set(auth(ctx.engineer)).send({})).status).toBe(400); // missing evidence
  await api().patch(`/api/field/${ctx.sr}/report`).set(auth(ctx.engineer)).send({
    serialNumber: 'FJ-1', workDone: 'Replaced IGBT module', readings: { dcBus: '540V' }, beforePhotos: ['/uploads/a.jpg'], afterPhotos: ['/uploads/b.jpg'], crmRef: 'CRM-77',
  }).expect(200);
  expect((await api().post(`/api/field/${ctx.sr}/submit`).set(auth(ctx.engineer)).send({})).body.message).toMatch(/OTP or signature/);
  const otp = await api().post(`/api/field/${ctx.sr}/otp`).set(auth(ctx.engineer)).send({});
  expect((await api().post(`/api/field/${ctx.sr}/otp/verify`).set(auth(ctx.engineer)).send({ otp: '000000' })).status).toBe(400);
  await api().post(`/api/field/${ctx.sr}/otp/verify`).set(auth(ctx.engineer)).send({ otp: otp.body.devOtp }).expect(200);
  await api().post(`/api/field/${ctx.sr}/submit`).set(auth(ctx.engineer)).send({}).expect(200);

  // engineers cannot approve their own work
  expect((await api().patch(`/api/field/${ctx.sr}/review`).set(auth(ctx.engineer)).send({ decision: 'approved' })).status).toBe(403);
  await api().patch(`/api/field/${ctx.sr}/review`).set(auth(ctx.oem)).send({ decision: 'approved', note: 'Good' }).expect(200);

  // payout with frozen rate snapshot; engineer sees own earnings only
  const payouts = await api().get('/api/settlements/payouts').set(auth(ctx.admin));
  expect(payouts.body.total).toBe(1);
  const p = payouts.body.items[0];
  expect(p.vendorAmount).toBe(950); // 900 + 50 travel slab
  expect(p.engineerAmount).toBe(650);
  expect(p.rateSnapshot.vendorPayout).toBe(900);
  await api().patch(`/api/rate-cards/${p.rateCardId}`).set(auth(ctx.oem)).send({ vendorPayout: 5000 }).expect(200);
  expect((await api().get('/api/settlements/payouts').set(auth(ctx.admin))).body.items[0].rateSnapshot.vendorPayout).toBe(900); // history unchanged
  const mine = await api().get('/api/settlements/payouts').set(auth(ctx.engineer));
  expect(mine.body.items[0].vendorAmount).toBeUndefined();
  expect(mine.body.items[0].engineerAmount).toBe(650);

  await api().patch(`/api/settlements/payouts/${p._id}`).set(auth(ctx.admin)).send({ action: 'approve' }).expect(200);
  await api().patch(`/api/settlements/payouts/${p._id}`).set(auth(ctx.admin)).send({ action: 'pay', txnRef: 'UTR123' }).expect(200);

  // company-scoped summaries (aggregations) must see the payout too, not just the admin's unfiltered view
  for (const t of [ctx.vendor, ctx.oem]) {
    const sum = await api().get('/api/settlements/summary').set(auth(t));
    expect(sum.body.totals.calls).toBe(1);
    expect(sum.body.totals.vendorAmount).toBe(950);
  }
  expect((await api().get('/api/settlements/summary').set(auth(ctx.oem2))).body.totals.calls).toBe(0);

  const inc = await api().get('/api/settlements/incentives').set(auth(ctx.admin));
  expect(inc.body.items[0].approvedCalls).toBe(1);
  expect(inc.body.items[0].rechargeEligible).toBe(false);

  await api().post(`/api/service-requests/${ctx.sr}/confirm-closure`).set(auth(ctx.customer)).send({ rating: 5 }).expect(200);
  expect((await ServiceRequest.findById(ctx.sr)).status).toBe('closed');
});

test('offer timeout moves on; an exhausted queue ends unassigned; payout disputes work', async () => {
  const created = await api().post('/api/service-requests').set(auth(ctx.oem)).send({ brand: 'Fuji', model: 'FRENIC-Ace', city: 'Indore', customerName: 'Walk-in', jobType: 'breakdown' });
  expect(created.status).toBe(201);
  const srId = created.body._id;
  let sr = await ServiceRequest.findById(srId);
  expect(sr.status).toBe('offered'); // OEM-created requests are verified + dispatched immediately

  await DispatchLog.updateMany({ serviceRequestId: srId }, { expiresAt: new Date(Date.now() - 1000) });
  expect(await expireOffers()).toBe(1);
  sr = await ServiceRequest.findById(srId);
  expect(sr.status).toBe('unassigned');
  const log = await DispatchLog.findOne({ serviceRequestId: srId });
  expect(log.outcome).toBe('timeout');

  // admin can still force an assignment
  await api().post(`/api/dispatch/${srId}/assign`).set(auth(ctx.admin)).send({ engineerId: ctx.engineerId }).expect(200);
  expect((await ServiceRequest.findById(srId)).status).toBe('assigned');

  // dispute on the earlier payout
  const payout = (await api().get('/api/settlements/payouts').set(auth(ctx.engineer))).body.items[0];
  const d = await api().post('/api/settlements/disputes').set(auth(ctx.engineer)).send({ payoutId: payout._id, reason: 'Travel allowance missing' });
  expect(d.status).toBe(201);
  await api().patch(`/api/settlements/disputes/${d.body._id}`).set(auth(ctx.admin)).send({ decision: 'approved', outcome: 'Adjusted' }).expect(200);
});

test('each user type is stored in its own collection; phones are unique across all of them', async () => {
  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  for (const c of ['admins', 'oems', 'vendors', 'engineers', 'customers']) expect(names).toContain(c);
  expect(names).not.toContain('users');
  expect(names).not.toContain('companies');
  const db = mongoose.connection.db;
  expect(await db.collection('oems').countDocuments({ phone: '9000000001' })).toBe(1);
  expect(await db.collection('vendors').countDocuments({ phone: '9000000002' })).toBe(1);
  expect(await db.collection('customers').countDocuments({ phone: '9000000010' })).toBe(1);
  expect(await db.collection('engineers').countDocuments({ phone: '9000000020' })).toBe(1);
  // a vendor's phone cannot be reused to register a customer, and password hashes are never returned
  expect((await api().post('/api/auth/register-customer').send({ name: 'X', phone: '9000000002', password: 'secret123' })).status).toBe(409);
  const me = await api().get('/api/auth/me').set(auth(ctx.vendor));
  expect(me.body.company.legalName).toBe('Sharma Services');
  expect(me.body.company.passwordHash).toBeUndefined();
  const engs = await api().get('/api/engineers').set(auth(ctx.vendor));
  expect(engs.body.items.every((e) => e.passwordHash === undefined)).toBe(true);
});

test('deactivating an engineer blocks their existing session immediately', async () => {
  const eng = await api().post('/api/engineers').set(auth(ctx.vendor)).send({ name: 'Temp Eng', phone: '9000000040', password: 'secret123', city: 'Indore', certifications: [{ brand: 'Fuji' }] });
  await api().patch(`/api/engineers/${eng.body._id}/status`).set(auth(ctx.admin)).send({ status: 'approved' }).expect(200);
  const token = await login('9000000040');
  await api().get('/api/engineers/me').set(auth(token)).expect(200);
  await api().patch(`/api/engineers/${eng.body._id}`).set(auth(ctx.vendor)).send({ active: false }).expect(200);
  expect((await api().get('/api/engineers/me').set(auth(token))).status).toBe(401);
  expect((await api().post('/api/auth/login').send({ phone: '9000000040', password: 'secret123' })).status).toBe(403);
});

test('day auto-close, admin dashboards and settings', async () => {
  expect(await closeEngineerDays()).toBe(1);
  expect((await DayLog.findOne()).autoClosed).toBe(true);

  const dash = await api().get('/api/admin/dashboard').set(auth(ctx.admin));
  expect(dash.status).toBe(200);
  expect(dash.body.oems).toBe(2);
  expect(dash.body.vendors).toBe(1);
  expect((await api().get('/api/admin/mis?groupBy=oem').set(auth(ctx.admin))).body.items.length).toBeGreaterThan(0);
  expect((await api().get('/api/admin/quality').set(auth(ctx.admin))).status).toBe(200);
  const s = await api().put('/api/admin/settings').set(auth(ctx.admin)).send({ acceptanceWindowMinutes: 15 });
  expect(s.body.acceptanceWindowMinutes).toBe(15);
  expect((await api().get('/api/admin/dashboard').set(auth(ctx.oem))).status).toBe(403);

  const stats = await api().get('/api/service-requests/stats').set(auth(ctx.oem));
  expect(stats.body.total).toBeGreaterThanOrEqual(2);
  const sla = await api().get('/api/service-requests/sla').set(auth(ctx.oem));
  expect(sla.status).toBe(200);
});

test('vendor outsources a call to an authorized partner and keeps visibility; tracking shows live status', async () => {
  const apex = await api().post('/api/auth/register-company').send({
    type: 'vendor', company: { legalName: 'Apex Power', city: 'Pune', authorizedBrands: ['Fuji'] }, owner: { name: 'Apex', phone: '9000000030', password: 'secret123' },
  });
  await api().patch(`/api/companies/${apex.body.companyId}/status`).set(auth(ctx.admin)).send({ status: 'approved' }).expect(200);
  const apexOwner = await login('9000000030');
  await api().post('/api/companies/authorizations').set(auth(ctx.oem)).send({ vendorId: apex.body.companyId, brands: ['Fuji'], cities: ['Pune'] }).expect(201);
  const eng = await api().post('/api/engineers').set(auth(apexOwner)).send({ name: 'Neha', phone: '9000000031', password: 'secret123', city: 'Pune', certifications: [{ brand: 'Fuji' }] });
  await api().patch(`/api/engineers/${eng.body._id}/status`).set(auth(ctx.admin)).send({ status: 'approved' }).expect(200);

  const created = await api().post('/api/service-requests').set(auth(ctx.oem)).send({ brand: 'Fuji', model: 'X', city: 'Pune', customerName: 'Pune Customer', jobType: 'breakdown' });
  const srId = created.body._id;
  // Pune has no Sharma coverage, so Sharma's owner hands it to the partner explicitly
  await ServiceRequest.updateOne({ _id: srId }, { vendorId: ctx.vendorCompany, status: 'verified' });
  await DispatchLog.deleteMany({ serviceRequestId: srId });

  const partners = await api().get(`/api/companies/partners?srId=${srId}`).set(auth(ctx.vendor));
  expect(partners.body.items.map((p) => p.legalName)).toEqual(['Apex Power']);
  const out = await api().post(`/api/dispatch/${srId}/outsource`).set(auth(ctx.vendor)).send({ companyId: apex.body.companyId });
  expect(out.status).toBe(201);
  // visible to the original vendor as "handed to partner" even before the partner accepts
  const pending = await api().get('/api/service-requests?outsourced=1').set(auth(ctx.vendor));
  expect(pending.body.items.map((i) => i._id)).toContain(srId);

  const offers = await api().get('/api/dispatch/offers').set(auth(apexOwner));
  expect(offers.body.total).toBe(1);
  expect((await api().post(`/api/dispatch/offers/${offers.body.items[0]._id}/accept`).set(auth(apexOwner)).send({})).status).toBe(400); // must pick an engineer
  await api().post(`/api/dispatch/offers/${offers.body.items[0]._id}/accept`).set(auth(apexOwner)).send({ engineerId: eng.body._id }).expect(200);

  const sr = await ServiceRequest.findById(srId);
  expect(sr.origin).toBe('outsourced');
  expect(String(sr.vendorId)).toBe(apex.body.companyId);
  // the original vendor still sees (and is accountable for) the outsourced call
  const mine = await api().get('/api/service-requests?origin=outsourced').set(auth(ctx.vendor));
  expect(mine.body.items.map((i) => i._id)).toContain(srId);

  const list = await api().get('/api/engineers').set(auth(ctx.vendor));
  const ravi = list.body.items.find((e) => e.name === 'Ravi Engineer');
  expect(['Started', 'Closed', 'Not started']).toContain(ravi.dayStatus);
  expect(typeof ravi.openCalls).toBe('number');
});
