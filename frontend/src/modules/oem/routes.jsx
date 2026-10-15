import { Navigate, Route } from 'react-router-dom';
import PanelLayout from '@/shared/layout/PanelLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Warranty from './pages/Warranty.jsx';
import ServiceRequests from './pages/ServiceRequests.jsx';
import Vendors from './pages/Vendors.jsx';
import RateCards from './pages/RateCards.jsx';
import SlaTat from './pages/SlaTat.jsx';
import Reports from './pages/Reports.jsx';

const links = [
  ['dashboard', 'Dashboard'],
  ['products', 'Products'],
  ['warranty', 'Warranty'],
  ['service-requests', 'Service Requests'],
  ['vendors', 'Vendors'],
  ['rate-cards', 'Rate Cards'],
  ['sla-tat', 'Sla Tat'],
  ['reports', 'Reports'],
];

export const oemRoutes = (
  <Route path="/oem" element={<PanelLayout title="OEM Panel" base="/oem" role="oem" links={links} />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="products" element={<Products />} />
    <Route path="warranty" element={<Warranty />} />
    <Route path="service-requests" element={<ServiceRequests />} />
    <Route path="vendors" element={<Vendors />} />
    <Route path="rate-cards" element={<RateCards />} />
    <Route path="sla-tat" element={<SlaTat />} />
    <Route path="reports" element={<Reports />} />
  </Route>
);
