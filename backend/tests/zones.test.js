const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connectTestDb, dropTestDb } = require('./testDb');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
const app = require('../src/app');
const { Admin, Oem, Vendor, Engineer, Customer } = require('../src/models/accounts');
const Authorization = require('../src/models/Authorization');
const Product = require('../src/models/Product');
const ProductPassport = require('../src/models/ProductPassport');
const RateCard = require('../src/models/RateCard');
const ServiceRequest = require('../src/models/ServiceRequest');
const DispatchLog = require('../src/models/DispatchLog');
const Notification = require('../src/models/Notification');
const Payout = require('../src/models/Payout');
const Setting = require('../src/models/Setting');
const warrantyReminders = require('../src/jobs/warrantyReminders');

const api = () => request(app);
const tokenFor = (id, role) => ({ Authorization: `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET)}` });
jest.setTimeout(120000);

// ~10 km box around Indore, and a box around Pune
const box = (lat, lng, d = 0.05) => [
  { latitude: lat - d, longitude: lng - d }, { latitude: lat - d, longitude: lng + d },
  { latitude: lat + d, longitude: lng + d }, { latitude: lat + d, longitude: lng - d },
];
const INDORE = { lat: 22.7196, lng: 75.8577 };
const PUNE = { lat: 18.5204, lng: 73.8567 };
const ctx = {};

beforeAll(async () => {
  await connectTestDb('zones');
  const pw = await bcrypt.hash('x', 4);
  ctx.admin = await Admin.create({ name: 'Admin', email: 'a@x.com', passwordHash: pw });
  ctx.oem = await Oem.create({ legalName: 'Fuji', phone: '9000000001', passwordHash: pw, status: 'approved', authorizedBrands: ['Fuji'] });
  ctx.vendor = await Vendor.create({ legalName: 'Sharma', phone: '9000000002', passwordHash: pw, status: 'approved', authorizedBrands: ['Fuji'] });
  ctx.customer = await Customer.create({ name: 'Patel', phone: '9000000010', passwordHash: pw });
  ctx.product = await Product.create({ oemId: ctx.oem._id, brand: 'Fuji', model: 'Ace', warrantyMonths: 24 });
  await Authorization.create({ oemId: ctx.oem._id, vendorId: ctx.vendor._id, brands: ['Fuji'], cities: [] });
  await RateCard.create({ oemId: ctx.oem._id, brand: 'Fuji', jobType: 'breakdown', warranty: 'warranty', vendorPayout: 900, engineerPayout: 600, independentEngineerPayout: 700, platformFee: 100 });
});
afterAll(dropTestDb);

test('admin draws zones; detect tells in-service from out-of-service', async () => {
  const none = await api().get(`/api/zones/detect?lat=${INDORE.lat}&lng=${INDORE.lng}`);
  expect(none.body.status).toBe('NO_ZONES_CONFIGURED');

  expect((await api().post('/api/zones').set(tokenFor(ctx.customer._id, 'customer')).send({})).status).toBe(403);
  const z1 = await api().post('/api/zones').set(tokenFor(ctx.admin._id, 'admin')).send({ name: 'Indore Central', city: 'Indore', coordinates: box(INDORE.lat, INDORE.lng) });
  expect(z1.status).toBe(201);
  const z2 = await api().post('/api/zones').set(tokenFor(ctx.admin._id, 'admin')).send({ name: 'Pune', city: 'Pune', coordinates: box(PUNE.lat, PUNE.lng) });
  ctx.z1 = z1.body._id; ctx.z2 = z2.body._id;
  expect((await api().post('/api/zones').set(tokenFor(ctx.admin._id, 'admin')).send({ name: 'Bad', coordinates: box(0, 0).slice(0, 2) })).status).toBeGreaterThanOrEqual(400);

  const inIndore = await api().get(`/api/zones/detect?lat=${INDORE.lat}&lng=${INDORE.lng}`);
  expect(inIndore.body.status).toBe('IN_SERVICE');
  expect(inIndore.body.zone.name).toBe('Indore Central');
  expect((await api().get('/api/zones/detect?lat=28.6&lng=77.2')).body.status).toBe('OUT_OF_SERVICE');
  expect((await api().get('/api/zones/public')).body.items).toHaveLength(2);
});

