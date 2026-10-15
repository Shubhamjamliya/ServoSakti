import { AlertTriangle, Building2, CheckCircle2, Clock, Headset, Repeat, ShieldCheck, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { DataTable, MetricCard, PageShell, PeriodSelect } from '@/shared/components/PageShell';
import { useApi } from '@/shared/lib/useApi';
import { humanize } from '@/shared/lib/format';
import { num } from '@/shared/lib/utils';

const COLORS = { Completed: '#16a34a', 'In Progress': '#0ea5e9', Pending: '#f59e0b', Breached: '#ef4444' };

export default function Dashboard() {
  const [period, setPeriod] = useState('overall');
  const { data: d, loading, error } = useApi(`/service-requests/stats?period=${period}`);
  const { data: recent } = useApi('/service-requests?limit=6');
  const { data: vendors } = useApi('/companies/authorizations?status=active&limit=1');
  const v = (x, suffix = '') => (loading ? '—' : `${num(x)}${suffix}`);

  return (
    <PageShell eyebrow="OEM Overview" title="Service Command Center" actions={<PeriodSelect value={period} onChange={setPeriod} />}>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Open Requests" value={v(d?.open)} helper={`${v(d?.total)} total raised`} icon={Headset} accent="bg-sky-100" path="/oem/service-requests" />
        <MetricCard title="SLA Breaches" value={v(d?.breaches)} helper="Needs escalation" icon={AlertTriangle} accent="bg-red-100" path="/oem/sla-tat" />
        <MetricCard title="Closed" value={v(d?.closed)} helper="Approved or closed" icon={CheckCircle2} accent="bg-green-100" path="/oem/service-requests" />
        <MetricCard title="Avg TAT" value={v(d?.avgTatHours, ' h')} helper="Request to approval" icon={Clock} accent="bg-amber-100" path="/oem/sla-tat" />
        <MetricCard title="Warranty Calls" value={v(d?.warrantyCalls)} helper="In-warranty requests" icon={ShieldCheck} accent="bg-emerald-100" path="/oem/warranty" />
        <MetricCard title="Authorized Vendors" value={vendors ? num(vendors.total) : '—'} helper="Active authorizations" icon={Building2} accent="bg-orange-100" path="/oem/vendors" />
        <MetricCard title="First-time Fix" value={v(d?.firstTimeFixPercent, '%')} helper="Fixed in one visit" icon={Wrench} accent="bg-violet-100" path="/oem/reports" />
        <MetricCard title="Repeat Visits" value={v(d?.repeatPercent, '%')} helper="Same serial within 30 days" icon={Repeat} accent="bg-rose-100" path="/oem/reports" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Service volume · last 6 months</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.monthly || []}>
                <defs>
                  <linearGradient id="req" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#92400e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#92400e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7dfd1" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="requests" name="Requests" stroke="#92400e" fill="url(#req)" strokeWidth={2} />
                <Area type="monotone" dataKey="closed" name="Closed" stroke="#16a34a" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Status mix</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d?.statusBreakdown || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {(d?.statusBreakdown || []).map((s) => <Cell key={s.name} fill={COLORS[s.name]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Recent requests</h2>
        <DataTable
          rows={recent?.items || []}
          columns={[
            { key: 'srNumber', label: 'SR' },
            { key: 'customerName', label: 'Customer' },
            { key: 'model', label: 'Product', render: (r) => [r.brand, r.model].filter(Boolean).join(' ') },
            { key: 'vendorName', label: 'Service company', render: (r) => r.vendorName || '—' },
            { key: 'priority', label: 'Priority', render: (r) => <Badge>{r.priority}</Badge> },
            { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
          ]}
        />
      </div>
    </PageShell>
  );
}
