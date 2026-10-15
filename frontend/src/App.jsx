import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './modules/auth/pages/Login.jsx';
import { oemRoutes } from './modules/oem/routes.jsx';
import { vendorRoutes } from './modules/vendor/routes.jsx';
import { adminRoutes } from './modules/admin/routes.jsx';
import { engineerRoutes } from './modules/engineer/routes.jsx';
import { customerRoutes } from './modules/customer/routes.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {oemRoutes}
      {vendorRoutes}
      {adminRoutes}
      {engineerRoutes}
      {customerRoutes}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
