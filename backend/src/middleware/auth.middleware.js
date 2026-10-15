const jwt = require('jsonwebtoken');

exports.protect = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role, companyId }
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

exports.allow = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Forbidden' });

// Multi-company separation: scope queries to the caller's company unless admin
exports.companyScope = (req) => (req.user.role === 'admin' ? {} : { companyId: req.user.companyId });
