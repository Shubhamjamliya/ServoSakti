import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Empty, Panel, Screen } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { fmtDateTime } from '@/shared/lib/format';

/** Shared by the Engineer and Customer apps. */
export default function NotificationsScreen() {
  const { data, loading, reload } = useApi('/notifications');
  useEffect(() => {
    if (data?.unread) api('/notifications/read', { method: 'PATCH' }).then(reload).catch(() => {});
  }, [data?.unread, reload]);

  return (
    <Screen title="Notifications">
      {!loading && !data?.items?.length && <Empty>Nothing yet.</Empty>}
      <div className="space-y-2">
        {(data?.items || []).map((n) => (
          <Panel key={n._id} className="flex gap-3">
            <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${n.read ? 'text-neutral-300' : 'text-primary'}`} />
            <div><p className="font-medium">{n.title}</p><p className="text-sm text-neutral-600">{n.body}</p><p className="mt-1 text-[10px] text-neutral-400">{fmtDateTime(n.createdAt)}</p></div>
          </Panel>
        ))}
      </div>
    </Screen>
  );
}
