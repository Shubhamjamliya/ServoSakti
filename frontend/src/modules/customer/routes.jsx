import { Navigate, Route } from 'react-router-dom';
import CustomerLayout from '@/shared/layout/CustomerLayout.jsx';
import NotificationsScreen from '@/shared/components/NotificationsScreen.jsx';
import Home from './pages/Home.jsx';
import ProductPassport from './pages/ProductPassport.jsx';
import ServiceRequests from './pages/ServiceRequests.jsx';
import Complaints from './pages/Complaints.jsx';
import Tracking from './pages/Tracking.jsx';
import History from './pages/History.jsx';
import Profile from './pages/Profile.jsx';
import Addresses from './pages/Addresses.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';
import Support from './pages/Support.jsx';

export const customerRoutes = (
  <Route path="/customer" element={<CustomerLayout />}>
    <Route index element={<Navigate to="home" replace />} />
    <Route path="home" element={<Home />} />
    <Route path="product-passport" element={<ProductPassport />} />
    <Route path="service-requests" element={<ServiceRequests />} />
    <Route path="complaints" element={<Complaints />} />
    <Route path="tracking" element={<Tracking />} />
    <Route path="history" element={<History />} />
    <Route path="notifications" element={<NotificationsScreen back="/customer/home" />} />
    <Route path="profile" element={<Profile />} />
    <Route path="addresses" element={<Addresses />} />
    <Route path="terms" element={<Terms />} />
    <Route path="privacy" element={<Privacy />} />
    <Route path="support" element={<Support />} />
  </Route>
);
