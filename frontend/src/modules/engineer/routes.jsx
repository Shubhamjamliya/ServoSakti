import { Navigate, Route } from 'react-router-dom';
import MobileLayout from '@/shared/layout/MobileLayout.jsx';
import Home from './pages/Home.jsx';
import Jobs from './pages/Jobs.jsx';
import Earnings from './pages/Earnings.jsx';
import Profile from './pages/Profile.jsx';
import DayStart from './pages/DayStart.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Notifications from './pages/Notifications.jsx';

const tabs = [
  ['home', 'Home'],
  ['jobs', 'Jobs'],
  ['earnings', 'Earnings'],
  ['profile', 'Profile'],
];

export const engineerRoutes = (
  <Route path="/engineer" element={<MobileLayout title="Engineer" base="/engineer" role="engineer" tabs={tabs} />}>
    <Route index element={<Navigate to="home" replace />} />
    <Route path="home" element={<Home />} />
    <Route path="jobs" element={<Jobs />} />
    <Route path="earnings" element={<Earnings />} />
    <Route path="profile" element={<Profile />} />
    <Route path="day-start" element={<DayStart />} />
    <Route path="job-detail" element={<JobDetail />} />
    <Route path="notifications" element={<Notifications />} />
  </Route>
);
