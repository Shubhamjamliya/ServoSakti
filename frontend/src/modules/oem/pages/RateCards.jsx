import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, WARRANTY_TYPES, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

export default function RateCards() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const toggle = async (row) => {
    try {
      await api(`/rate-cards/${row._id}`, { method: 'PATCH', body: { active: !row.active } });
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <ResourcePage
      eyebrow="Network"
      title="Rate Cards"
      endpoint="/rate-cards"
      filterKey="jobType"
      filterLabel="All job types"
      filterOptions={JOB_TYPES}
      refreshKey={version}
      createLabel="Add Rate"
      columns={[
        { key: 'brand', label: 'Brand' },
        { key: 'jobType', label: 'Job type', render: (r) => labelOf(JOB_TYPES, r.jobType), csv: (r) => labelOf(JOB_TYPES, r.jobType) },
        { key: 'warranty', label: 'Warranty', render: (r) => labelOf(WARRANTY_TYPES, r.warranty), csv: (r) => labelOf(WARRANTY_TYPES, r.warranty) },
        { key: 'vendorPayout', label: 'Vendor payout', render: (r) => inr(r.vendorPayout) },
        { key: 'engineerPayout', label: 'Engineer payout', render: (r) => inr(r.engineerPayout) },
        { key: 'platformFee', label: 'Platform fee', render: (r) => inr(r.platformFee) },
        { key: 'distanceSlabs', label: 'Distance slabs', render: (r) => (r.distanceSlabs || []).map((s) => `${s.fromKm}-${s.toKm}km +${s.amount}`).join(' · ') || '—', csv: (r) => (r.distanceSlabs || []).length },
        { key: 'active', label: 'Status', render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
      ]}
      rowActions={({ row }) => <Button size="sm" variant="outline" onClick={() => toggle(row)}>{row.active ? 'Deactivate' : 'Activate'}</Button>}
      fields={[
        { name: 'brand', label: 'Brand' },
        { name: 'jobType', label: 'Job type', type: 'select', options: JOB_TYPES },
        { name: 'warranty', label: 'Warranty', type: 'select', options: WARRANTY_TYPES },
        { name: 'vendorPayout', label: 'Vendor payout (₹)', type: 'number' },
        { name: 'engineerPayout', label: 'Engineer payout (₹)', type: 'number' },
        { name: 'platformFee', label: 'Platform fee (₹)', type: 'number' },
        { name: 'slabFrom', label: 'Travel slab from (km)', type: 'number', required: false },
        { name: 'slabTo', label: 'Travel slab to (km)', type: 'number', required: false },
        { name: 'slabAmount', label: 'Travel allowance (₹)', type: 'number', required: false },
      ]}
      mapCreate={({ slabFrom, slabTo, slabAmount, ...rest }) => ({
        ...rest,
        distanceSlabs: slabAmount !== '' && slabAmount != null ? [{ fromKm: slabFrom || 0, toKm: slabTo || 0, amount: slabAmount }] : [],
      })}
    />
  );
}
