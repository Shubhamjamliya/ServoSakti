import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';

export default function Engineers() {
  const toast = useToast();
  const [suspend, setSuspend] = useState(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const setStatus = async (row, status, reason) => {
    await api(`/engineers/${row._id}/status`, { method: 'PATCH', body: { status, reason } });
    toast.success(`${row.name} is now ${status}`);
    bump();
  };

  return (
    <>
      <ResourcePage
        eyebrow="Onboarding"
        title="Engineers"
        endpoint="/engineers"
        filterKey="status"
        filterLabel="All statuses"
        filterOptions={['pending', 'approved', 'suspended', 'rejected'].map((v) => ({ value: v, label: humanize(v) }))}
        refreshKey={version}
        columns={[
          { key: 'name', label: 'Engineer' },
          { key: 'phone', label: 'Phone' },
          { key: 'companyName', label: 'Company', render: (r) => r.companyName || 'Independent' },
          { key: 'city', label: 'City' },
          { key: 'certifications', label: 'Brand certifications', render: (r) => (r.certifications || []).map((c) => c.brand).join(', ') || '—' },
          { key: 'available', label: 'Availability', render: (r) => <Badge tone={r.available ? 'green' : 'gray'}>{r.available ? 'Available' : 'Off duty'}</Badge> },
          { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
        ]}
        rowActions={({ row }) => (
          <>
            {['pending', 'suspended', 'rejected'].includes(row.status) && <Button size="sm" onClick={() => setStatus(row, 'approved').catch((e) => toast.error(e.message))}>{row.status === 'pending' ? 'Approve' : 'Reactivate'}</Button>}
            {row.status === 'approved' && <Button size="sm" variant="outline" className="text-red-600" onClick={() => setSuspend(row)}>Suspend</Button>}
          </>
        )}
      />
      <PromptDialog
        open={!!suspend} onOpenChange={(o) => !o && setSuspend(null)} title={`Suspend ${suspend?.name}`} label="Reason" required destructive confirmLabel="Suspend"
        onConfirm={(reason) => setStatus(suspend, 'suspended', reason)}
      />
    </>
  );
}
