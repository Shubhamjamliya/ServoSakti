const path = require('path');
const multer = require('multer');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { uploadImageBuffer, uploadFileBuffer, uploadRoot } = require('../services/storage.service');

const IMAGE = ['.jpg', '.jpeg', '.png', '.webp', '.ico'];
const ALLOWED = [...IMAGE, '.pdf'];

// Memory storage: the storage service resizes images and sends them to the active provider.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (ALLOWED.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new ApiError(400, 'Only images and PDF files are allowed'))),
});

/** Stores one multer file; images follow the Developer Settings provider, PDFs stay local. */
const storeFile = (file, dims) =>
  IMAGE.includes(path.extname(file.originalname).toLowerCase()) && !file.originalname.toLowerCase().endsWith('.ico')
    ? uploadImageBuffer(file.buffer, dims)
    : uploadFileBuffer(file.buffer, file.originalname);

exports.upload = upload;
exports.storeFile = storeFile;
exports.middleware = upload.array('files', 10);
exports.handler = asyncHandler(async (req, res) => {
  const stored = await Promise.all((req.files || []).map((f) => storeFile(f)));
  res.status(201).json({ urls: stored.map((s) => s.url), files: stored });
});
exports.dir = uploadRoot;
