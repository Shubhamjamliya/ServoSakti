import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Headset, Share2, UserCog, Wallet } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { AcceptOfferDialog, PromptDialog } from '@/shared/components/Dialogs';
import { DataTable, MetricCard, PageShell, PeriodSelect } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';
import { inr, num } from '@/shared/lib/utils';

export default function Dashboard() {
  const toast = useToast();
  const [period, setPeriod] = useState('overall');
  const { data: d, loading } = useApi(`/service-requests/stats?period=${period}`);
  const { data: money } = useApi('/settlements/summary');
  const { data: engineers } = useApi('/engineers?status=approved&limit=1');
  const { data: recent, reload: reloadRecent } = useApi('/service-requests?limit=6');
  const { data: offers, reload: reloadOffers } = useApi('/dispatch/offers');
  const [accepting, setAccepting] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const v = (x, suffix = '') => (loading ? '—' : `${num(x)}${suffix}`);
  const refresh = () => { reloadOffers(); reloadRecent(); };

  return (
    <PageShell eyebrow="Service Company" title="Operations Overview" actions={<PeriodSelect value={period} onChange={setPeriod} />}>
      {offers?.total > 0 && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader><CardTitle className="flex items-center gap-2"><Share2 className="h-4 w-4" /> Partner requests waiting for you ({offers.total})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {offers.items.map((o) => (
              <div key={o._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-sm">
                <span><b>{o.srNumber}</b> · {o.sr?.brand} {o.sr?.model} · {o.sr?.city} · {humanize(o.sr?.jobType)}</span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setAccepting(o)}>Accept</Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRejecting(o)}>Decline</Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Open Calls" value={v(d?.open)} helper="Own + partner + platform" icon={Headset} accent="bg-sky-100" path="/vendor/local-calls" />
        <MetricCard title="Completed" value={v(d?.closed)} helper={`Avg TAT ${v(d?.avgTatHours, ' h')}`} icon={CheckCircle2} accent="bg-green-100" path="/vendor/local-calls" />
        <MetricCard title="SLA Breaches" value={v(d?.breaches)} helper="Past TAT" icon={AlertTriangle} accent="bg-red-100" path="/vendor/local-calls" />
        <MetricCard title="Engineers" value={engineers ? num(engineers.total) : '—'} helper="Approved" icon={UserCog} accent="bg-violet-100" path="/vendor/engineers" />
        <MetricCard title="Billable" value={money ? inr(money.totals.vendorAmount) : '—'} helper={`${money?.totals.calls ?? 0} approved calls`} icon={Wallet} accent="bg-emerald-100" path="/vendor/earnings" />
        <MetricCard title="Awaiting Payment" value={money ? inr(money.totals.pending) : '—'} helper="Approved, unpaid" icon={Clock} accent="bg-amber-100" path="/vendor/earnings" />
        <MetricCard title="First-time Fix" value={v(d?.firstTimeFixPercent, '%')} helper="Fixed in one visit" icon={CheckCircle2} accent="bg-fuchsia-100" path="/vendor/reports" />
        <MetricCard title="Repeat Calls" value={v(d?.repeatPercent, '%')} helper="Same serial in 30 days" icon={AlertTriangle} accent="bg-rose-100" path="/vendor/reports" />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Recent calls</h2>
        <DataTable
          rows={recent?.items || []}
          columns={[
            { key: 'srNumber', label: 'SR' },
            { key: 'customerName', label: 'Customer' },
            { key: 'model', label: 'Product', render: (r) => [r.brand, r.model].filter(Boolean).join(' ') },
            { key: 'city', label: 'City' },
            { key: 'engineerName', label: 'Engineer', render: (r) => r.engineerName || '—' },
            { key: 'origin', label: 'Call type', render: (r) => <Badge tone="blue">{humanize(r.origin)}</Badge> },
            { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
          ]}
        />
      </div>

      <AcceptOfferDialog offer={accepting} onClose={() => setAccepting(null)} onDone={refresh} />
      <PromptDialog
        open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={`Decline ${rejecting?.srNumber}`} label="Reason" required destructive confirmLabel="Decline"
        onConfirm={async (reason) => {
          await api(`/dispatch/offers/${rejecting._id}/reject`, { method: 'POST', body: { reason } });
          toast.success('Declined — the platform will offer it to the next partner');
          refresh();
        }}
      />
    </PageShell>
  );
}
