require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const Admin = require('../src/models/Admin');

(async () => {
  await connectDB();
  const email = (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin@123';
  await Admin.updateOne({ email }, { name: 'Servoshakti Admin', email, passwordHash: await bcrypt.hash(password, 10) }, { upsert: true });
  console.log('Admin ready:', email);
  process.exit(0);
})();
