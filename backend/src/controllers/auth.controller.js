const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const sign = (u) => jwt.sign({ id: u._id, role: u.role, companyId: u.companyId }, process.env.JWT_SECRET, { expiresIn: '7d' });

exports.register = async (req, res, next) => {
  try {
    const { name, phone, email, password, role, companyId } = req.body;
    if (role === 'admin') return res.status(403).json({ message: 'Not allowed' });
    const user = await User.create({ name, phone, email, role, companyId, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user), user: { id: user._id, name, role } });
  } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ token: sign(user), user: { id: user._id, name: user.name, role: user.role, companyId: user.companyId } });
  } catch (e) { next(e); }
};
