import { useState } from 'react';
import ResourcePage from '@/shared/components/ResourcePage';
import Tabs from '@/shared/components/Tabs';
import { inr } from '@/shared/lib/utils';

const GROUPS = [
  { value: 'oem', label: 'OEM-wise', col: 'OEM' },
  { value: 'vendor', label: 'Service company-wise', col: 'Service company' },
  { value: 'city', label: 'City-wise', col: 'City' },
];

export default function Mis() {
  const [groupBy, setGroupBy] = useState('oem');
  const g = GROUPS.find((x) => x.value === groupBy);
  return (
    <ResourcePage
      key={groupBy}
      eyebrow="Insights"
      title="MIS Reports"
      exportName={`mis-${groupBy}`}
      endpoint="/admin/mis"
      params={{ groupBy }}
      searchable={false}
      header={<Tabs tabs={GROUPS} value={groupBy} onChange={setGroupBy} />}
      columns={[
        { key: 'name', label: g.col },
        { key: 'requests', label: 'Requests' },
        { key: 'closed', label: 'Closed' },
        { key: 'warranty', label: 'Warranty calls' },
        { key: 'breaches', label: 'SLA breaches' },
        { key: 'repeats', label: 'Repeat calls' },
        { key: 'vendorAmount', label: 'Billing', render: (r) => (groupBy === 'city' ? '—' : inr(r.vendorAmount)), csv: (r) => r.vendorAmount },
        { key: 'platformFee', label: 'Platform fee', render: (r) => (groupBy === 'city' ? '—' : inr(r.platformFee)), csv: (r) => r.platformFee },
      ]}
    />
  );
}
