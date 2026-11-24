const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectTestDb, dropTestDb } = require('./testDb');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const { Admin, Vendor, Engineer } = require('../src/models/accounts');
const DayLog = require('../src/models/DayLog');
const closeEngineerDays = require('../src/jobs/closeEngineerDays');

const api = () => request(app);
const token = (doc, role) => jwt.sign({ id: doc._id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};

jest.setTimeout(120000);

beforeAll(async () => {
  await connectTestDb('engineer');
  const passwordHash = await bcrypt.hash('x', 4);
  const admin = await Admin.create({ name: 'Admin', email: 'a@test.in', passwordHash });
  const vendor = await Vendor.create({ legalName: 'Cool Care', phone: '9200000002', passwordHash, status: 'approved' });
  const other = await Vendor.create({ legalName: 'Other Co', phone: '9200000003', passwordHash, status: 'approved' });
  const eng = await Engineer.create({ name: 'Ravi', phone: '9200000020', companyId: vendor._id, city: 'Indore', certifications: [{ brand: 'LG' }], passwordHash, status: 'approved', available: false });
  Object.assign(ctx, { admin: token(admin, 'admin'), vendor: token(vendor, 'vendor_owner'), other: token(other, 'vendor_owner'), engineer: token(eng, 'engineer'), engId: String(eng._id) });
});
afterAll(dropTestDb);

test('going online starts the day and makes the engineer available; offline stops dispatch', async () => {
  expect((await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: true })).status).toBe(400); // location needed
  const on = await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: true, lat: 22.72, lng: 75.86 });
  expect(on.status).toBe(200);
  expect(on.body.available).toBe(true);
  expect(await DayLog.countDocuments({ engineerId: ctx.engId })).toBe(1);
  // going online again the same day does not start a second day
  await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: true, lat: 22.72, lng: 75.86 }).expect(200);
  expect(await DayLog.countDocuments({ engineerId: ctx.engId })).toBe(1);

  const off = await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: false });
  expect(off.body.available).toBe(false);
  expect((await DayLog.findOne({ engineerId: ctx.engId })).closedAt).toBeFalsy(); // offline keeps the day open

  // the 11:59 PM close puts everyone offline; going online is refused until tomorrow
  await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: true, lat: 22.72, lng: 75.86 }).expect(200);
  await closeEngineerDays();
  expect((await Engineer.findById(ctx.engId)).available).toBe(false);
  expect((await api().post('/api/engineers/me/duty').set(auth(ctx.engineer)).send({ online: true, lat: 22.72, lng: 75.86 })).status).toBe(409);
});

test('profile: direct fields save at once, name / city / brands wait for the service company', async () => {
  const res = await api().patch('/api/engineers/me').set(auth(ctx.engineer)).send({
    email: 'ravi@test.in', skills: ['AC', 'UPS'], name: 'Ravi Kumar', city: 'Indore', certifications: [{ brand: 'LG' }, { brand: 'Daikin' }],
  });
  expect(res.status).toBe(200);
  expect(res.body.email).toBe('ravi@test.in');
  expect(res.body.skills).toEqual(['AC', 'UPS']);
  expect(res.body.name).toBe('Ravi'); // unchanged until approved
  expect(res.body.approvalRequested.sort()).toEqual(['certifications', 'name']); // city did not change, so not requested
  expect(res.body.pendingChanges.name).toBe('Ravi Kumar');

  // another service company cannot approve; the engineer's own company can
  expect((await api().patch(`/api/engineers/${ctx.engId}/changes`).set(auth(ctx.other)).send({ decision: 'approve' })).status).toBe(404);
  expect((await api().patch(`/api/engineers/${ctx.engId}/changes`).set(auth(ctx.vendor)).send({ decision: 'approve' })).status).toBe(200);
  const eng = await Engineer.findById(ctx.engId).lean();
  expect(eng.name).toBe('Ravi Kumar');
  expect(eng.certifications.map((c) => c.brand)).toEqual(['LG', 'Daikin']);
  expect(eng.pendingChanges).toBeUndefined();
  expect((await api().patch(`/api/engineers/${ctx.engId}/changes`).set(auth(ctx.vendor)).send({ decision: 'approve' })).status).toBe(409); // nothing waiting

  // reject keeps the current details; empty brand list is refused
  await api().patch('/api/engineers/me').set(auth(ctx.engineer)).send({ city: 'Bhopal' }).expect(200);
  await api().patch(`/api/engineers/${ctx.engId}/changes`).set(auth(ctx.admin)).send({ decision: 'reject', note: 'Stay in Indore' }).expect(200);
  expect((await Engineer.findById(ctx.engId)).city).toBe('Indore');
  expect((await api().patch('/api/engineers/me').set(auth(ctx.engineer)).send({ certifications: [] })).status).toBe(400);

  // the engineer can withdraw a request
  await api().patch('/api/engineers/me').set(auth(ctx.engineer)).send({ name: 'R. Kumar' }).expect(200);
  await api().delete('/api/engineers/me/changes').set(auth(ctx.engineer)).expect(200);
  expect((await Engineer.findById(ctx.engId)).pendingChanges).toBeUndefined();
});
