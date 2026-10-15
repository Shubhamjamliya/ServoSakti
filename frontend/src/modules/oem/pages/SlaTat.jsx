import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { PageShell } from '@/shared/components/PageShell';
import { useApi } from '@/shared/lib/useApi';

const BAR = { Breached: 'bg-red-500', 'At Risk': 'bg-amber-500', 'On Track': 'bg-green-500' };

export default function SlaTat() {
  const { data, loading, error } = useApi('/service-requests/sla');
  const items = data?.items || [];

  return (
    <PageShell eyebrow="Service" title="SLA / TAT">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {['Breached', 'At Risk', 'On Track'].map((s) => (
          <Card key={s}>
            <CardContent>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">{s}</p>
              <p className="text-2xl font-bold">{loading ? '—' : items.filter((r) => r.status === s).length}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {items.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.sr} · {r.customer}</p>
                  <p className="text-xs text-neutral-500">Service company: {r.vendor} · Priority {r.priority}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-600">{r.due}</span>
                  <Badge>{r.status}</Badge>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className={`h-full rounded-full ${BAR[r.status]}`} style={{ width: `${r.progress}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && items.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">No open requests with a TAT clock.</p>}
      </div>
    </PageShell>
  );
}
