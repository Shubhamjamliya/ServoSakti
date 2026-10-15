import { Gift } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Empty, Panel, Screen, Section, StatusPill } from '@/shared/components/Mobile';
import { useApi } from '@/shared/lib/useApi';
import { fmtDate } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

export default function Earnings() {
  const { data: pay, loading } = useApi('/settlements/payouts?limit=100');
  const { data: inc } = useApi('/settlements/incentives');
  const items = pay?.items || [];
  const paid = items.filter((p) => p.paymentStatus === 'paid').reduce((a, p) => a + p.engineerAmount, 0);
  const due = items.filter((p) => p.paymentStatus === 'unpaid' && p.approval === 'approved').reduce((a, p) => a + p.engineerAmount, 0);
  const pending = items.filter((p) => p.approval !== 'approved').reduce((a, p) => a + p.engineerAmount, 0);

  return (
    <Screen title="Earnings" subtitle="Call-wise payouts and monthly incentive">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Paid', paid, 'bg-green-50'], ['Approved', due, 'bg-sky-50'], ['In review', pending, 'bg-amber-50']].map(([k, v, bg]) => (
          <div key={k} className={`rounded-2xl border p-3 ${bg}`}><p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{k}</p><p className="text-lg font-bold">{inr(v)}</p></div>
        ))}
      </div>

      <Section title="Monthly incentive">
        {(inc?.items || []).slice(0, 3).map((i) => (
          <Panel key={i._id} className="flex items-center justify-between">
            <div className="flex items-center gap-3"><Gift className="h-5 w-5 text-primary" /><div><p className="font-semibold">{i.month}</p><p className="text-sm text-neutral-500">{i.approvedCalls} / {i.target} approved calls · {i.rechargeDays}-day recharge</p></div></div>
            <StatusPill status={i.status} />
          </Panel>
        ))}
        {!inc?.items?.length && <Empty>No incentive progress yet this month.</Empty>}
      </Section>

      <Section title="Call payouts">
        {!loading && items.length === 0 && <Empty>No payouts yet. They appear after a call is approved.</Empty>}
        {items.map((p) => (
          <Panel key={p._id} className="flex items-center justify-between">
            <div><p className="font-semibold">{p.srNumber}</p><p className="text-sm text-neutral-500">{p.brand} · {fmtDate(p.createdAt)}</p></div>
            <div className="text-right"><p className="font-bold">{inr(p.engineerAmount)}</p><Badge>{p.paymentStatus === 'paid' ? 'Paid' : p.approval === 'approved' ? 'Approved' : p.approval === 'held' ? 'Held' : 'Pending'}</Badge></div>
          </Panel>
        ))}
      </Section>
    </Screen>
  );
}
