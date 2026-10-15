const cloudinary = require('cloudinary').v2;

const configure = () => cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = () => Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

function uploadBuffer(buffer) {
  configure();
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: 'servoshakti' }, (err, result) => (err ? reject(err) : resolve(result))).end(buffer);
  });
}

const destroy = (publicId) => {
  if (!publicId) return Promise.resolve();
  configure();
  return cloudinary.uploader.destroy(publicId).catch(() => {}); // best-effort
};

module.exports = { isCloudinaryConfigured, uploadBuffer, destroy };
