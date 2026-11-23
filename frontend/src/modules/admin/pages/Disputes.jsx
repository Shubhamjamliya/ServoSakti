import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, humanize } from '@/shared/lib/format';

export default function Disputes() {
  const toast = useToast();
  const [resolve, setResolve] = useState(null); // { row, decision }
  const [version, setVersion] = useState(0);

  return (
    <>
      <ResourcePage
        eyebrow="Operations"
        title="Disputes"
        endpoint="/settlements/disputes"
        filterKey="status"
        filterLabel="All statuses"
        filterOptions={['open', 'approved', 'rejected'].map((v) => ({ value: v, label: humanize(v) }))}
        refreshKey={version}
        columns={[
          { key: 'srNumber', label: 'SR' },
          { key: 'kind', label: 'Type', render: (r) => (r.kind === 'service' ? 'Customer' : 'Payout') },
          { key: 'raisedByName', label: 'Raised by' },
          { key: 'reason', label: 'Reason', render: (r) => [r.category, r.reason].filter(Boolean).join(': ') },
          { key: 'vendorResponse', label: 'Vendor response', render: (r) => r.vendorResponse || '—' },
          { key: 'refundAmount', label: 'Refund', render: (r) => (r.refundAmount ? `₹${r.refundAmount}` : '—') },
          { key: 'createdAt', label: 'Raised', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
          { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
          { key: 'outcome', label: 'Outcome', render: (r) => r.outcome || '—' },
        ]}
        rowActions={({ row }) => row.status === 'open' && (
          <>
            <Button size="sm" onClick={() => setResolve({ row, decision: 'approved' })}>Approve</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setResolve({ row, decision: 'rejected' })}>Reject</Button>
          </>
        )}
      />
      <PromptDialog
        open={!!resolve} onOpenChange={(o) => !o && setResolve(null)}
        title={`${resolve?.decision === 'approved' ? 'Approve' : 'Reject'} dispute · ${resolve?.row.srNumber}`}
        description={resolve?.row.reason} label="Outcome note" required destructive={resolve?.decision === 'rejected'}
        confirmLabel={resolve?.decision === 'approved' ? 'Approve' : 'Reject'}
        onConfirm={async (outcome) => {
          // a customer dispute decided in their favour can refund part or all of what they paid
          let refundAmount = 0;
          if (resolve.row.kind === 'service' && resolve.decision === 'approved') {
            const v = window.prompt('Refund to the customer (₹). Enter 0 for no refund.', '0');
            if (v === null) return;
            refundAmount = Number(v) || 0;
          }
          await api(`/settlements/disputes/${resolve.row._id}`, { method: 'PATCH', body: { decision: resolve.decision, outcome, refundAmount } });
          toast.success(`Dispute ${resolve.decision}`);
          setVersion((v) => v + 1);
        }}
      />
    </>
  );
}
