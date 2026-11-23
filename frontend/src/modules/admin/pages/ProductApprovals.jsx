import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { DataTable, PageShell } from '@/shared/components/PageShell';
import ResourcePage from '@/shared/components/ResourcePage';
import Tabs from '@/shared/components/Tabs';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, fmtDateTime } from '@/shared/lib/format';

/** Customer-added products whose invoice must be checked before OEM warranty applies. */
export function WarrantyChecks({ eyebrow = 'Operations' }) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const decide = async (row, decision) => {
    const note = window.prompt(decision === 'approve' ? 'Note for the customer (optional)' : 'Reason for rejecting', '');
    if (note === null) return;
    try {
      await api(`/products/passports/${row._id}/warranty`, { method: 'PATCH', body: { decision, note } });
      toast.success(decision === 'approve' ? 'Warranty approved' : 'Warranty rejected');
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };
  return (
    <ResourcePage
      eyebrow={eyebrow} title="Warranty Verification" endpoint="/products/passports" params={{ warrantyVerification: 'pending' }} refreshKey={version}
      columns={[
        { key: 'customerName', label: 'Customer', render: (r) => `${r.customerName || ''} · ${r.customerPhone || ''}` },
        { key: 'brand', label: 'Product', render: (r) => `${r.brand} ${r.model || ''}` },
        { key: 'serialNumber', label: 'Serial' },
        { key: 'purchaseDate', label: 'Purchased', render: (r) => fmtDate(r.purchaseDate) },
        { key: 'warrantyEnd', label: 'Warranty till', render: (r) => fmtDate(r.warrantyEnd) },
        { key: 'invoiceUrl', label: 'Invoice', render: (r) => (r.invoiceUrl ? <a className="text-primary underline" href={r.invoiceUrl} target="_blank" rel="noreferrer">Open</a> : '—') },
      ]}
      rowActions={({ row }) => (
        <>
          <Button size="sm" onClick={() => decide(row, 'approve')}>Approve</Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={() => decide(row, 'reject')}>Reject</Button>
        </>
      )}
    />
  );
}

function Transfers() {
  const toast = useToast();
  const { data, reload } = useApi('/products/transfers');
  const decide = async (row, decision) => {
    try { await api(`/products/passports/${row._id}/transfer`, { method: 'PATCH', body: { decision } }); toast.success(`Transfer ${decision}d`); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <PageShell eyebrow="Operations" title="Ownership Transfers">
      <p className="text-sm text-neutral-500">The current owner normally approves in their app. Approve here only with a proof of purchase, when the owner has not replied in 72 hours.</p>
      <DataTable
        rows={data?.items || []}
        empty="No pending transfers"
        columns={[
          { key: 'product', label: 'Product', render: (r) => `${r.brand} ${r.model || ''} · ${r.serialNumber}` },
          { key: 'owner', label: 'Current owner', render: (r) => `${r.ownerName || ''} · ${r.ownerPhone || ''}` },
          { key: 'requested', label: 'Requested by', render: (r) => `${r.transfer.requestedName} · ${r.transfer.requestedPhone}` },
          { key: 'at', label: 'Requested', render: (r) => fmtDateTime(r.transfer.requestedAt) },
          { key: 'proof', label: 'Proof', render: (r) => (r.transfer.proofUrl ? <a className="text-primary underline" href={r.transfer.proofUrl} target="_blank" rel="noreferrer">Open</a> : 'Not uploaded') },
          { key: '_a', label: '', render: (r) => (
            <div className="flex justify-end gap-2">
              <Button size="sm" disabled={!r.transfer.proofUrl} onClick={() => decide(r, 'approve')}>Approve</Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => decide(r, 'reject')}>Reject</Button>
            </div>
          ) },
        ]}
      />
    </PageShell>
  );
}

export default function ProductApprovals() {
  const [tab, setTab] = useState('warranty');
  return (
    <div className="space-y-4">
      <Tabs tabs={[{ value: 'warranty', label: 'Warranty verification' }, { value: 'transfers', label: 'Ownership transfers' }]} value={tab} onChange={setTab} />
      {tab === 'warranty' ? <WarrantyChecks /> : <Transfers />}
    </div>
  );
}
