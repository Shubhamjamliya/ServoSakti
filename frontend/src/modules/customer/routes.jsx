import { Navigate, Route } from 'react-router-dom';
import MobileLayout from '@/shared/layout/MobileLayout.jsx';
import NotificationsScreen from '@/shared/components/NotificationsScreen.jsx';
import Home from './pages/Home.jsx';
import ProductPassport from './pages/ProductPassport.jsx';
import ServiceRequests from './pages/ServiceRequests.jsx';
import Complaints from './pages/Complaints.jsx';
import Tracking from './pages/Tracking.jsx';
import History from './pages/History.jsx';
import Profile from './pages/Profile.jsx';

const tabs = [
  ['home', 'Home'],
  ['product-passport', 'Products'],
  ['service-requests', 'Requests'],
  ['tracking', 'Track'],
  ['profile', 'Profile'],
];

export const customerRoutes = (
  <Route path="/customer" element={<MobileLayout title="Servoshakti" base="/customer" role="customer" tabs={tabs} />}>
    <Route index element={<Navigate to="home" replace />} />
    <Route path="home" element={<Home />} />
    <Route path="product-passport" element={<ProductPassport />} />
    <Route path="service-requests" element={<ServiceRequests />} />
    <Route path="complaints" element={<Complaints />} />
    <Route path="tracking" element={<Tracking />} />
    <Route path="history" element={<History />} />
    <Route path="notifications" element={<NotificationsScreen />} />
    <Route path="profile" element={<Profile />} />
  </Route>
);
