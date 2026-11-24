import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const bankText = (b) => (b ? [b.accountName, b.accountNumber && `A/c ${b.accountNumber}`, b.ifsc, b.upi && `UPI ${b.upi}`].filter(Boolean).join(' · ') : '—');

/**
 * Engineer and service company withdrawals. The amount left their wallet when they asked; transfer it from the bank
 * (manually), then mark it paid with the UTR — or reject it and the money goes back to their wallet.
 */
export default function Withdrawals() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null); // { row, action }
  return (
    <>
      <ResourcePage
        eyebrow="Finance" title="Withdrawals" endpoint="/wallet/withdrawals" refreshKey={version}
        filterKey="status" filterLabel="All withdrawals" filterOptions={[{ value: 'requested', label: 'Waiting' }, { value: 'paid', label: 'Paid' }, { value: 'rejected', label: 'Rejected' }]}
        header={<p className="text-sm text-neutral-500">Pay each request by bank transfer / UPI to the details shown, then mark it paid with the reference. Rejecting returns the money to their wallet.</p>}
        columns={[
          { key: 'createdAt', label: 'Requested', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'ownerName', label: 'Name', render: (r) => `${r.ownerName || ''}${r.ownerPhone ? ` · ${r.ownerPhone}` : ''}` },
          { key: 'ownerType', label: 'Type', render: (r) => (r.ownerType === 'vendor' ? 'Service company' : 'Engineer') },
          { key: 'amount', label: 'Amount', render: (r) => <b>{inr(r.amount)}</b> },
          { key: 'bank', label: 'Pay to', render: (r) => bankText(r.bank), csv: (r) => bankText(r.bank) },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={{ requested: 'amber', paid: 'green', rejected: 'red' }[r.status]}>{r.status === 'requested' ? 'Waiting' : humanize(r.status)}</Badge> },
          { key: 'reference', label: 'Reference / note', render: (r) => r.reference || r.note || '—' },
        ]}
        rowActions={({ row }) => row.status === 'requested' && (
          <>
            <Button size="sm" onClick={() => setDialog({ row, action: 'paid' })}>Mark paid</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDialog({ row, action: 'reject' })}>Reject</Button>
          </>
        )}
      />
      <PromptDialog
        open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.action === 'paid' ? `Paid ${inr(dialog?.row.amount)} to ${dialog?.row.ownerName}` : `Reject ${dialog?.row.ownerName}'s withdrawal`}
        description={dialog?.action === 'paid' ? bankText(dialog?.row.bank) : 'The amount goes back to their wallet.'}
        label={dialog?.action === 'paid' ? 'UTR / UPI reference' : 'Reason'} required destructive={dialog?.action === 'reject'}
        confirmLabel={dialog?.action === 'paid' ? 'Mark paid' : 'Reject'}
        onConfirm={async (v) => {
          await api(`/wallet/withdrawals/${dialog.row._id}`, { method: 'PATCH', body: dialog.action === 'paid' ? { action: 'paid', reference: v } : { action: 'reject', note: v } });
          toast.success(dialog.action === 'paid' ? 'Marked paid' : 'Rejected, money returned to the wallet');
          setVersion((x) => x + 1);
        }}
      />
    </>
  );
}
