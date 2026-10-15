import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession, loginPath, roleFromPath } from '@/shared/constants/authRoles';
import { Bell, ChevronDown, LogOut, Menu, Search, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Input } from '@/shared/components/ui/input';
import { io } from 'socket.io-client';
import { useAuth } from '@/shared/context/AuthContext';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { fmtDateTime } from '@/shared/lib/format';

export default function AppNavbar({ onMenuClick, menu, panel }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const { data: notif, reload } = useApi('/notifications');

  // live notifications over the socket; fall back to the list refetch
  useEffect(() => {
    const socket = io('/', { auth: { token: getSession(roleFromPath()).token } });
    socket.on('notification', reload);
    return () => socket.disconnect();
  }, [reload]);

  const markRead = () => { if (notif?.unread) api('/notifications/read', { method: 'PATCH' }).then(reload).catch(() => {}); };

  const links = useMemo(() => menu.flatMap((m) => (m.type === 'link' ? [m] : m.items)), [menu]);
  const results = links.filter((l) => l.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [searchOpen]);

  const go = (path) => { setSearchOpen(false); setQuery(''); navigate(path); };
  const handleLogout = () => { const to = loginPath(user?.role); logout(); navigate(to, { replace: true }); };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <button onClick={onMenuClick} className="rounded-md p-2 text-neutral-700 hover:bg-neutral-100 lg:hidden" aria-label="Toggle menu">
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex max-w-md flex-1 justify-center">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 transition hover:bg-neutral-100"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Search pages...</span>
              <kbd className="hidden rounded border bg-white px-1.5 text-[10px] sm:block">Ctrl K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Popover onOpenChange={(o) => o && markRead()}>
              <PopoverTrigger asChild>
                <button className="relative rounded-lg p-2 text-neutral-700 hover:bg-neutral-100" aria-label="Notifications">
                  <Bell className="h-5 w-5" />
                  {notif?.unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{notif.unread > 9 ? "9+" : notif.unread}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
                <div className="max-h-80 overflow-y-auto">
                  {(notif?.items || []).map((x) => (
                    <div key={x._id} className="border-b px-4 py-3 last:border-0">
                      <p className="text-sm font-medium">{x.title}</p>
                      <p className="text-xs text-neutral-500">{x.body}</p>
                      <p className="mt-1 text-[10px] text-neutral-400">{fmtDateTime(x.createdAt)}</p>
                    </div>
                  ))}
                  {!notif?.items?.length && <p className="px-4 py-6 text-center text-sm text-neutral-500">No notifications yet</p>}
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white"><User className="h-4 w-4" /></span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-medium leading-tight">{user?.name || 'User'}</span>
                    <span className="block text-[10px] uppercase text-neutral-500">{panel.label}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-neutral-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => navigate(panel.homePath)}><User className="h-4 w-4" /> Dashboard</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} className="text-red-600"><LogOut className="h-4 w-4" /> Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Go to page</DialogTitle></DialogHeader>
          <Input ref={inputRef} placeholder="Type a page name..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <button key={r.path} onClick={() => go(r.path)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                {r.label}
              </button>
            ))}
            {results.length === 0 && <p className="px-3 py-2 text-sm text-neutral-500">No pages found</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
