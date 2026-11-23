const Zone = require('../models/Zone');
const { pointInPolygon } = require('../utils/helpers');

const finite = (v) => (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null);

/** Returns the active zone containing the point, or null (outside every zone). */
async function detectZone(lat, lng) {
  const la = finite(lat);
  const ln = finite(lng);
  if (la === null || ln === null) return null;
  const zones = await Zone.find({ active: true }).lean();
  return zones.find((z) => pointInPolygon(la, ln, z.coordinates)) || null;
}

const hasActiveZones = async () => Boolean(await Zone.exists({ active: true }));

module.exports = { detectZone, hasActiveZones };
