import { createContext, useContext, useState } from 'react';
import { api } from '@/shared/lib/api';
import { getPosition } from '@/shared/lib/geo';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { cn } from '@/shared/lib/utils';

/**
 * Online / offline for the engineer app, shared by the header toggle, the Home card and Profile.
 * Online = available for dispatch AND today's day started (going online starts it with GPS). Offline stops new
 * offers; jobs already accepted stay. The 11:59 PM day close puts everyone offline.
 */
const DutyContext = createContext(null);

export function DutyProvider({ children }) {
  const toast = useToast();
  const me = useApi('/engineers/me');
  const day = useApi('/field/day');
  const [busy, setBusy] = useState(false);
  const today = day.data?.day;
  const dayClosed = !!today?.closedAt;
  const online = !!me.data?.available && !!today && !dayClosed;

  const setOnline = async (next) => {
    setBusy(true);
    try {
      const body = { online: next, ...(next ? await getPosition() : {}) };
      await api('/engineers/me/duty', { method: 'POST', body });
      toast.success(next ? "You're online — new calls can reach you" : "You're offline — no new calls until you go online");
      me.reload();
      day.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const value = { me: me.data, reloadMe: me.reload, day: today, dayClosed, online, busy, loading: !me.data || !day.data, setOnline };
  return <DutyContext.Provider value={value}>{children}</DutyContext.Provider>;
}

export const useDuty = () => useContext(DutyContext);

/** Compact Online / Offline switch for the header. */
export function DutyToggle() {
  const { online, busy, loading, dayClosed, setOnline } = useDuty();
  if (loading) return <span className="h-9 w-[92px] animate-pulse rounded-full bg-[#e8eef8]" />;
  return (
    <button
      type="button" role="switch" aria-checked={online} disabled={busy || (dayClosed && !online)} onClick={() => setOnline(!online)}
      title={dayClosed ? 'Your day is closed. Go online again tomorrow.' : online ? 'Go offline' : 'Go online'}
      className={cn('flex h-9 shrink-0 items-center gap-2 rounded-full py-1 pl-3 pr-1 text-[12px] font-bold shadow-[0_4px_14px_rgba(15,35,80,0.08)] ring-1 transition disabled:opacity-60',
        online ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-[#5d667a] ring-[#eef1f6]')}
    >
      {busy ? '...' : online ? 'Online' : 'Offline'}
      <span className={cn('relative h-7 w-12 rounded-full transition', online ? 'bg-emerald-500' : 'bg-[#cfd6e2]')}>
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', online ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}
