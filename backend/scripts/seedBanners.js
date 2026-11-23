require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Setting = require('../src/models/Setting');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(filePath, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        folder: 'aftenza/banners',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
}

async function seed(bannerPaths) {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in backend/.env');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const bannerMetadata = [
    {
      key: 'banner_service',
      localCopyName: 'banner-service.jpg',
    },
    {
      key: 'banner_parts',
      localCopyName: 'banner-parts.jpg',
    },
    {
      key: 'banner_tracking',
      localCopyName: 'banner-tracking.jpg',
    },
  ];

  const frontendCustomerDir = path.resolve(__dirname, '../../frontend/public/images/customer');
  if (!fs.existsSync(frontendCustomerDir)) {
    fs.mkdirSync(frontendCustomerDir, { recursive: true });
  }

  const seededBanners = [];

  for (let i = 0; i < bannerPaths.length; i++) {
    const srcPath = bannerPaths[i];
    const meta = bannerMetadata[i];

    console.log(`\nProcessing Banner ${i + 1}: ${meta.key}`);
    console.log(`Source file: ${srcPath}`);

    // 1. Copy locally to frontend/public/images/customer/
    const localDest = path.join(frontendCustomerDir, meta.localCopyName);
    fs.copyFileSync(srcPath, localDest);
    console.log(`Copied to local: ${localDest}`);

    // 2. Upload to Cloudinary
    console.log(`Uploading to Cloudinary (folder: aftenza/banners)...`);
    let cloudinaryUrl = '';
    let publicId = '';
    try {
      const res = await uploadToCloudinary(srcPath, meta.key);
      cloudinaryUrl = res.secure_url;
      publicId = res.public_id;
      console.log(`Cloudinary Upload Success: ${cloudinaryUrl}`);
    } catch (err) {
      console.error(`Cloudinary Upload Failed for ${meta.key}:`, err.message);
      // Fallback to local path if Cloudinary fails
      cloudinaryUrl = `/images/customer/${meta.localCopyName}`;
    }

    seededBanners.push({
      image: cloudinaryUrl,
      publicId: publicId || undefined,
    });
  }

  // 3. Update MongoDB Setting document
  console.log('\nUpdating Setting in MongoDB...');
  const setting = await Setting.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        'businessSetup.companyName': 'Aftenza',
        'customerHome.banners': seededBanners,
      },
    },
    { new: true, upsert: true }
  );

  console.log('\n--- SEED SUCCESS ---');
  console.log('Company Name:', setting.businessSetup.companyName);
  console.log('Updated customerHome.banners:');
  console.log(JSON.stringify(setting.customerHome.banners, null, 2));

  await mongoose.disconnect();
  console.log('\nDatabase connection closed.');
  return seededBanners;
}

// If invoked directly with command line arguments or default paths
if (require.main === module) {
  let args = process.argv.slice(2);
  if (args.length === 0) {
    const localDir = path.resolve(__dirname, '../../frontend/public/images/customer');
    args = [
      path.join(localDir, 'banner-service.jpg'),
      path.join(localDir, 'banner-parts.jpg'),
      path.join(localDir, 'banner-tracking.jpg'),
    ];
  }
  if (args.length < 3) {
    console.error('Usage: node seedBanners.js <banner1_path> <banner2_path> <banner3_path>');
    process.exit(1);
  }
  seed(args)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error seeding banners:', err);
      process.exit(1);
    });
}

module.exports = seed;

