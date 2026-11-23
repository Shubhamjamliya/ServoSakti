import { useState } from 'react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, humanize } from '@/shared/lib/format';

export default function Disputes() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  // customer disputes: the company gives its side within 24 hours, then the admin decides
  const respond = async (row) => {
    const response = window.prompt(`Your side of the dispute on ${row.srNumber}`, row.vendorResponse || '');
    if (!response) return;
    try { await api(`/settlements/disputes/${row._id}/respond`, { method: 'PATCH', body: { response } }); toast.success('Response sent'); setVersion((v) => v + 1); } catch (e) { toast.error(e.message); }
  };
  return (
    <ResourcePage
      eyebrow="Finance"
      title="Disputes"
      endpoint="/settlements/disputes"
      filterKey="status"
      filterLabel="All statuses"
      filterOptions={['open', 'approved', 'rejected'].map((v) => ({ value: v, label: humanize(v) }))}
      refreshKey={version}
      header={<p className="text-xs text-neutral-500">Raise a dispute from the Earnings page on any unpaid payout. Customer disputes need your response within 24 hours.</p>}
      columns={[
        { key: 'srNumber', label: 'SR' },
        { key: 'kind', label: 'Type', render: (r) => (r.kind === 'service' ? 'Customer' : 'Payout') },
        { key: 'reason', label: 'Reason', render: (r) => [r.category, r.reason].filter(Boolean).join(': ') },
        { key: 'vendorResponse', label: 'Your response', render: (r) => r.vendorResponse || '—' },
        { key: 'createdAt', label: 'Raised', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
        { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
        { key: 'outcome', label: 'Outcome', render: (r) => r.outcome || '—' },
      ]}
      rowActions={({ row }) => row.kind === 'service' && row.status === 'open' && <Button size="sm" variant="outline" onClick={() => respond(row)}>Respond</Button>}
    />
  );
}
