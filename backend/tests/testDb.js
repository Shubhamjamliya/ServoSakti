// Tests run against the real MongoDB from .env, but in their own throw-away database
// (`<db>_test_<suite>`) so they never touch the app's data. The database is dropped afterwards.
require('dotenv').config();
const mongoose = require('mongoose');

function testUri(suite) {
  const base = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;
  if (!base) throw new Error('Set MONGODB_URI (or MONGODB_TEST_URI) in backend/.env to run the tests');
  const url = new URL(base);
  const appDb = url.pathname.replace(/^\//, '') || 'servoindia';
  url.pathname = `/${appDb}_test_${suite}`;
  return { uri: url.toString(), appDb, testDb: `${appDb}_test_${suite}` };
}

async function connectTestDb(suite) {
  const { uri, appDb, testDb } = testUri(suite);
  if (testDb === appDb) throw new Error('Refusing to run tests against the application database');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  await mongoose.connection.db.dropDatabase(); // start clean
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes())); // unique indexes must exist for the tests
}

async function dropTestDb() {
  if (mongoose.connection.readyState === 1) {
    if (!/_test_/.test(mongoose.connection.db.databaseName)) throw new Error('Refusing to drop a non-test database');
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
}

module.exports = { connectTestDb, dropTestDb, testUri };
