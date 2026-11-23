import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './modules/auth/pages/Login.jsx';
import { AUTH_ROLES } from './shared/constants/authRoles.js';
import { oemRoutes } from './modules/oem/routes.jsx';
import { vendorRoutes } from './modules/vendor/routes.jsx';
import { adminRoutes } from './modules/admin/routes.jsx';
import { engineerRoutes } from './modules/engineer/routes.jsx';
import { customerRoutes } from './modules/customer/routes.jsx';

export default function App() {
  return (
    <Routes>
      {Object.entries(AUTH_ROLES).map(([portal, r]) => (
        <Route key={portal} path={`${r.base}/login`} element={<Login portal={portal} />} />
      ))}
      {oemRoutes}
      {vendorRoutes}
      {adminRoutes}
      {engineerRoutes}
      {customerRoutes}
      <Route path="/" element={<Navigate to="/customer" replace />} />
      <Route path="*" element={<div className="grid min-h-screen place-items-center text-sm text-neutral-500">Page not found</div>} />
    </Routes>
  );
}
