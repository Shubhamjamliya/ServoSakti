import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './modules/auth/pages/Login.jsx';
import Register from './modules/auth/pages/Register.jsx';
import Portals from './modules/auth/pages/Portals.jsx';
import { AUTH_ROLES } from './shared/constants/authRoles.js';
import { oemRoutes } from './modules/oem/routes.jsx';
import { vendorRoutes } from './modules/vendor/routes.jsx';
import { adminRoutes } from './modules/admin/routes.jsx';
import { engineerRoutes } from './modules/engineer/routes.jsx';
import { customerRoutes } from './modules/customer/routes.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Portals mode="login" />} />
      <Route path="/register" element={<Portals mode="register" />} />
      {Object.entries(AUTH_ROLES).map(([portal, r]) => (
        <Route key={portal} path={`${r.base}/login`} element={<Login portal={portal} />} />
      ))}
      {Object.entries(AUTH_ROLES).filter(([, r]) => r.register).map(([portal, r]) => (
        <Route key={portal} path={`${r.base}/register`} element={<Register portal={portal} />} />
      ))}
      {oemRoutes}
      {vendorRoutes}
      {adminRoutes}
      {engineerRoutes}
      {customerRoutes}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
