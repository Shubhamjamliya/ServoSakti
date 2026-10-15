import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';

export default function Vendors() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const toggle = async (row) => {
    try {
      await api(`/companies/authorizations/${row._id}`, { method: 'PATCH', body: { status: row.status === 'active' ? 'suspended' : 'active' } });
      toast.success(row.status === 'active' ? 'Authorization suspended' : 'Authorization reactivated');
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <ResourcePage
      eyebrow="Network"
      title="Vendors"
      endpoint="/companies/authorizations"
      filterKey="status"
      filterLabel="All statuses"
      filterOptions={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]}
      searchable={false}
      createLabel="Authorize Vendor"
      refreshKey={version}
      columns={[
        { key: 'vendorName', label: 'Service company' },
        { key: 'vendorCity', label: 'Based in' },
        { key: 'brands', label: 'Authorized brands', render: (r) => (r.brands || []).join(', ') || '—' },
        { key: 'cities', label: 'Service cities', render: (r) => (r.cities || []).join(', ') || '—' },
        { key: 'backup', label: 'Backup cover', render: (r) => (r.backup ? <Badge tone="blue">Priority 4</Badge> : 'No'), csv: (r) => (r.backup ? 'Yes' : 'No') },
        { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'red'}>{humanize(r.status)}</Badge> },
      ]}
      rowActions={({ row }) => <Button size="sm" variant="outline" onClick={() => toggle(row)}>{row.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>}
      fields={[
        { name: 'vendorId', label: 'Service company', type: 'remote', endpoint: '/companies', optionLabel: (o) => `${o.legalName}${o.city ? ` · ${o.city}` : ''}` },
        { name: 'brands', label: 'Authorized brands', type: 'tags' },
        { name: 'cities', label: 'Service cities', type: 'tags' },
        { name: 'backup', label: 'Use as backup / emergency partner', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] },
      ]}
      mapCreate={(b) => ({ ...b, backup: b.backup === 'true' })}
    />
  );
}
