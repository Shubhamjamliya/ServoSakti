import { Route } from 'react-router-dom';
import AppLayout from '@/shared/layout/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Engineers from './pages/Engineers.jsx';
import LocalCalls from './pages/LocalCalls.jsx';
import OutsideRequests from './pages/OutsideRequests.jsx';
import Tracking from './pages/Tracking.jsx';
import Earnings from './pages/Earnings.jsx';
import Disputes from './pages/Disputes.jsx';
import Reports from './pages/Reports.jsx';

export const vendorRoutes = (
  <Route path="/vendor" element={<AppLayout panel="vendor" />}>
    <Route index element={<Dashboard />} />
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
