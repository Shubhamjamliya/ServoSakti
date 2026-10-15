const path = require('path');

const toAbsolute = (value) => {
  const v = String(value || '').trim();
  if (!v) return null;
  return path.isAbsolute(v) ? path.normalize(v) : path.resolve(process.cwd(), v);
};

/**
 * Single source of truth for where local uploads live on disk.
 * UPLOAD_DIR / UPLOAD_PATH win; otherwise backend/uploads in development and /var/www/uploads (the VPS folder) in production.
 */
function resolveUploadRoot() {
  return toAbsolute(process.env.UPLOAD_DIR) || toAbsolute(process.env.UPLOAD_PATH)
    || (process.env.NODE_ENV === 'production' ? '/var/www/uploads' : path.join(process.cwd(), 'uploads'));
}

/** Files are stored flat under the upload root; this is the URL they are served from. */
const publicUrl = (fileName) => `/uploads/${fileName}`;

module.exports = { resolveUploadRoot, publicUrl };
