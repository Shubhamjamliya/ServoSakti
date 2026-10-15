import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { fmtDateTime, humanize } from '@/shared/lib/format';

const PRIORITY = { 0: 'Manual', 1: 'P1 · Own engineer', 2: 'P2 · Independent', 3: 'P3 · Partner company', 4: 'P4 · Backup' };

export default function Dispatch() {
  return (
    <ResourcePage
      eyebrow="Operations"
      title="Dispatch Log"
      endpoint="/dispatch/logs"
      filterKey="outcome"
      filterLabel="All outcomes"
      filterOptions={['pending', 'accepted', 'rejected', 'timeout', 'assigned', 'override'].map((v) => ({ value: v, label: humanize(v) }))}
      columns={[
        { key: 'srNumber', label: 'SR' },
        { key: 'candidateName', label: 'Offered to' },
        { key: 'priority', label: 'Level', render: (r) => PRIORITY[r.priority] ?? r.priority, csv: (r) => PRIORITY[r.priority] },
        { key: 'offeredAt', label: 'Offered', render: (r) => fmtDateTime(r.offeredAt), csv: (r) => fmtDateTime(r.offeredAt) },
        { key: 'respondedAt', label: 'Responded', render: (r) => fmtDateTime(r.respondedAt), csv: (r) => fmtDateTime(r.respondedAt) },
        { key: 'outcome', label: 'Outcome', render: (r) => <Badge>{humanize(r.outcome)}</Badge> },
        { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
      ]}
    />
  );
}
