import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

export default function Payouts() {
  const toast = useToast();
  const [prompt, setPrompt] = useState(null); // { row, action }
  const [version, setVersion] = useState(0);
  const act = async (row, action, extra = {}) => {
    await api(`/settlements/payouts/${row._id}`, { method: 'PATCH', body: { action, ...extra } });
    toast.success(`Payout ${action === 'pay' ? 'marked paid' : action === 'hold' ? 'held' : action === 'release' ? 'released' : 'approved'}`);
    setVersion((v) => v + 1);
  };
  const quick = (row, action) => act(row, action).catch((e) => toast.error(e.message));

  return (
    <>
      <ResourcePage
        eyebrow="Finance"
        title="Payouts"
        endpoint="/settlements/payouts"
        filterKey="approval"
        filterLabel="All approvals"
        filterOptions={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'held', label: 'Held' }]}
        refreshKey={version}
        columns={[
          { key: 'srNumber', label: 'SR' },
          { key: 'vendorName', label: 'Service company' },
          { key: 'engineerName', label: 'Engineer' },
          { key: 'jobType', label: 'Job', render: (r) => `${labelOf(JOB_TYPES, r.jobType)} · ${r.warranty === 'warranty' ? 'W' : 'NW'}`, csv: (r) => r.jobType },
          { key: 'vendorAmount', label: 'Vendor', render: (r) => (r.rateMissing ? <Badge tone="red">No rate card</Badge> : inr(r.vendorAmount)) },
          { key: 'engineerAmount', label: 'Engineer', render: (r) => inr(r.engineerAmount) },
          { key: 'platformFee', label: 'Fee', render: (r) => inr(r.platformFee) },
          { key: 'tax', label: 'GST', render: (r) => inr(r.tax) },
          { key: 'approval', label: 'Approval', render: (r) => <Badge>{r.approval[0].toUpperCase() + r.approval.slice(1)}</Badge> },
          { key: 'paymentStatus', label: 'Payment', render: (r) => <Badge>{r.paymentStatus[0].toUpperCase() + r.paymentStatus.slice(1)}</Badge> },
        ]}
        rowActions={({ row }) => (
          <>
            {row.approval === 'pending' && !row.rateMissing && <Button size="sm" onClick={() => quick(row, 'approve')}>Approve</Button>}
            {row.approval === 'approved' && row.paymentStatus === 'unpaid' && <Button size="sm" onClick={() => setPrompt({ row, action: 'pay' })}>Mark paid</Button>}
            {row.approval !== 'held' && row.paymentStatus === 'unpaid' && <Button size="sm" variant="outline" onClick={() => setPrompt({ row, action: 'hold' })}>Hold</Button>}
            {row.approval === 'held' && <Button size="sm" variant="outline" onClick={() => quick(row, 'release')}>Release</Button>}
          </>
        )}
      />
      <PromptDialog
        open={!!prompt} onOpenChange={(o) => !o && setPrompt(null)}
        title={prompt?.action === 'pay' ? `Mark ${prompt?.row.srNumber} as paid` : `Hold ${prompt?.row.srNumber}`}
        label={prompt?.action === 'pay' ? 'Transaction reference (UTR)' : 'Reason'} required
        inputProps={prompt?.action === 'pay' ? { placeholder: 'e.g. UTR1234567890' } : undefined}
        confirmLabel={prompt?.action === 'pay' ? 'Mark paid' : 'Hold payout'}
        onConfirm={(v) => act(prompt.row, prompt.action, prompt.action === 'pay' ? { txnRef: v } : { note: v })}
      />
    </>
  );
}
