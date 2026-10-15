const mongoose = require('mongoose');
const request = require('supertest');
const { connectTestDb, dropTestDb } = require('./testDb');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
const app = require('../src/app');
const seed = require('../scripts/seedDemo');

jest.setTimeout(180000);
beforeAll(() => connectTestDb('seed'));
afterAll(dropTestDb);

test('demo seed produces data every admin and OEM screen can read', async () => {
  const res = await seed();
  expect(res.serviceRequests).toBeGreaterThan(10);
  expect(res).toMatchObject({ admins: 1, oems: 3, vendors: 3, engineers: 6, customers: 2 });
  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  expect(names).not.toContain('users');
  expect(names).not.toContain('companies');
  const login = async (phone, password) => (await request(app).post('/api/auth/login').send({ phone, password })).body.token;
  const admin = await login('7004356247', process.env.ADMIN_PASSWORD || 'Admin@123');
  const oem = await login('9100000001', 'demo123');
  const get = async (t, p) => { const r = await request(app).get(p).set({ Authorization: `Bearer ${t}` }); expect([p, r.status]).toEqual([p, 200]); return r.body; };

  const dash = await get(admin, '/api/admin/dashboard');
  expect(dash.pendingApprovals).toBe(3);
  for (const p of ['approvals', 'mis?groupBy=city', 'quality', 'settings', 'audit-logs']) await get(admin, `/api/admin/${p}`);
  for (const p of ['/api/companies', '/api/engineers', '/api/customers', '/api/service-requests', '/api/dispatch/logs', '/api/rate-cards', '/api/settlements/payouts', '/api/settlements/summary', '/api/settlements/disputes', '/api/settlements/incentives', '/api/complaints', '/api/service-requests/stats', '/api/service-requests/sla']) await get(admin, p);
  for (const p of ['/api/products', '/api/products/passports', '/api/service-requests', '/api/service-requests/stats', '/api/service-requests/sla', '/api/companies/authorizations', '/api/rate-cards', '/api/companies']) await get(oem, p);
  expect((await get(oem, '/api/products/passports')).items.length).toBeGreaterThan(0);
});
