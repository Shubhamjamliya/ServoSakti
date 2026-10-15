require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

(async () => {
  await connectDB();
  const phone = process.env.ADMIN_PHONE || '7004356247';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) { console.error('Set ADMIN_PASSWORD'); process.exit(1); }
  await User.updateOne({ phone }, { name: 'Servoshakti Admin', phone, role: 'admin', passwordHash: await bcrypt.hash(password, 10) }, { upsert: true });
  console.log('Admin ready:', phone);
  process.exit(0);
})();
