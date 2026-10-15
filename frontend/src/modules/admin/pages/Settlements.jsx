import { CreditCard, Percent, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { DataTable, MetricCard, PageShell } from '@/shared/components/PageShell';
import { Button } from '@/shared/components/ui/button';
import { useApi } from '@/shared/lib/useApi';
import { downloadCsv } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const cols = (label) => [
  { key: 'name', label },
  { key: 'calls', label: 'Calls' },
  { key: 'vendorAmount', label: 'Vendor amount', render: (r) => inr(r.vendorAmount), csv: (r) => r.vendorAmount },
  { key: 'engineerAmount', label: 'Engineer amount', render: (r) => inr(r.engineerAmount), csv: (r) => r.engineerAmount },
  { key: 'platformFee', label: 'Platform fee', render: (r) => inr(r.platformFee), csv: (r) => r.platformFee },
];

export default function Settlements() {
  const { data, loading, error } = useApi('/settlements/summary');
  const t = data?.totals;
  const v = (x) => (loading ? '—' : inr(x));

  return (
    <PageShell
      eyebrow="Finance"
      title="Settlements"
      actions={data && <Button variant="outline" onClick={() => downloadCsv('settlements-by-oem', cols('OEM'), data.byOem)}>Export OEM-wise</Button>}
    >
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Billable to OEMs" value={v(t?.vendorAmount)} helper={`${t?.calls ?? 0} approved calls`} icon={Receipt} accent="bg-sky-100" />
        <MetricCard title="Engineer Payouts" value={v(t?.engineerAmount)} helper="Across all calls" icon={Wallet} accent="bg-green-100" />
        <MetricCard title="Platform Fee" value={v(t?.platformFee)} helper="Servoshakti revenue" icon={CreditCard} accent="bg-amber-100" />
        <MetricCard title="GST on billing" value={v(t?.tax)} helper="At configured rate" icon={Percent} accent="bg-violet-100" />
      </div>
      <Card>
        <CardHeader><CardTitle>OEM-wise billing</CardTitle></CardHeader>
        <CardContent><DataTable columns={cols('OEM')} rows={data?.byOem || []} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Service company settlement</CardTitle></CardHeader>
        <CardContent><DataTable columns={cols('Service company')} rows={data?.byVendor || []} /></CardContent>
      </Card>
      <p className="text-xs text-neutral-400">Tax figures use the GST rate in Settings; final tax treatment needs confirmation from the client's accountant.</p>
    </PageShell>
  );
}
