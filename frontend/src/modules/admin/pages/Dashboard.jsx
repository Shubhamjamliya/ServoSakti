import { AlertTriangle, Building2, CheckCircle2, Clock, CreditCard, Headset, Route, ShieldCheck, UserCog, Users, Wallet, Zap } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { MetricCard, PageShell, PeriodSelect } from '@/shared/components/PageShell';
import { useApi } from '@/shared/lib/useApi';
import { inr, num } from '@/shared/lib/utils';

const COLORS = { Completed: '#16a34a', 'In Progress': '#0ea5e9', Pending: '#f59e0b', Breached: '#ef4444' };

export default function Dashboard() {
  const [period, setPeriod] = useState('overall');
  const { data: d, loading, error } = useApi(`/admin/dashboard?period=${period}`);
  const v = (x, f = num) => (loading ? '—' : f(x));

  return (
    <PageShell eyebrow="Admin Overview" title="Servoshakti Control Tower" actions={<PeriodSelect value={period} onChange={setPeriod} />}>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Pending Approvals" value={v(d?.pendingApprovals)} helper={loading ? '' : `OEM ${d?.pendingOems} · Service ${d?.pendingVendors} · Eng ${d?.pendingEngineers}`} icon={ShieldCheck} accent="bg-amber-100" path={d?.pendingOems ? '/admin/oems/approvals' : d?.pendingVendors ? '/admin/vendors/approvals' : '/admin/engineers/approvals'} />
        <MetricCard title="Open Requests" value={v(d?.open)} helper={`${v(d?.total)} total`} icon={Headset} accent="bg-sky-100" path="/admin/service-requests" />
        <MetricCard title="Unassigned" value={v(d?.unassigned)} helper="Need manual dispatch" icon={Route} accent="bg-rose-100" path="/admin/service-requests" />
        <MetricCard title="SLA Breaches" value={v(d?.breaches)} helper="Past TAT" icon={AlertTriangle} accent="bg-red-100" path="/admin/quality" />
        <MetricCard title="Completed" value={v(d?.closed)} helper={`Avg TAT ${v(d?.avgTatHours)} h`} icon={CheckCircle2} accent="bg-green-100" path="/admin/service-requests" />
        <MetricCard title="First-time Fix" value={loading ? '—' : `${d?.firstTimeFixPercent}%`} helper={`Repeat visits ${d?.repeatPercent ?? 0}%`} icon={Clock} accent="bg-violet-100" path="/admin/quality" />
        <MetricCard title="OEMs / Vendors" value={loading ? '—' : `${d?.oems} / ${d?.vendors}`} helper="Approved + pending" icon={Building2} accent="bg-orange-100" path="/admin/oems" />
        <MetricCard title="Engineers" value={v(d?.engineers)} helper="Approved" icon={UserCog} accent="bg-emerald-100" path="/admin/engineers" />
        <MetricCard title="Customers" value={v(d?.customers)} helper="Registered" icon={Users} accent="bg-cyan-100" path="/admin/customers" />
        <MetricCard title="Open Disputes" value={v(d?.openDisputes)} helper="Payment disputes" icon={AlertTriangle} accent="bg-yellow-100" path="/admin/disputes" />
        <MetricCard title="Pending Payments" value={v(d?.money?.unpaid, inr)} helper="Vendor amount unpaid" icon={Wallet} accent="bg-lime-100" path="/admin/payouts" />
        <MetricCard title="Platform Fee" value={v(d?.money?.fee, inr)} helper="All approved calls" icon={CreditCard} accent="bg-fuchsia-100" path="/admin/settlements" />
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
      <p className="text-xs text-neutral-400"><Zap className="mr-1 inline h-3 w-3" />Figures are live from the platform database.</p>
    </PageShell>
  );
}
