import { Star } from 'lucide-react';
import { Empty, Panel, Screen, StatusPill } from '@/shared/components/Mobile';
import { useApi } from '@/shared/lib/useApi';
import { fmtDate, humanize } from '@/shared/lib/format';

export default function History() {
  const { data, loading } = useApi('/service-requests?limit=100');
  const done = (data?.items || []).filter((r) => ['approved', 'closed', 'cancelled'].includes(r.status));

  return (
    <Screen title="Service history" subtitle="Completed and cancelled requests">
      {!loading && done.length === 0 && <Empty>No completed services yet.</Empty>}
      {done.map((r) => (
        <Panel key={r._id} className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-semibold">{r.srNumber} · {[r.brand, r.model].filter(Boolean).join(' ')}</p><p className="text-sm text-neutral-500">{fmtDate(r.createdAt)} · {humanize(r.jobType)} · {humanize(r.warranty)}</p></div>
            <StatusPill status={r.status} />
          </div>
          {r.issue && <p className="text-sm text-neutral-600">{r.issue}</p>}
          <p className="text-xs text-neutral-500">{r.engineerName ? `Serviced by ${r.engineerName}` : ''}{r.rating ? <span className="ml-2 inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.rating}</span> : null}</p>
        </Panel>
      ))}
    </Screen>
  );
}
