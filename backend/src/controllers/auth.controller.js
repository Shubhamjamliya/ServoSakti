const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Oem, Vendor, Engineer, Customer, MODEL_BY_ROLE, ROLES, phoneTaken } = require('../models/accounts');
const Admin = require('../models/Admin');
const Otp = require('../models/Otp');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { notifyAdmins } = require('../services/realtime');
const { sendOtpSms } = require('../utils/sms');
const { sendAdminResetOtpEmail } = require('../utils/mailer');
const Setting = require('../models/Setting');

const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
/** Customers, engineers and service companies sign in with a mobile OTP; admin and OEM use a password. */
const OTP_ROLES = ['customer', 'engineer', 'vendor_owner'];
const isCompany = (role) => role === 'oem' || role === 'vendor_owner';

const publicUser = (doc, role) => ({
  id: doc._id,
  role,
  name: doc.name || doc.ownerName || doc.legalName,
  phone: doc.phone,
  email: doc.email,
  companyId: isCompany(role) ? doc._id : role === 'engineer' ? doc.companyId : undefined,
  companyName: isCompany(role) ? doc.legalName : undefined,
});

/** OTP accounts have no password; the model still needs a hash, so store an unguessable one. */
const randomHash = () => bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
const hash = (pw) => {
  if (!pw || String(pw).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  return bcrypt.hash(String(pw), 10);
};
/** Proof that a phone passed OTP verification before it has an account; lets the onboarding form lock the number. */
const signSignup = (phone, role) => jwt.sign({ phone, role, purpose: 'signup' }, process.env.JWT_SECRET, { expiresIn: '15m' });
const verifiedPhone = (signupToken, role, fallback) => {
  if (!signupToken) return fallback;
  try {
    const t = jwt.verify(signupToken, process.env.JWT_SECRET);
    if (t.purpose === 'signup' && t.role === role) return t.phone;
  } catch { /* fall through */ }
  throw new ApiError(401, 'Phone verification expired. Please log in again.');
};
/** A phone may be reused across modules (OEM, service company, engineer, customer) but not twice in the same one. */
const requirePhone = async (role, phone) => {
  if (!/^\d{10}$/.test(String(phone || ''))) throw new ApiError(400, 'Enter a valid 10-digit phone number');
  if (await phoneTaken(role, phone)) throw new ApiError(409, 'This phone number is already registered for this account type');
};

exports.registerCustomer = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const phone = verifiedPhone(req.body.signupToken, 'customer', req.body.phone);
  if (!name) throw new ApiError(400, 'Name is required');
  await requirePhone('customer', phone);
  const c = await Customer.create({ name, phone, email, passwordHash: await randomHash() });
  res.status(201).json({ token: sign(c._id, 'customer'), user: publicUser(c, 'customer') });
});

/** OEM or service company signs up; the company document holds the owner's login and stays pending until approved. */
exports.registerCompany = asyncHandler(async (req, res) => {
  const { type, company = {}, owner = {} } = req.body;
  if (!['oem', 'vendor'].includes(type)) throw new ApiError(400, 'type must be oem or vendor');
  if (!company.legalName) throw new ApiError(400, 'Company name is required');
  if (type === 'vendor') owner.phone = verifiedPhone(owner.signupToken, 'vendor_owner', owner.phone);
  await requirePhone(type === 'oem' ? 'oem' : 'vendor_owner', owner.phone);
  const Model = type === 'oem' ? Oem : Vendor;
  const allowed = ['legalName', 'address', 'city', 'gstin', 'authorizedBrands', ...(type === 'vendor' ? ['serviceAreas', 'isBackup'] : [])];
  const fields = Object.fromEntries(Object.entries(company).filter(([k]) => allowed.includes(k)));
  const co = await Model.create({
    ...fields, ownerName: owner.name, phone: owner.phone, email: owner.email || company.email,
    passwordHash: type === 'oem' ? await hash(owner.password) : await randomHash(), status: 'pending',
  });
  notifyAdmins('New company registration', `${co.legalName} (${type === 'oem' ? 'OEM' : 'service company'}) is awaiting approval`, 'approval');
  res.status(201).json({ message: 'Registration received. You can log in after admin approval.', companyId: co._id });
});

