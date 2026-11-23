import { Route } from 'react-router-dom';
import AppLayout from '@/shared/layout/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Warranty from './pages/Warranty.jsx';
import ServiceRequests from './pages/ServiceRequests.jsx';
import Vendors from './pages/Vendors.jsx';
import RateCards from './pages/RateCards.jsx';
import SlaTat from './pages/SlaTat.jsx';
import Reports from './pages/Reports.jsx';
import WarrantyClaims from './pages/WarrantyClaims.jsx';
import { Plans } from '../admin/pages/PricingCatalog.jsx';
import { WarrantyChecks } from '../admin/pages/ProductApprovals.jsx';

export const oemRoutes = (
  <Route path="/oem" element={<AppLayout panel="oem" />}>
    <Route index element={<Dashboard />} />
    <Route path="products" element={<Products />} />
    <Route path="warranty" element={<Warranty />} />
    <Route path="service-requests" element={<ServiceRequests />} />
    <Route path="vendors" element={<Vendors />} />
    <Route path="rate-cards" element={<RateCards />} />
    <Route path="sla-tat" element={<SlaTat />} />
    <Route path="reports" element={<Reports />} />
    <Route path="warranty-claims" element={<WarrantyClaims />} />
    <Route path="plans" element={<Plans eyebrow="Catalog" oem />} />
    <Route path="warranty-verification" element={<WarrantyChecks eyebrow="Catalog" />} />
  </Route>
);
