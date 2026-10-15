import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AppSidebar from '@/shared/layout/AppSidebar';
import AppNavbar from '@/shared/layout/AppNavbar';
import { panels, sidebarMenus } from '@/shared/constants/sidebarMenus';
import { loginPath } from '@/shared/constants/authRoles';
import { useAuth } from '@/shared/context/AuthContext';

// One shell for the OEM, Vendor and Admin panels. Only the menu/brand differ.
export default function AppLayout({ panel: key }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const panel = panels[key];
  const menu = sidebarMenus[key];

  if (user?.role !== panel.role) return <Navigate to={loginPath(panel.role)} replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <AppSidebar
        menu={menu}
        brand={panel.brand}
        homePath={panel.homePath}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapseChange={setCollapsed}
      />

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${collapsed ? 'lg:ml-20' : 'lg:ml-80'}`}>
        <AppNavbar onMenuClick={() => setSidebarOpen((v) => !v)} menu={menu} panel={panel} />
        <main className="min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
