import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Empty, Screen } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { fmtDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

/** Shared by the Engineer and Customer apps. `back`: fallback path for the back button. */
export default function NotificationsScreen({ back }) {
  const { data, loading, reload } = useApi('/notifications');
  useEffect(() => {
    if (data?.unread) api('/notifications/read', { method: 'PATCH' }).then(reload).catch(() => {});
  }, [data?.unread, reload]);

  return (
    <Screen title="Notifications" subtitle="Updates on your calls and account" back={back}>
      {loading && <div className="h-40 animate-pulse rounded-[18px] bg-[#e8eef8]" />}
      {!loading && !data?.items?.length && <Empty icon={Bell}>Nothing yet. New updates will appear here.</Empty>}
      <div className="space-y-2">
        {(data?.items || []).map((n) => (
          <div key={n._id} className={cn('flex gap-3 rounded-[18px] border bg-white p-3.5 shadow-[0_2px_10px_rgba(15,35,80,0.04)]', n.read ? 'border-[#e6ebf3]' : 'border-[#bcd2fa]')}>
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', n.read ? 'bg-[#f1f4f9] text-[#8a93a5]' : 'bg-[#e9f0fe] text-[#1456d8]')}>
              <Bell className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-bold text-[#0b1324]">{n.title}</p>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1456d8]" />}
              </div>
              <p className="text-[12.5px] text-[#4a5263]">{n.body}</p>
              <p className="mt-1 text-[11px] text-[#8a93a5]">{fmtDateTime(n.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
