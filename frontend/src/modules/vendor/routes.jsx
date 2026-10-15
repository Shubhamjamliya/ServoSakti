import { Navigate, Route } from 'react-router-dom';
import PanelLayout from '@/shared/layout/PanelLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Engineers from './pages/Engineers.jsx';
import LocalCalls from './pages/LocalCalls.jsx';
import OutsideRequests from './pages/OutsideRequests.jsx';
import Tracking from './pages/Tracking.jsx';
import Earnings from './pages/Earnings.jsx';
import Disputes from './pages/Disputes.jsx';
import Reports from './pages/Reports.jsx';

const links = [
  ['dashboard', 'Dashboard'],
  ['profile', 'Profile'],
  ['engineers', 'Engineers'],
  ['local-calls', 'Local Calls'],
  ['outside-requests', 'Outside Requests'],
  ['tracking', 'Tracking'],
  ['earnings', 'Earnings'],
  ['disputes', 'Disputes'],
  ['reports', 'Reports'],
];

export const vendorRoutes = (
  <Route path="/vendor" element={<PanelLayout title="Service Company Panel" base="/vendor" role="vendor_owner" links={links} />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="profile" element={<Profile />} />
    <Route path="engineers" element={<Engineers />} />
    <Route path="local-calls" element={<LocalCalls />} />
    <Route path="outside-requests" element={<OutsideRequests />} />
    <Route path="tracking" element={<Tracking />} />
    <Route path="earnings" element={<Earnings />} />
    <Route path="disputes" element={<Disputes />} />
    <Route path="reports" element={<Reports />} />
  </Route>
);