test('customer addresses are zone-checked; requests inherit the zone', async () => {
  const h = tokenFor(ctx.customer._id, 'customer');
  const out = await api().post('/api/customers/me/addresses').set(h).send({ label: 'Delhi', line: 'CP', city: 'Delhi', lat: 28.6, lng: 77.2 });
  expect(out.status).toBe(422);
  expect((await api().post('/api/customers/me/addresses').set(h).send({ line: 'x', city: 'y' })).status).toBe(400); // no map pin

  const ok = await api().post('/api/customers/me/addresses').set(h).send({ label: 'Plant', line: '12 MG Road', city: 'Indore', pincode: '452001', ...INDORE });
  expect(ok.status).toBe(201);
  expect(ok.body.addresses[0].zoneName).toBe('Indore Central');
  expect(ok.body.addresses[0].isDefault).toBe(true);
  ctx.addressId = ok.body.addresses[0]._id;

  const passport = await ProductPassport.create({ customerId: ctx.customer._id, customerPhone: ctx.customer.phone, productId: ctx.product._id, brand: 'Fuji', model: 'Ace', serialNumber: 'S1', purchaseDate: new Date(), warrantyEnd: new Date(Date.now() + 5 * 86400000) });
  ctx.passport = passport;
  const sr = await api().post('/api/service-requests').set(h).send({ passportId: passport._id, issue: 'Trips', addressId: ctx.addressId });
  expect(sr.status).toBe(201);
  expect(String(sr.body.zoneId)).toBe(ctx.z1);
  expect(sr.body.location.lat).toBeCloseTo(INDORE.lat);
  ctx.srId = sr.body._id;

  // free-form location outside every zone is rejected, unless the admin relaxes enforcement
  const bad = await api().post('/api/service-requests').set(h).send({ passportId: passport._id, issue: 'x', location: { lat: 28.6, lng: 77.2 }, city: 'Delhi' });
  expect(bad.status).toBe(422);
  await Setting.findOneAndUpdate({ key: 'global' }, { enforceZones: false }, { upsert: true });
  expect((await api().post('/api/service-requests').set(h).send({ passportId: passport._id, issue: 'x', location: { lat: 28.6, lng: 77.2 }, city: 'Delhi' })).status).toBe(201);
  await Setting.findOneAndUpdate({ key: 'global' }, { enforceZones: true });
});

test('dispatch matches engineers by zone (not just city) and customer is notified', async () => {
  const pw = await bcrypt.hash('x', 4);
  const base = { companyId: ctx.vendor._id, passwordHash: pw, status: 'approved', city: 'Indore', certifications: [{ brand: 'Fuji' }], serviceTerritories: ['Indore'] };
  const wrongZone = await Engineer.create({ ...base, name: 'Pune Guy', phone: '9100000001', serviceZones: [ctx.z2] });
  const rightZone = await Engineer.create({ ...base, name: 'Indore Guy', phone: '9100000002', serviceZones: [ctx.z1] });
  const dispatch = require('../src/services/dispatch.service');
  const sr = await ServiceRequest.findById(ctx.srId);
  sr.vendorId = ctx.vendor._id;
  await sr.save();
  const queue = await dispatch.buildQueue(sr, await Setting.get());
  const ids = queue.map((q) => String(q.id));
  expect(ids).toContain(String(rightZone._id));
  expect(ids).not.toContain(String(wrongZone._id)); // same city, but covers a different zone
  ctx.engineer = rightZone;

  await dispatch.assign(sr, rightZone, { origin: 'own', actorId: ctx.vendor._id });
  const n = await Notification.find({ userId: ctx.customer._id, title: 'Engineer assigned' });
  expect(n).toHaveLength(1);
  expect(await DispatchLog.countDocuments({ serviceRequestId: sr._id })).toBeGreaterThan(0);
});

test('engineers and companies can pick their coverage zones', async () => {
  const res = await api().put('/api/zones/coverage').set(tokenFor(ctx.vendor._id, 'vendor_owner')).send({ zoneIds: [ctx.z1, '64b000000000000000000000'] });
  expect(res.status).toBe(200);
  expect(res.body.serviceZones.map(String)).toEqual([ctx.z1]);
});

test('warranty reminder is sent once per threshold', async () => {
  expect(await warrantyReminders()).toBe(1); // 5 days left -> the 7-day step
  const first = await Notification.countDocuments({ userId: ctx.customer._id, type: 'warranty' });
  expect(first).toBe(1);
  expect(await warrantyReminders()).toBe(0);
  expect(await Notification.countDocuments({ userId: ctx.customer._id, type: 'warranty' })).toBe(1);
});

test('failed call follows the payout policy; independent engineers use their own rate', async () => {
  const settlement = require('../src/services/settlement.service');
  const sr = await ServiceRequest.findById(ctx.srId);
  sr.status = 'assigned';
  await sr.save();

  const failedBody = { reason: 'Customer not available' };
  const res = await api().patch(`/api/field/${ctx.srId}/fail`).set(tokenFor(ctx.vendor._id, 'vendor_owner')).send(failedBody);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('failed');
  const held = await Payout.findOne({ serviceRequestId: ctx.srId });
  expect(held.approval).toBe('held'); // default policy: hold

  await Setting.findOneAndUpdate({ key: 'global' }, { failedCallPayout: 'none' });
  const sr2 = await ServiceRequest.findById(ctx.srId);
  expect(await settlement.createPayout(sr2, null, ctx.admin._id, { failed: true })).toBeNull();

  const indep = await Engineer.create({ name: 'Free', phone: '9100000009', passwordHash: 'x', status: 'approved', engineerType: 'independent' });
  sr2.engineerId = indep._id;
  const p = await settlement.createPayout(sr2, null, ctx.admin._id);
  expect(p.engineerAmount).toBe(700); // independentEngineerPayout, not the standard 600

  expect((await api().get('/api/settlements/export').set(tokenFor(ctx.admin._id, 'admin'))).text).toMatch(/"SR","OEM"/);
});
