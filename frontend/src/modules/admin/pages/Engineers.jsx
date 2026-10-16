import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, humanize } from '@/shared/lib/format';

const STATUSES = ['pending', 'approved', 'suspended', 'rejected'].map((v) => ({ value: v, label: humanize(v) }));
const brands = (r) => (r.certifications || []).map((c) => c.brand).join(', ') || '—';

/** Admin list of engineers. With `pending` it is the engineer approval queue. */
export default function Engineers({ pending = false }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // { row, action: 'suspend' | 'reject' }
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const setStatus = async (row, status, reason) => {
    await api(`/engineers/${row._id}/status`, { method: 'PATCH', body: { status, reason } });
    toast.success(`${row.name} is now ${status}`);
    bump();
  };
  const run = (fn) => fn().catch((e) => toast.error(e.message));

  const columns = pending
    ? [
      { key: 'name', label: 'Engineer' },
      { key: 'phone', label: 'Phone' },
      { key: 'engineerType', label: 'Type', render: (r) => <Badge tone="blue">{humanize(r.engineerType)}</Badge> },
      { key: 'companyName', label: 'Company', render: (r) => r.companyName || 'Independent' },
      { key: 'city', label: 'City' },
      { key: 'certifications', label: 'Brand certifications', render: brands },
      { key: 'kyc', label: 'KYC docs', render: (r) => r.kyc?.length || 0 },
      { key: 'createdAt', label: 'Applied', render: (r) => fmtDate(r.createdAt) },
    ]
    : [
      { key: 'name', label: 'Engineer' },
      { key: 'phone', label: 'Phone' },
      { key: 'companyName', label: 'Company', render: (r) => r.companyName || 'Independent' },
      { key: 'city', label: 'City' },
      { key: 'certifications', label: 'Brand certifications', render: brands },
      { key: 'available', label: 'Availability', render: (r) => <Badge tone={r.available ? 'green' : 'gray'}>{r.available ? 'Available' : 'Off duty'}</Badge> },
      { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
    ];

  return (
    <>
      <ResourcePage
        key={String(pending)}
        eyebrow="Engineers"
        title={pending ? 'Engineer approvals' : 'Engineers'}
        endpoint="/engineers"
        {...(pending ? { params: { status: 'pending' } } : { filterKey: 'status', filterLabel: 'All statuses', filterOptions: STATUSES })}
        refreshKey={version}
        columns={columns}
        rowActions={({ row }) => (pending ? (
          <>
            <Button size="sm" onClick={() => run(() => setStatus(row, 'approved'))}>Approve</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDialog({ row, action: 'reject' })}>Reject</Button>
          </>
        ) : (
          <>
            {['pending', 'suspended', 'rejected'].includes(row.status) && <Button size="sm" onClick={() => run(() => setStatus(row, 'approved'))}>{row.status === 'pending' ? 'Approve' : 'Reactivate'}</Button>}
            {row.status === 'approved' && <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDialog({ row, action: 'suspend' })}>Suspend</Button>}
          </>
        ))}
      />
      <PromptDialog
        open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={`${dialog?.action === 'reject' ? 'Reject' : 'Suspend'} ${dialog?.row?.name}`}
        label="Reason" required destructive confirmLabel={dialog?.action === 'reject' ? 'Reject' : 'Suspend'}
        onConfirm={(reason) => setStatus(dialog.row, dialog.action === 'reject' ? 'rejected' : 'suspended', reason)}
      />
    </>
  );
}
