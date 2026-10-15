import { Route } from 'react-router-dom';
import AppLayout from '@/shared/layout/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Approvals from './pages/Approvals.jsx';
import Companies from './pages/Companies.jsx';
import Engineers from './pages/Engineers.jsx';
import Customers from './pages/Customers.jsx';
import ServiceRequests from './pages/ServiceRequests.jsx';
import Dispatch from './pages/Dispatch.jsx';
import Quality from './pages/Quality.jsx';
import Disputes from './pages/Disputes.jsx';
import RateCards from './pages/RateCards.jsx';
import Payouts from './pages/Payouts.jsx';
import Settlements from './pages/Settlements.jsx';
import Incentives from './pages/Incentives.jsx';
import Mis from './pages/Mis.jsx';
import Settings from './pages/Settings.jsx';
import BusinessSetup from './pages/BusinessSetup.jsx';
import DeveloperSettings from './pages/DeveloperSettings.jsx';

export const adminRoutes = (
  <Route path="/admin" element={<AppLayout panel="admin" />}>
    <Route index element={<Dashboard />} />
    <Route path="approvals" element={<Approvals />} />
    <Route path="companies" element={<Companies />} />
    <Route path="engineers" element={<Engineers />} />
    <Route path="customers" element={<Customers />} />
    <Route path="service-requests" element={<ServiceRequests />} />
    <Route path="dispatch" element={<Dispatch />} />
    <Route path="quality" element={<Quality />} />
    <Route path="disputes" element={<Disputes />} />
    <Route path="rate-cards" element={<RateCards />} />
    <Route path="payouts" element={<Payouts />} />
    <Route path="settlements" element={<Settlements />} />
    <Route path="incentives" element={<Incentives />} />
    <Route path="mis" element={<Mis />} />
    <Route path="settings" element={<Settings />} />
    <Route path="business-setup" element={<BusinessSetup />} />
    <Route path="developer" element={<DeveloperSettings />} />
  </Route>
);
