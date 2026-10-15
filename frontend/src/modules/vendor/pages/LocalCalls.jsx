import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { srColumns, useSrTools } from '@/shared/components/SrTools';
import { SR_STATUSES, humanize } from '@/shared/lib/format';

const ORIGINS = [
  { value: 'own', label: 'Own company call' },
  { value: 'platform', label: 'Platform-assigned' },
  { value: 'outsourced', label: 'Outsourced' },
  { value: 'partner', label: 'Partner-company call' },
];

export default function LocalCalls() {
  const tools = useSrTools({ assign: true, review: true, outsource: true });
  return (
    <>
      <ResourcePage
        eyebrow="Calls"
        title="Local Calls"
        endpoint="/service-requests"
        filterKey="status"
        filterLabel="All statuses"
        filterOptions={SR_STATUSES}
        columns={[...srColumns(Badge), { key: 'origin', label: 'Call type', render: (r) => <Badge tone="blue">{humanize(r.origin)}</Badge>, csv: (r) => humanize(r.origin) }]}
        rowActions={tools.actions}
        refreshKey={tools.version}
        header={<p className="text-xs text-neutral-500">Call types: {ORIGINS.map((o) => o.label).join(' · ')}</p>}
      />
      {tools.dialogs}
    </>
  );
}
