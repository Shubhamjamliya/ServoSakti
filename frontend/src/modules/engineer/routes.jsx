import { Navigate, Route } from 'react-router-dom';
import MobileLayout from '@/shared/layout/MobileLayout.jsx';
import NotificationsScreen from '@/shared/components/NotificationsScreen.jsx';
import Home from './pages/Home.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Earnings from './pages/Earnings.jsx';
import Profile from './pages/Profile.jsx';

const tabs = [
  ['home', 'Home'],
  ['jobs', 'Jobs'],
  ['earnings', 'Earnings'],
  ['notifications', 'Alerts'],
  ['profile', 'Profile'],
];

export const engineerRoutes = (
  <Route path="/engineer" element={<MobileLayout title="Servoshakti Engineer" base="/engineer" role="engineer" tabs={tabs} />}>
    <Route index element={<Navigate to="home" replace />} />
    <Route path="home" element={<Home />} />
    <Route path="jobs" element={<Jobs />} />
    <Route path="jobs/:id" element={<JobDetail />} />
    <Route path="earnings" element={<Earnings />} />
    <Route path="notifications" element={<NotificationsScreen />} />
    <Route path="profile" element={<Profile />} />
  </Route>
);
