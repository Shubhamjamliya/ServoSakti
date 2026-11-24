import { useEffect } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, Briefcase, House, User, Wallet } from 'lucide-react';
import { loginPath } from '../constants/authRoles.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../lib/useApi.js';
import { useBranding } from '../lib/useBranding.js';
import { BRAND } from '../constants/sidebarMenus.js';
import { cn } from '../lib/utils.js';
import { MOBILE_THEME } from './mobileTheme.js';
import { DutyProvider, DutyToggle } from '../../modules/engineer/duty.jsx';
import OfferRingBanner from '../components/OfferRingBanner.jsx';

const NAV = [
  { to: 'home', label: 'Home', icon: House },
  { to: 'jobs', label: 'Jobs', icon: Briefcase },
  { to: 'earnings', label: 'Earnings', icon: Wallet },
  { to: 'profile', label: 'Profile', icon: User },
];

/** Logo + business name (Admin → Business Setup), with "Engineer" under it. Same look as the customer app header. */
function BrandHeader() {
  const b = useBranding();
  const name = b?.companyName || BRAND.name;
  const logo = b?.engineerLogo || b?.logo || '/images/aftenza-mark.png';
  return (
    <Link to="/engineer/home" className="flex min-w-0 items-center gap-2.5">
      <img src={logo} alt="" className="h-11 w-11 shrink-0 object-contain" />
      <div className="min-w-0 leading-none">
        <p className="truncate text-[20px] uppercase tracking-[0.02em] text-[#0b1324]" style={{ fontFamily: "'Russo One', sans-serif" }}>{name}</p>
        <p className="mt-1 truncate text-[9.5px] font-semibold uppercase tracking-[0.35em] text-[#1456d8]">Engineer</p>
      </div>
    </Link>
  );
}

/** Engineer app shell: customer-app theme, brand header with the alerts bell, and a 4-tab bottom bar. */
export default function EngineerLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { data: notif, reload } = useApi(user?.role === 'engineer' ? '/notifications' : null);
  useEffect(() => { if (user?.role === 'engineer') reload(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role !== 'engineer') return <Navigate to={loginPath('engineer')} replace />;

  return (
    <DutyProvider>
    <div className="min-h-screen bg-[#e9edf4]" style={MOBILE_THEME}>
      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[var(--background)] text-[var(--foreground)] shadow-[0_0_40px_rgba(15,35,80,0.08)]">
        <header className="sticky top-0 z-30 bg-[var(--background)] px-4 pb-2 pt-4">
          <div className="flex items-center justify-between gap-2">
            <BrandHeader />
            <div className="flex shrink-0 items-center gap-2">
              <DutyToggle />
              <Link to="/engineer/notifications" aria-label="Notifications" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_4px_14px_rgba(15,35,80,0.08)] ring-1 ring-[#eef1f6]">
                <Bell className="h-5 w-5" strokeWidth={2.2} />
                {notif?.unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ef3b3b] ring-2 ring-white" />}
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-2"><Outlet /></main>
        <OfferRingBanner to="/engineer/home" floating />

        <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-[#e6ebf3] bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="grid h-16 grid-cols-4">
            {NAV.map((item) => (
              <NavLink key={item.to} to={`/engineer/${item.to}`} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-[var(--primary)]' : 'text-[#7a8396]')}>
                <item.icon className="h-[22px] w-[22px]" strokeWidth={1.9} />{item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
    </DutyProvider>
  );
}
