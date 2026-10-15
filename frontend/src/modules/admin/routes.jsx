import { Navigate, Route } from 'react-router-dom';
import PanelLayout from '@/shared/layout/PanelLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Companies from './pages/Companies.jsx';
import Engineers from './pages/Engineers.jsx';
import Customers from './pages/Customers.jsx';
import Approvals from './pages/Approvals.jsx';
import Dispatch from './pages/Dispatch.jsx';
import Warranty from './pages/Warranty.jsx';
import RateCards from './pages/RateCards.jsx';
import Quality from './pages/Quality.jsx';
import Disputes from './pages/Disputes.jsx';
import Payouts from './pages/Payouts.jsx';
import Settlements from './pages/Settlements.jsx';
import Incentives from './pages/Incentives.jsx';
import Mis from './pages/Mis.jsx';
import Settings from './pages/Settings.jsx';

const links = [
  ['dashboard', 'Dashboard'],
  ['companies', 'Companies'],
  ['engineers', 'Engineers'],
  ['customers', 'Customers'],
  ['approvals', 'Approvals'],
  ['dispatch', 'Dispatch'],
  ['warranty', 'Warranty'],
  ['rate-cards', 'Rate Cards'],
  ['quality', 'Quality'],
  ['disputes', 'Disputes'],
  ['payouts', 'Payouts'],
  ['settlements', 'Settlements'],
  ['incentives', 'Incentives'],
  ['mis', 'Mis'],
  ['settings', 'Settings'],
];

export const adminRoutes = (
  <Route path="/admin" element={<PanelLayout title="Control Tower" base="/admin" role="admin" links={links} />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="companies" element={<Companies />} />
    <Route path="engineers" element={<Engineers />} />
    <Route path="customers" element={<Customers />} />
    <Route path="approvals" element={<Approvals />} />
    <Route path="dispatch" element={<Dispatch />} />
    <Route path="warranty" element={<Warranty />} />
    <Route path="rate-cards" element={<RateCards />} />
    <Route path="quality" element={<Quality />} />
    <Route path="disputes" element={<Disputes />} />
    <Route path="payouts" element={<Payouts />} />
    <Route path="settlements" element={<Settlements />} />
    <Route path="incentives" element={<Incentives />} />
    <Route path="mis" element={<Mis />} />
    <Route path="settings" element={<Settings />} />
  </Route>
);
