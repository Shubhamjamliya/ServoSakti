import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { DataTable, PageShell } from '@/shared/components/PageShell';
import ResourcePage from '@/shared/components/ResourcePage';
import Tabs from '@/shared/components/Tabs';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

function CustomerPayments() {
  const { data: cfg } = useApi('/payments/config');
  return (
    <ResourcePage
      eyebrow="Finance" title="Customer Payments" endpoint="/payments" filterKey="status" filterLabel="All statuses"
      filterOptions={['created', 'paid', 'failed', 'expired'].map((v) => ({ value: v, label: humanize(v) }))}
      header={cfg && !cfg.live && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">Razorpay keys are not set on the server, so payments run in test (mock) mode. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and PAYMENT_WEBHOOK_SECRET in backend/.env to take real payments.</p>}
      columns={[
        { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.paidAt || r.createdAt), csv: (r) => r.paidAt || r.createdAt },
        { key: 'srNumber', label: 'SR', render: (r) => r.srNumber || (r.purpose === 'plan' ? 'AMC/CMC plan' : '—') },
        { key: 'customerName', label: 'Customer', render: (r) => [r.customerName, r.customerPhone].filter(Boolean).join(' · ') },
        { key: 'purpose', label: 'For', render: (r) => humanize(r.purpose) },
        { key: 'provider', label: 'Mode', render: (r) => (r.provider === 'cash' ? `Cash · ${r.engineerName || ''}` : humanize(r.provider)) },
        { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) },
        { key: 'refundedAmount', label: 'Refunded', render: (r) => (r.refundedAmount ? inr(r.refundedAmount) : '—') },
        { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
        { key: 'paymentId', label: 'Razorpay ref', render: (r) => r.paymentId || r.orderId || '—' },
      ]}
    />
  );
}

function CashHeld() {
  const toast = useToast();
  const { data, reload } = useApi('/payments/cash-held');
  const [busy, setBusy] = useState('');
  const deposit = async (row) => {
    if (!window.confirm(`Confirm ${row.engineerName} deposited ${inr(row.amount)}?`)) return;
    setBusy(row.engineerId);
    try { await api(`/payments/cash-held/${row.engineerId}/deposit`, { method: 'POST' }); toast.success('Deposit recorded'); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  return (
    <PageShell eyebrow="Finance" title="Cash with Engineers">
      <p className="text-sm text-neutral-500">Cash collected on site and not yet deposited. Engineers above the cash limit (Settings) get no new jobs until they deposit.</p>
      <DataTable
        rows={(data?.items || []).map((r) => ({ ...r, id: r.engineerId }))}
        empty="No cash pending"
        columns={[
          { key: 'engineerName', label: 'Engineer' }, { key: 'phone', label: 'Phone' }, { key: 'jobs', label: 'Jobs' },
          { key: 'amount', label: 'Cash held', render: (r) => inr(r.amount) },
          { key: '_a', label: '', render: (r) => <Button size="sm" disabled={busy === r.engineerId} onClick={() => deposit(r)}>Mark deposited</Button> },
        ]}
      />
    </PageShell>
  );
}

export default function Payments() {
  const [tab, setTab] = useState('payments');
  return (
    <div className="space-y-4">
      <Tabs tabs={[{ value: 'payments', label: 'Customer payments' }, { value: 'cash', label: 'Cash with engineers' }]} value={tab} onChange={setTab} />
      {tab === 'payments' ? <CustomerPayments /> : <CashHeld />}
    </div>
  );
}
