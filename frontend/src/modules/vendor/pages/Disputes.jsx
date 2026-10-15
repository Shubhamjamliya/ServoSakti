import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { fmtDate, humanize } from '@/shared/lib/format';

export default function Disputes() {
  return (
    <ResourcePage
      eyebrow="Finance"
      title="Disputes"
      endpoint="/settlements/disputes"
      filterKey="status"
      filterLabel="All statuses"
      filterOptions={['open', 'approved', 'rejected'].map((v) => ({ value: v, label: humanize(v) }))}
      header={<p className="text-xs text-neutral-500">Raise a dispute from the Earnings page on any unpaid payout.</p>}
      columns={[
        { key: 'srNumber', label: 'SR' },
        { key: 'reason', label: 'Reason' },
        { key: 'createdAt', label: 'Raised', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
        { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
        { key: 'outcome', label: 'Outcome', render: (r) => r.outcome || '—' },
      ]}
    />
  );
}
