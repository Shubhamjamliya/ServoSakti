const jwt = require('jsonwebtoken');
const { MODEL_BY_ROLE } = require('../models/accounts');
const { ApiError, asyncHandler } = require('../utils/helpers');

/**
 * Verifies the JWT and reloads the account from its own collection (so deactivation/suspension takes effect immediately).
 * Sets req.user = { id, role, companyId, name } and, for engineers/customers, req.engineer / req.customer.
 * For OEM and vendor accounts the company document *is* the account, so companyId === id.
 */
exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Not authenticated');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid token');
  }
  const Model = MODEL_BY_ROLE[payload.role];
  const account = Model && (await Model.findById(payload.id));
  if (!account || account.active === false) throw new ApiError(401, 'Account inactive');
  if (['oem', 'vendor_owner'].includes(payload.role) && account.status !== 'approved') throw new ApiError(401, `Company is ${account.status}`);
  if (payload.role === 'engineer' && account.status !== 'approved') throw new ApiError(401, `Profile is ${account.status}`);

  const id = String(account._id);
  const companyId = ['oem', 'vendor_owner'].includes(payload.role) ? id : payload.role === 'engineer' && account.companyId ? String(account.companyId) : null;
  req.user = { id, role: payload.role, companyId, name: account.name || account.ownerName || account.legalName };
  if (payload.role === 'engineer') req.engineer = account;
  if (payload.role === 'customer') req.customer = account;
  next();
});

exports.allow = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'Forbidden'));
