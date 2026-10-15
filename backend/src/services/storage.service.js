const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { resolveUploadRoot, publicUrl } = require('../utils/uploadPaths');
const cloud = require('../utils/cloudinary');

const ROOT = resolveUploadRoot();
fs.mkdirSync(ROOT, { recursive: true });

const rid = () => crypto.randomBytes(6).toString('hex');

/** Active image provider ('local' = this server's upload folder, 'cloudinary'), switched from Developer Settings. */
async function getUploadProvider() {
  const Setting = require('../models/Setting'); // lazy: avoids a require cycle at start-up
  const s = await Setting.get();
  return s.developerSettings?.imageUploadProvider || 'local';
}

/** Resizes to WebP, then stores on disk or Cloudinary. Returns { url, filename?, publicId?, provider }. */
async function uploadImageBuffer(buffer, { width = 1600, height = 1600, quality = 82 } = {}) {
  const processed = await sharp(buffer).rotate().resize({ width, height, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
  if ((await getUploadProvider()) === 'cloudinary') {
    const r = await cloud.uploadBuffer(processed);
    return { url: r.secure_url, publicId: r.public_id, provider: 'cloudinary' };
  }
  const filename = `img_${Date.now()}_${rid()}.webp`;
  await fs.promises.writeFile(path.join(ROOT, filename), processed);
  return { url: publicUrl(filename), filename, provider: 'local' };
}

/** Non-image files (PDFs) are always kept on the local upload folder as-is. */
async function uploadFileBuffer(buffer, originalName) {
  const filename = `file_${Date.now()}_${rid()}${path.extname(originalName || '').toLowerCase()}`;
  await fs.promises.writeFile(path.join(ROOT, filename), buffer);
  return { url: publicUrl(filename), filename, provider: 'local' };
}

async function removeUploadedFile(ref) {
  if (!ref) return;
  if (ref.provider === 'cloudinary' && ref.publicId) return cloud.destroy(ref.publicId);
  if (ref.filename) fs.unlink(path.join(ROOT, path.basename(ref.filename)), () => {}); // best-effort
}

module.exports = { uploadImageBuffer, uploadFileBuffer, removeUploadedFile, getUploadProvider, uploadRoot: ROOT };
