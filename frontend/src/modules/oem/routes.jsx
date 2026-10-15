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
  </Route>
);
