// One collection per user type. This maps the JWT/role to the collection that holds that account.
const Admin = require('./Admin');
const Oem = require('./Oem');
const Vendor = require('./Vendor');
const Engineer = require('./Engineer');
const Customer = require('./Customer');

const MODEL_BY_ROLE = { admin: Admin, oem: Oem, vendor_owner: Vendor, engineer: Engineer, customer: Customer };
const ROLES = Object.keys(MODEL_BY_ROLE);

/**
 * Logins are per module: the same phone number may own an OEM, a service company, an engineer and a customer account.
 * A phone only has to be unique inside its own collection (enforced by a unique index too).
 */
const phoneTaken = (role, phone) => MODEL_BY_ROLE[role].exists({ phone });

/** OEMs and vendors live in separate collections; find a company by id in either. */
async function findCompany(id) {
  const oem = await Oem.findById(id);
  if (oem) return { type: 'oem', doc: oem };
  const vendor = await Vendor.findById(id);
  return vendor ? { type: 'vendor', doc: vendor } : null;
}

module.exports = { MODEL_BY_ROLE, ROLES, phoneTaken, findCompany, Admin, Oem, Vendor, Engineer, Customer };
