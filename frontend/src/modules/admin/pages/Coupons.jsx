import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, fmtDate, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const STATE_TONE = { Live: 'green', Scheduled: 'blue', Expired: 'gray', 'Used up': 'amber', Inactive: 'gray' };
const discountText = (c) => (c.type === 'percent' ? `${c.value}%${c.maxDiscount ? ` up to ${inr(c.maxDiscount)}` : ''}` : inr(c.value));

/**
 * Coupons customers can enter when booking. The discount applies to service, visit and add-on charges (not parts,
 * distance or slot surcharges), after the prepaid discount and before GST.
 */
export default function Coupons() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const patch = async (row, body, ok) => {
    try { await api(`/coupons/${row._id}`, { method: 'PATCH', body }); toast.success(ok); setVersion((v) => v + 1); } catch (e) { toast.error(e.message); }
  };
  const extend = (row) => {
    const v = window.prompt('New end date (YYYY-MM-DD), empty = no end date', row.validTo ? String(row.validTo).slice(0, 10) : '');
    if (v === null) return;
    patch(row, { validTo: v ? `${v}T23:59:59+05:30` : null }, 'End date updated');
  };
  const limit = (row) => {
    const v = window.prompt('Total uses allowed (empty = unlimited)', row.usageLimit || '');
    if (v === null) return;
    patch(row, { usageLimit: v ? Number(v) : null }, 'Usage limit updated');
  };

  return (
    <ResourcePage
      eyebrow="Finance" title="Coupons" endpoint="/coupons" refreshKey={version} createLabel="Create coupon"
      filterKey="active" filterLabel="All coupons" filterOptions={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
      header={<p className="text-sm text-neutral-500">Discount applies to service, visit and add-on charges only (never parts, distance or slot surcharges), after the prepaid discount and before GST. A cancelled booking gives its coupon use back.</p>}
      columns={[
        { key: 'code', label: 'Code', render: (r) => <span className="font-mono font-bold">{r.code}</span> },
        { key: 'title', label: 'Title' },
        { key: 'discount', label: 'Discount', render: discountText, csv: discountText },
        { key: 'minOrder', label: 'Min. order', render: (r) => (r.minOrder ? inr(r.minOrder) : '—') },
        { key: 'rules', label: 'Rules', render: (r) => [r.firstBookingOnly && 'First booking', r.jobTypes?.length && r.jobTypes.map((j) => labelOf(JOB_TYPES, j)).join(', '), `${r.perCustomerLimit || 1}× per customer`].filter(Boolean).join(' · ') },
        { key: 'validity', label: 'Valid', render: (r) => `${r.validFrom ? fmtDate(r.validFrom) : 'Now'} – ${r.validTo ? fmtDate(r.validTo) : 'No end'}` },
        { key: 'usedCount', label: 'Used', render: (r) => `${r.usedCount}${r.usageLimit ? ` / ${r.usageLimit}` : ''}` },
        { key: 'state', label: 'Status', render: (r) => <Badge tone={STATE_TONE[r.state]}>{r.state}</Badge> },
      ]}
      rowActions={({ row }) => (
        <>
          <Button size="sm" variant="outline" onClick={() => extend(row)}>End date</Button>
          <Button size="sm" variant="outline" onClick={() => limit(row)}>Limit</Button>
          <Button size="sm" variant={row.active ? 'ghost' : 'default'} className={row.active ? 'text-red-600' : ''} onClick={() => patch(row, { active: !row.active }, row.active ? 'Coupon turned off' : 'Coupon turned on')}>{row.active ? 'Turn off' : 'Turn on'}</Button>
        </>
      )}
      fields={[
        { name: 'code', label: 'Code customers type (e.g. WELCOME10)' },
        { name: 'title', label: 'Title shown to customers' },
        { name: 'description', label: 'Description', required: false },
        { name: 'type', label: 'Discount type', type: 'select', options: [{ value: 'percent', label: 'Percentage (%)' }, { value: 'flat', label: 'Flat amount (₹)' }] },
        { name: 'value', label: 'Discount (% or ₹)', type: 'number' },
        { name: 'maxDiscount', label: 'Maximum discount ₹ (percentage coupons, optional)', type: 'number', required: false },
        { name: 'minOrder', label: 'Minimum service charges ₹ (optional)', type: 'number', required: false },
        { name: 'validFrom', label: 'Valid from (optional)', type: 'date', required: false },
        { name: 'validTo', label: 'Valid until (optional)', type: 'date', required: false },
        { name: 'usageLimit', label: 'Total uses allowed (optional)', type: 'number', required: false },
        { name: 'perCustomerLimit', label: 'Uses per customer', type: 'number' },
        { name: 'firstBookingOnly', label: 'Who can use it', type: 'select', options: [{ value: 'false', label: 'Every customer' }, { value: 'true', label: 'First booking only' }] },
        { name: 'jobType', label: 'Only for service (optional)', type: 'select', options: JOB_TYPES, required: false },
        { name: 'subtypeId', label: 'Only for product type (optional)', type: 'remote', endpoint: '/catalog/subtypes', optionLabel: (o) => `${o.category} · ${o.name}`, required: false },
      ]}
      mapCreate={({ jobType, subtypeId, firstBookingOnly, validFrom, validTo, ...rest }) => ({
        ...rest, firstBookingOnly: firstBookingOnly === 'true', jobTypes: jobType ? [jobType] : [], subtypeIds: subtypeId ? [subtypeId] : [],
        validFrom: validFrom ? `${validFrom}T00:00:00+05:30` : undefined, validTo: validTo ? `${validTo}T23:59:59+05:30` : undefined,
      })}
    />
  );
}
