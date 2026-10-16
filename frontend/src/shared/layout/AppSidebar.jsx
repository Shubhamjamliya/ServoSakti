import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Building2, ChevronLeft, ChevronRight, CreditCard, DollarSign, Headset,
  LayoutDashboard, MapPin, Package, Receipt, Route, Search, Settings, Code, Briefcase, Factory, ShieldCheck, Star, UserCog,
  Users, Wallet, X, Zap, Megaphone,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/components/ui/input';
import BrandMark, { useBrand } from '@/shared/components/BrandMark';
import { panels } from '@/shared/constants/sidebarMenus';

const iconMap = {
  AlertTriangle, BarChart3, Building2, CreditCard, DollarSign, Headset, LayoutDashboard, MapPin, Package,
  Receipt, Route, Settings, Code, Briefcase, Factory, ShieldCheck, Star, UserCog, Users, Wallet, Zap,
  Megaphone,
};

const STORAGE_KEY = 'sf_sidebar_state';
const readState = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
};

export default function AppSidebar({ menu, brand, homePath, isOpen, onClose, onCollapseChange, badges = {} }) {
  const location = useLocation();
  const role = Object.values(panels).find((p) => p.homePath === homePath)?.role;
  const { name } = useBrand(role);
  const [query, setQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(() => !!readState().isCollapsed);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ isCollapsed })); } catch { /* storage unavailable */ }
    onCollapseChange?.(isCollapsed);
  }, [isCollapsed, onCollapseChange]);

  const isActive = (path) => {
    const current = location.pathname.replace(/\/+$/, '') || '/';
    if (path === homePath) return current === path;
    return current === path || current.startsWith(`${path}/`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menu;
    return menu.flatMap((item) => {
      if (item.type === 'link') return item.label.toLowerCase().includes(q) ? [item] : [];
      const items = item.items.filter((s) => s.label.toLowerCase().includes(q));
      return items.length ? [{ ...item, items }] : [];
    });
  }, [query, menu]);

  const renderLink = (item, key, index, inSection) => {
    const Icon = iconMap[item.icon] || LayoutDashboard;
    const active = isActive(item.path);
    const badge = badges[item.path] || 0;
    return (
      <Link
        key={key}
        to={item.path}
        onClick={() => window.innerWidth < 1024 && onClose?.()}
        title={isCollapsed ? item.label : undefined}
        style={{ animationDelay: `${index * 0.04}s` }}
        className={cn(
          'menu-item-animate relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-300 ease-out',
          inSection && 'font-semibold',
          active ? 'bg-white font-semibold text-neutral-950 shadow-md shadow-black/10' : 'text-white/90 hover:bg-white/10 hover:text-white',
          isCollapsed && 'justify-center px-2'
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0 transition-all duration-300', active ? 'scale-110 text-neutral-950' : 'text-white/85')} />
        {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!isCollapsed && badge > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-neutral-900 bg-sidebar',
        'transition-all duration-300 ease-in-out lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        isCollapsed ? 'w-20' : 'w-80'
      )}
    >
      <div className="shrink-0 border-b border-neutral-800 bg-black/20 px-3 py-3">
        <div className="mb-3 flex items-center justify-between">
          <Link to={homePath} className={cn('flex min-w-0 items-center gap-2 px-1', isCollapsed && 'w-full justify-center')}>
            <BrandMark role={role} className="h-9 w-9 shrink-0" />
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold leading-tight text-white">{name}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/50">{brand}</p>
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCollapsed((v) => !v)}
              className="hidden rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white lg:block"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="text-white/80 hover:text-white lg:hidden"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/60" />
            <Input
              placeholder="Search menu..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-white/20 bg-white/10 pl-9 pr-9 text-white placeholder:text-white/50 focus-visible:ring-white/40"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-white/60 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
        {filtered.length === 0 ? (
          <div className="section-fade-in px-3 py-10 text-center">
            <p className="text-sm font-medium text-white/60">No menu items found</p>
            <p className="mt-1 text-xs text-white/40">Try a different search term</p>
          </div>
        ) : (
          filtered.map((item, index) =>
            item.type === 'link' ? (
              renderLink(item, index, index, false)
            ) : (
              <div key={index} className={cn('section-fade-in', index > 0 && 'mt-4')} style={{ animationDelay: `${index * 0.06}s` }}>
                {!isCollapsed && (
                  <div className="mb-1 px-3 py-1.5">
                    <span className="text-sm font-bold uppercase tracking-wider text-white/60">{item.label}</span>
                  </div>
                )}
                <div className="space-y-1">{item.items.map((sub, i) => renderLink(sub, `${index}-${i}`, i, true))}</div>
              </div>
            )
          )
        )}
      </nav>
    </div>
  );
}
