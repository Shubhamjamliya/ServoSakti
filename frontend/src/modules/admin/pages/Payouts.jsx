import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { CheckCheck, Download } from 'lucide-react';
import { api, downloadFile } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

/**
 * Job payouts. Approving one credits the engineer's and the service company's wallets (in one transaction, once);
 * they then ask for a withdrawal, which you pay manually under Finance → Withdrawals.
 */
export default function Payouts() {
  const toast = useToast();
  const [hold, setHold] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const act = async (row, action, extra = {}) => {
    try {
      await api(`/settlements/payouts/${row._id}`, { method: 'PATCH', body: { action, ...extra } });
      toast.success(action === 'approve' ? 'Approved — credited to the wallets' : action === 'hold' ? 'Payout held' : 'Released');
      refresh();
    } catch (e) { toast.error(e.message); }
  };
  const approveAll = async () => {
    if (!window.confirm('Approve every pending payout and credit the wallets?')) return;
    try { const r = await api('/settlements/payouts/approve-all', { method: 'POST', body: {} }); toast.success(`${r.approved} payouts approved`); refresh(); } catch (e) { toast.error(e.message); }
  };

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
        header={<p className="text-sm text-neutral-500">Approve a payout to credit the engineer&apos;s and service company&apos;s wallets. Money leaves the platform only when you pay their withdrawal request.</p>}
        extraActions={(
          <>
            <Button onClick={approveAll}><CheckCheck className="h-4 w-4" /> Approve all pending</Button>
            <Button variant="outline" onClick={() => downloadFile('/settlements/export', 'payouts.csv').catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /> Export all (CSV)</Button>
          </>
        )}
        columns={[
          { key: 'srNumber', label: 'SR' },
          { key: 'vendorName', label: 'Service company' },
          { key: 'engineerName', label: 'Engineer' },
          { key: 'jobType', label: 'Job', render: (r) => `${labelOf(JOB_TYPES, r.jobType)}${r.coverage && r.coverage !== 'none' ? ` · ${r.coverage === 'warranty' ? 'Warranty' : r.coverage.toUpperCase()}` : ''}`, csv: (r) => r.jobType },
          { key: 'engineerAmount', label: 'Engineer', render: (r) => (r.rateMissing ? <Badge tone="red">No rate card</Badge> : inr(r.engineerAmount)) },
          { key: 'vendorAmount', label: 'Service co.', render: (r) => (r.vendorAmount ? inr(r.vendorAmount) : '—') },
          { key: 'platformFee', label: 'Platform fee', render: (r) => inr(r.platformFee) },
          { key: 'cashCollected', label: 'Cash on site', render: (r) => (r.cashCollected ? inr(r.cashCollected) : '—') },
          { key: 'approval', label: 'Status', render: (r) => <span className="flex flex-col items-start gap-1"><Badge>{r.approval === 'approved' ? 'Credited' : r.approval[0].toUpperCase() + r.approval.slice(1)}</Badge>{r.holdReason && <span className="text-[11px] text-amber-700">{r.holdReason}</span>}</span> },
        ]}
        rowActions={({ row }) => row.approval !== 'approved' && (
          <>
            {!row.rateMissing && row.approval === 'pending' && <Button size="sm" onClick={() => act(row, 'approve')}>Approve</Button>}
            {row.approval === 'pending' && <Button size="sm" variant="outline" onClick={() => setHold(row)}>Hold</Button>}
            {row.approval === 'held' && <Button size="sm" variant="outline" onClick={() => act(row, 'release')}>Release</Button>}
          </>
        )}
      />
      <PromptDialog
        open={!!hold} onOpenChange={(o) => !o && setHold(null)} title={`Hold ${hold?.srNumber}`} label="Reason" required confirmLabel="Hold payout"
        onConfirm={(note) => act(hold, 'hold', { note })}
      />
    </>
  );
}
