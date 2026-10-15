const request = require('supertest');
const app = require('../src/app');

test('health', async () => {
  const res = await request(app).get('/api/health');
  expect(res.body.ok).toBe(true);
});
