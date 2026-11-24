const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/error.middleware');
const { dir: uploadDir } = require('./controllers/upload.controller');

const authRoutes = require('./routes/auth.routes');
const companyRoutes = require('./routes/company.routes');
const engineerRoutes = require('./routes/engineer.routes');
const customerRoutes = require('./routes/customer.routes');
const productRoutes = require('./routes/product.routes');
const serviceRequestRoutes = require('./routes/serviceRequest.routes');
const dispatchRoutes = require('./routes/dispatch.routes');
const fieldRoutes = require('./routes/field.routes');
const rateCardRoutes = require('./routes/rateCard.routes');
const settlementRoutes = require('./routes/settlement.routes');
const complaintRoutes = require('./routes/complaint.routes');
const adminRoutes = require('./routes/admin.routes');
const notificationRoutes = require('./routes/notification.routes');
const uploadRoutes = require('./routes/upload.routes');
const zoneRoutes = require('./routes/zone.routes');
const catalogRoutes = require('./routes/catalog.routes');
const planRoutes = require('./routes/plan.routes');
const paymentRoutes = require('./routes/payment.routes');
const walletRoutes = require('./routes/wallet.routes');
const refundRoutes = require('./routes/refund.routes');
const couponRoutes = require('./routes/coupon.routes');

const sys = require('./controllers/system.controller');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
// The Razorpay webhook signature is computed over the exact bytes received, so keep them for that route.
app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/payments/webhook')) req.rawBody = buf; } }));
app.use('/uploads', express.static(uploadDir)); // file names are random and unguessable

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'servoshakti-backend' }));

app.get('/api/branding', sys.branding);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/engineers', engineerRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/field', fieldRoutes);
app.use('/api/rate-cards', rateCardRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/coupons', couponRoutes);

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

module.exports = app;