exports.registerEngineer = asyncHandler(async (req, res) => {
  const { name, email, city, skills = [], certifications = [], serviceTerritories = [] } = req.body;
  const phone = verifiedPhone(req.body.signupToken, 'engineer', req.body.phone);
  if (!name) throw new ApiError(400, 'Name is required');
  if ((await Setting.get()).pricing?.independentEngineers === false) throw new ApiError(403, 'Joining as an independent engineer is closed. Ask your service company to add you.');
  await requirePhone('engineer', phone);
  await Engineer.create({ name, phone, email, passwordHash: await randomHash(), city, skills, certifications, serviceTerritories, engineerType: 'independent', status: 'pending' });
  notifyAdmins('New engineer registration', `${name} (independent) is awaiting approval`, 'approval');
  res.status(201).json({ message: 'Registration received. You can log in after admin approval.' });
});

/** Account state checks shared by password and OTP sign-in. */
const assertCanSignIn = (doc, role) => {
  if (doc.active === false) throw new ApiError(403, 'Account is deactivated');
  if (isCompany(role) && doc.status !== 'approved') throw new ApiError(403, doc.status === 'pending' ? 'Company is awaiting admin approval' : `Company is ${doc.status}`);
  if (role === 'engineer' && doc.status !== 'approved') throw new ApiError(403, doc.status === 'pending' ? 'Profile is awaiting admin approval' : `Profile is ${doc.status}`);
};

/** Password login for admin (email) and OEM (phone). */
exports.login = asyncHandler(async (req, res) => {
  const { role, phone, email, password } = req.body;
  if (!ROLES.includes(role)) throw new ApiError(400, 'Choose which account you are logging into');
  if (OTP_ROLES.includes(role)) throw new ApiError(400, 'This account signs in with a mobile OTP');
  const query = role === 'admin' ? { email: String(email || '').trim().toLowerCase() } : { phone: String(phone || '').trim() };
  const doc = await MODEL_BY_ROLE[role].findOne(query).select('+passwordHash');
  if (!doc || !(await bcrypt.compare(String(password || ''), doc.passwordHash))) {
    throw new ApiError(401, role === 'admin' ? 'Invalid email or password' : 'Invalid phone or password');
  }
  assertCanSignIn(doc, role);
  res.json({ token: sign(doc._id, role), user: publicUser(doc, role) });
});

/** Admin Forgot Password Step 1: send a 6-digit verification code to the admin's email via SMTP. */
exports.adminForgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'Enter a valid email address');
  }
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.json({ message: 'If an admin account exists for that email, a 6-digit verification code has been sent.' });
  }
  if (admin.active === false) {
    throw new ApiError(403, 'Account is deactivated');
  }

  const windowMs = (Number(process.env.OTP_RATE_WINDOW) || 600) * 1000;
  const recent = await Otp.countDocuments({ role: 'admin_reset', phone: email, createdAt: { $gt: new Date(Date.now() - windowMs) } });
  if (recent >= 3) {
    throw new ApiError(429, 'Too many reset requests. Try again in a few minutes.');
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const ttlMs = 10 * 60 * 1000;
  const otpDoc = await Otp.create({
    role: 'admin_reset',
    phone: email,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + ttlMs),
  });

  try {
    await sendAdminResetOtpEmail({ to: admin.email, name: admin.name, code });
  } catch (err) {
    await Otp.deleteOne({ _id: otpDoc._id });
    console.error('[MAIL]', err.message);
    throw new ApiError(502, 'Could not send the reset email. Please check SMTP configuration.');
  }

  res.json({ message: 'If an admin account exists for that email, a 6-digit verification code has been sent.' });
});

/** Admin Forgot Password Step 2: verify the 6-digit code and issue a short-lived reset token. */
exports.adminVerifyResetOtp = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.otp || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'Enter a valid email address');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(400, 'Enter the 6-digit verification code');
  }

  const otp = await Otp.findOne({ role: 'admin_reset', phone: email }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) {
    throw new ApiError(400, 'Verification code expired. Request a new one.');
  }
  if (otp.attempts >= 5) {
    throw new ApiError(429, 'Too many wrong attempts. Request a new verification code.');
  }
  if (otp.codeHash !== hashOtp(code)) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw new ApiError(401, 'Incorrect verification code');
  }

  const admin = await Admin.findOne({ email });
  if (!admin) throw new ApiError(404, 'Admin account not found');
  if (admin.active === false) throw new ApiError(403, 'Account is deactivated');

  await Otp.deleteMany({ role: 'admin_reset', phone: email });
  const resetToken = jwt.sign(
    { id: admin._id, role: 'admin', purpose: 'admin_password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
  res.json({ resetToken });
});

