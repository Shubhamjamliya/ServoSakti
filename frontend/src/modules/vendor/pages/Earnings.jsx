import { useState } from 'react';
import { Clock, CreditCard, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import { MetricCard } from '@/shared/components/PageShell';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

export default function Earnings() {
  const toast = useToast();
  const { data } = useApi('/settlements/summary');
  const [disputing, setDisputing] = useState(null);
  const t = data?.totals;

  return (
    <>
      <ResourcePage
        eyebrow="Finance"
        title="Earnings"
        endpoint="/settlements/payouts"
        filterKey="paymentStatus"
        filterLabel="All payments"
        filterOptions={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }]}
        header={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Billable" value={t ? inr(t.vendorAmount) : '—'} helper={`${t?.calls ?? 0} approved calls`} icon={Receipt} accent="bg-sky-100" />
            <MetricCard title="Awaiting Payment" value={t ? inr(t.pending) : '—'} helper="Approved, unpaid" icon={Clock} accent="bg-amber-100" />
            <MetricCard title="Engineer Payouts" value={t ? inr(t.engineerAmount) : '—'} helper="Owed to your engineers" icon={Wallet} accent="bg-green-100" />
            <MetricCard title="Platform Fee" value={t ? inr(t.platformFee) : '—'} helper="Servoshakti service fee" icon={CreditCard} accent="bg-violet-100" />
          </div>
        }
        columns={[
          { key: 'srNumber', label: 'SR' },
          { key: 'engineerName', label: 'Engineer' },
          { key: 'jobType', label: 'Job', render: (r) => `${labelOf(JOB_TYPES, r.jobType)} · ${r.warranty === 'warranty' ? 'W' : 'NW'}`, csv: (r) => r.jobType },
          { key: 'vendorAmount', label: 'Call amount', render: (r) => (r.rateMissing ? <Badge tone="red">Rate pending</Badge> : inr(r.vendorAmount)) },
          { key: 'engineerAmount', label: 'Engineer share', render: (r) => inr(r.engineerAmount) },
          { key: 'platformFee', label: 'Platform fee', render: (r) => inr(r.platformFee) },
          { key: 'approval', label: 'Approval', render: (r) => <Badge>{r.approval[0].toUpperCase() + r.approval.slice(1)}</Badge> },
          { key: 'paymentStatus', label: 'Payment', render: (r) => <Badge>{r.paymentStatus[0].toUpperCase() + r.paymentStatus.slice(1)}</Badge> },
          { key: 'txnRef', label: 'Txn ref', render: (r) => r.txnRef || '—' },
        ]}
        rowActions={({ row }) => row.paymentStatus === 'unpaid' && <Button size="sm" variant="outline" onClick={() => setDisputing(row)}>Dispute</Button>}
      />
      <PromptDialog
        open={!!disputing} onOpenChange={(o) => !o && setDisputing(null)} title={`Raise dispute · ${disputing?.srNumber}`}
        description="Tell Servoshakti what looks wrong with this payout. An admin will review it." label="Reason" required confirmLabel="Raise dispute"
        onConfirm={async (reason) => { await api('/settlements/disputes', { method: 'POST', body: { payoutId: disputing._id, reason } }); toast.success('Dispute raised'); }}
      />
    </>
  );
}
