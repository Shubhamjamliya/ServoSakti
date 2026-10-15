const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

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

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'servoshakti-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes); // OEM + vendor companies
app.use('/api/engineers', engineerRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes); // products + product passports
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/field', fieldRoutes); // day start, check-in, evidence, eFSR
app.use('/api/rate-cards', rateCardRoutes);
app.use('/api/settlements', settlementRoutes); // payouts, incentives, disputes
app.use('/api/complaints', complaintRoutes); // Phase 1B AI complaint workflow
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

module.exports = app;
