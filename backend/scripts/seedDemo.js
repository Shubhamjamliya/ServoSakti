// Seeds one approved login per module. Admin: admin@gmail.com. Everyone else: phone 6261387233. All passwords: admin@123.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const { Admin, Oem, Vendor, Engineer, Customer } = require('../src/models/accounts');

const PHONE = '6261387233';
const PASSWORD = 'admin@123';

(async () => {
  await connectDB();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const upsert = async (Model, key, doc) => {
    await Model.updateOne(key, { $set: { ...doc, passwordHash } }, { upsert: true });
    return Model.findOne(key);
  };

  await upsert(Admin, { email: 'admin@gmail.com' }, { name: 'Servoshakti Admin', email: 'admin@gmail.com', active: true });
  await upsert(Oem, { phone: PHONE }, { legalName: 'Demo OEM', ownerName: 'Demo OEM Owner', phone: PHONE, city: 'Indore', authorizedBrands: ['Demo'], status: 'approved', active: true });
  const vendor = await upsert(Vendor, { phone: PHONE }, { legalName: 'Demo Service Company', ownerName: 'Demo Vendor Owner', phone: PHONE, city: 'Indore', authorizedBrands: ['Demo'], serviceAreas: ['Indore'], status: 'approved', active: true });
  await upsert(Engineer, { phone: PHONE }, { name: 'Demo Engineer', phone: PHONE, companyId: vendor._id, engineerType: 'company', city: 'Indore', serviceTerritories: ['Indore'], status: 'approved', active: true });
  await upsert(Customer, { phone: PHONE }, { name: 'Demo Customer', phone: PHONE, active: true });

  console.log(`Seeded. Admin: admin@gmail.com / ${PASSWORD}. OEM, service company, engineer, customer: ${PHONE} / ${PASSWORD}`);
  process.exit(0);
})();
