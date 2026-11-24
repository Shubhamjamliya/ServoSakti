import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const STATUS = [
  { value: 'pending_approval', label: 'Waiting for approval' },
  { value: 'awaiting_customer', label: 'Customer to choose' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];
const TONE = { pending_approval: 'amber', awaiting_customer: 'blue', completed: 'green', rejected: 'red', cancelled: 'gray' };

/** Refunds never happen automatically: the customer picks wallet / original payment, the admin approves here. */
export default function Refunds() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [reject, setReject] = useState(null);
  const approve = async (row) => {
    if (!window.confirm(`Refund ${inr(row.amount)} to the customer's ${row.destination === 'wallet' ? 'wallet' : 'original payment'}?`)) return;
    try { await api(`/refunds/${row._id}/decide`, { method: 'PATCH', body: { decision: 'approve' } }); toast.success('Refund done'); setVersion((v) => v + 1); } catch (e) { toast.error(e.message); }
  };
  return (
    <>
      <ResourcePage
        eyebrow="Finance" title="Refunds" endpoint="/refunds" refreshKey={version}
        filterKey="status" filterLabel="All refunds" filterOptions={STATUS}
        header={<p className="text-sm text-neutral-500">Created when a customer paid more than the final bill (lower price on site, cancellation, rejected revised price, plan cancellation, dispute). The customer chooses wallet or original payment; you approve. Wallet refunds are instant; original-payment refunds reach the customer in 5–7 working days.</p>}
        columns={[
          { key: 'createdAt', label: 'Raised', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'srNumber', label: 'For', render: (r) => r.srNumber || 'AMC / CMC plan' },
          { key: 'customerName', label: 'Customer', render: (r) => `${r.customerName || ''} · ${r.customerPhone || ''}` },
          { key: 'amount', label: 'Amount', render: (r) => <b>{inr(r.amount)}</b> },
          { key: 'reason', label: 'Reason' },
          { key: 'destination', label: 'To', render: (r) => (r.destination ? (r.destination === 'wallet' ? 'Wallet' : 'Original payment') : '—') },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={TONE[r.status]}>{STATUS.find((s) => s.value === r.status)?.label || humanize(r.status)}</Badge> },
        ]}
        rowActions={({ row }) => row.status === 'pending_approval' && (
          <>
            <Button size="sm" onClick={() => approve(row)}>Approve</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setReject(row)}>Reject</Button>
          </>
        )}
      />
      <PromptDialog
        open={!!reject} onOpenChange={(o) => !o && setReject(null)} title={`Reject refund · ${reject?.srNumber || 'plan'}`} label="Reason (shown to the customer)" required destructive confirmLabel="Reject"
        onConfirm={async (note) => { await api(`/refunds/${reject._id}/decide`, { method: 'PATCH', body: { decision: 'reject', note } }); toast.success('Refund rejected'); setVersion((v) => v + 1); }}
      />
    </>
  );
}