/** Admin Forgot Password Step 3: set the new password using the verified reset token. */
exports.adminResetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken) throw new ApiError(400, 'Reset token is required');
  let payload;
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Reset session expired. Please verify your email again.');
  }
  if (payload.purpose !== 'admin_password_reset' || payload.role !== 'admin') {
    throw new ApiError(401, 'Invalid reset token');
  }

  const passwordHash = await hash(newPassword);
  const updated = await Admin.findByIdAndUpdate(payload.id, { passwordHash });
  if (!updated) throw new ApiError(404, 'Admin account not found');

  res.json({ message: 'Password updated successfully. You can now sign in.' });
});

/** Password portals (OEM): tells the login screen whether to ask for a password or show onboarding. */
exports.checkAccount = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const phone = String(req.body.phone || '').trim();
  if (role !== 'oem') throw new ApiError(400, 'Not supported for this account type');
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'Enter a valid 10-digit phone number');
  res.json({ exists: !!(await Oem.exists({ phone })) });
});

const useDefaultOtp = () => process.env.USE_DEFAULT_OTP === 'true';
const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

/**
 * STATIC_OTP_PHONE + STATIC_OTP_CODE: one number (e.g. for app-store review or demos) that always signs in with a fixed
 * code, even while live SMS OTP is on. No SMS is sent and it is not rate limited. Works for every OTP login role.
 */
function staticOtpFor(phone) {
  const number = String(process.env.STATIC_OTP_PHONE || '').trim();
  const code = String(process.env.STATIC_OTP_CODE || '').trim();
  return number && /^\d{4}$/.test(code) && number === phone ? code : null;
}

/** Step 1: text a 4-digit code (always 1234 while USE_DEFAULT_OTP=true; the static code for STATIC_OTP_PHONE). */
exports.sendOtp = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const phone = String(req.body.phone || '').trim();
  if (!OTP_ROLES.includes(role)) throw new ApiError(400, 'This account does not use OTP login');
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'Enter a valid 10-digit phone number');
  const doc = await MODEL_BY_ROLE[role].findOne({ phone });
  if (doc) assertCanSignIn(doc, role); // a new number still gets an OTP, then goes to onboarding

  const fixed = staticOtpFor(phone) || (useDefaultOtp() ? '1234' : null);
  if (!fixed) {
    const windowMs = (Number(process.env.OTP_RATE_WINDOW) || 600) * 1000;
    const recent = await Otp.countDocuments({ role, phone, createdAt: { $gt: new Date(Date.now() - windowMs) } });
    if (recent >= (Number(process.env.OTP_RATE_LIMIT) || 3)) throw new ApiError(429, 'Too many OTP requests. Try again in a few minutes.');
  }
  const code = fixed || String(crypto.randomInt(1000, 10000));
  const ttlMs = (Number(process.env.OTP_EXPIRY_SECONDS) || (Number(process.env.OTP_EXPIRY_MINUTES) || 5) * 60) * 1000;
  await Otp.create({ role, phone, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + ttlMs) });
  if (!fixed) {
    try { await sendOtpSms(phone, code); } catch (e) { console.error('[SMS]', e.message); throw new ApiError(502, 'Could not send the OTP. Please try again.'); }
  }
  res.json({ message: 'OTP sent', expiresInSeconds: ttlMs / 1000 });
});

/** Step 2: check the code and sign in. */
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const phone = String(req.body.phone || '').trim();
  if (!OTP_ROLES.includes(role)) throw new ApiError(400, 'This account does not use OTP login');
  const otp = await Otp.findOne({ role, phone }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) throw new ApiError(400, 'OTP expired. Request a new one.');
  if (otp.attempts >= (Number(process.env.OTP_MAX_ATTEMPTS) || 3)) throw new ApiError(429, 'Too many wrong attempts. Request a new OTP.');
  if (otp.codeHash !== hashOtp(String(req.body.otp || '').trim())) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw new ApiError(401, 'Incorrect OTP');
  }
  const doc = await MODEL_BY_ROLE[role].findOne({ phone });
  await Otp.deleteMany({ role, phone });
  if (!doc) return res.json({ isNew: true, signupToken: signSignup(phone, role) });
  assertCanSignIn(doc, role);
  res.json({ token: sign(doc._id, role), user: publicUser(doc, role) });
});

exports.me = asyncHandler(async (req, res) => {
  const doc = await MODEL_BY_ROLE[req.user.role].findById(req.user.id).lean();
  res.json({ user: publicUser(doc, req.user.role), company: isCompany(req.user.role) ? { ...doc, type: req.user.role === 'oem' ? 'oem' : 'vendor' } : null });
});
