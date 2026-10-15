class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ci = (s) => new RegExp(`^${escapeRegex(s)}$`, 'i'); // case-insensitive exact match

/** IST calendar date 'YYYY-MM-DD' and month 'YYYY-MM' */
const istDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const istMonth = (d = new Date()) => istDate(d).slice(0, 7);

const haversineKm = (a, b) => {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return null;
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
};

const warrantyStatus = (end) => {
  if (!end) return 'Unknown';
  const days = (new Date(end) - Date.now()) / 86400000;
  if (days < 0) return 'Expired';
  return days <= 30 ? 'Expiring Soon' : 'In Warranty';
};

/**
 * Paginated list with optional text search (`q`) and exact-match filters taken from the query string.
 */
async function paginate(Model, filter, req, { search = [], filters = [], populate = '', sort = { createdAt: -1 }, lean = true } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const f = { ...filter };
  for (const k of filters) if (req.query[k] && req.query[k] !== 'all') f[k] = req.query[k];
  const q = String(req.query.q || '').trim();
  if (q && search.length) f.$and = [...(f.$and || []), { $or: search.map((k) => ({ [k]: new RegExp(escapeRegex(q), 'i') })) }];
  let query = Model.find(f).sort(sort).skip((page - 1) * limit).limit(limit);
  if (populate) query = query.populate(populate);
  if (lean) query = query.lean();
  const [items, total] = await Promise.all([query, Model.countDocuments(f)]);
  return { items, total, page, limit };
}

module.exports = { ApiError, asyncHandler, escapeRegex, ci, istDate, istMonth, haversineKm, warrantyStatus, paginate };
