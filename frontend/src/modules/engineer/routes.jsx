import { Navigate, Route } from 'react-router-dom';
import EngineerLayout from '@/shared/layout/EngineerLayout.jsx';
import NotificationsScreen from '@/shared/components/NotificationsScreen.jsx';
import Home from './pages/Home.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Earnings from './pages/Earnings.jsx';
import Profile from './pages/Profile.jsx';

// Bottom bar: Home, Jobs, Earnings, Profile (see EngineerLayout). Alerts open from the bell in the header.

export const engineerRoutes = (
  <Route path="/engineer" element={<EngineerLayout />}>
    <Route index element={<Navigate to="home" replace />} />
    <Route path="home" element={<Home />} />
    <Route path="jobs" element={<Jobs />} />
    <Route path="jobs/:id" element={<JobDetail />} />
    <Route path="earnings" element={<Earnings />} />
    <Route path="notifications" element={<NotificationsScreen back="/engineer/home" />} />
    <Route path="profile" element={<Profile />} />
  </Route>
);
