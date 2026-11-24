import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { useApi } from '@/shared/lib/useApi';
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

export default function Payments() {
  // cash held by engineers / service companies and their deposits are under Finance → Wallets & Cash
  return <CustomerPayments />;
}
