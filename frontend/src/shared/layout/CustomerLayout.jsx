import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, ClipboardList, House, Package, Plus, Search, User, X } from 'lucide-react';
import { loginPath } from '../constants/authRoles.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../lib/useApi.js';
import { useBranding } from '../lib/useBranding.js';
import { BRAND } from '../constants/sidebarMenus.js';
import { cn } from '../lib/utils.js';

// Customer app palette + font. Scoped to this layout so the other panels keep their own theme.
const THEME = {
  '--background': '#f7f9fd', '--primary': '#1456d8', '--primary-foreground': '#ffffff',
  '--secondary': '#e9f0fe', '--secondary-foreground': '#0f3fa6', '--ring': '#1456d8',
  '--border': '#e6ebf3', '--input': '#e6ebf3', '--muted': '#f1f4f9', '--muted-foreground': '#5d667a',
  '--foreground': '#0b1324',
  fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
};

const NAV = [
  { to: 'home', label: 'Home', icon: House },
  { to: 'product-passport', label: 'Products', icon: Package },
  null, // centre "New Request" button
  { to: 'history', label: 'History', icon: ClipboardList },
  { to: 'profile', label: 'Profile', icon: User },
];

/** Uploaded logo mark + the company name as text in the brand font. Both come from Admin → Business Setup. */
function BrandHeader() {
  const b = useBranding();
  const name = b?.companyName || BRAND.name;
  const logo = b?.customerLogo || b?.logo || '/images/aftenza-mark.png';
  return (
    <Link to="/customer/home" className="flex min-w-0 items-center gap-2.5">
      <img src={logo} alt="" className="h-14 w-14 shrink-0 object-contain" />
      <div className="min-w-0 leading-none">
        <p className="truncate text-[25px] uppercase tracking-[0.02em] text-[#0b1324]" style={{ fontFamily: "'Russo One', sans-serif" }}>{name}</p>
        {b?.appTagline && <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.42em] text-[#0b1324]">{b.appTagline}</p>}
      </div>
    </Link>
  );
}

const IconBtn = ({ children, className, ...props }) => (
  <button type="button" className={cn('relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0b1324] shadow-[0_4px_14px_rgba(15,35,80,0.08)] ring-1 ring-[#eef1f6]', className)} {...props}>{children}</button>
);

export default function CustomerLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [searching, setSearching] = useState(!!params.get('q'));
  const { data: notif, reload } = useApi(user?.role === 'customer' ? '/notifications' : null);

  useEffect(() => { reload(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPublicPage = ['/customer/terms', '/customer/privacy', '/customer/support'].includes(pathname);
  if (user?.role !== 'customer' && !isPublicPage) return <Navigate to={loginPath('customer')} replace />;
  const onHome = pathname === '/customer/home';
  const search = (q) => navigate(q ? `/customer/home?q=${encodeURIComponent(q)}` : '/customer/home', { replace: onHome });

  return (
    <div className="min-h-screen bg-[#e9edf4]" style={THEME}>
      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[var(--background)] text-[var(--foreground)] shadow-[0_0_40px_rgba(15,35,80,0.08)]">
        <header className="sticky top-0 z-30 bg-[var(--background)] px-4 pb-2 pt-4">
          <div className="flex items-center justify-between gap-3">
            <BrandHeader />
            {user?.role === 'customer' && (
              <div className="flex shrink-0 items-center gap-2.5">
                <IconBtn aria-label="Search" onClick={() => { setSearching((v) => !v); if (searching) search(''); }}>
                  {searching ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" strokeWidth={2.2} />}
                </IconBtn>
                <Link to="/customer/notifications" aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-[0_4px_14px_rgba(15,35,80,0.08)] ring-1 ring-[#eef1f6]">
                  <Bell className="h-5 w-5" strokeWidth={2.2} />
                  {notif?.unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ef3b3b] ring-2 ring-white" />}
                </Link>
              </div>
            )}
          </div>
          {searching && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e6ebf3]">
              <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
              <input autoFocus defaultValue={params.get('q') || ''} onChange={(e) => search(e.target.value.trim())} placeholder="Search products or SR number" className="w-full bg-transparent text-sm outline-none" />
            </div>
          )}
        </header>

        <main className="flex-1 px-4 pb-24 pt-2"><Outlet /></main>

        {user?.role === 'customer' ? (
          <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-[#e6ebf3] bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="grid h-16 grid-cols-5">
              {NAV.map((item) => item ? (
                <NavLink key={item.to} to={`/customer/${item.to}`} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-[var(--primary)]' : 'text-[#7a8396]')}>
                  <item.icon className="h-[22px] w-[22px]" strokeWidth={1.9} />{item.label}
                </NavLink>
              ) : (
                <Link key="new" to="/customer/service-requests" aria-label="New request" className="flex items-center justify-center">
                  <span className="-mt-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[0_6px_16px_rgba(20,86,216,0.35)] ring-4 ring-white"><Plus className="h-6 w-6" strokeWidth={2.4} /></span>
                </Link>
              ))}
            </div>
          </nav>
        ) : (
          <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-[#e6ebf3] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-semibold text-[#0b1324]">Ready to manage your equipment?</p>
              <p className="text-[11px] text-[#5d667a]">Sign in with your mobile number</p>
            </div>
            <Link to="/customer/login" className="px-4 py-2 rounded-xl bg-[#1456d8] text-white text-xs font-bold hover:bg-[#1149b8] transition shadow-sm">
              Sign In
            </Link>
          </nav>
        )}
      </div>
    </div>
  );
}
