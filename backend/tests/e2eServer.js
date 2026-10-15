/**
 * Starts the API against a throw-away `<db>_test_e2e` database on the real MongoDB, loaded with the demo seed.
 * Used for browser end-to-end runs that create data. The database is dropped when the process stops.
 *   node tests/e2eServer.js
 */
require('dotenv').config();
const { testUri } = require('./testDb');

const { uri } = testUri('e2e');
process.env.MONGODB_URI = uri;
process.env.PORT = process.env.E2E_PORT || process.env.PORT || 5000;

const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  await mongoose.connection.db.dropDatabase();
  await require('../scripts/seedDemo')();
  await mongoose.disconnect();
  require('../src/server'); // connects again via config/db with the overridden URI

  const cleanup = async () => {
    try {
      await mongoose.connection.db.dropDatabase();
      console.log('e2e database dropped');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
})();
