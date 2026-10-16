import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, humanize } from '@/shared/lib/format';

const STATUSES = ['pending', 'approved', 'suspended', 'rejected'].map((v) => ({ value: v, label: humanize(v) }));

/**
 * Admin list of one company type. `type` = 'oem' | 'vendor'.
 * With `pending` it becomes that type's approval queue (only applications awaiting a decision).
 */
export default function CompanyList({ type, pending = false }) {
  const toast = useToast();
  const label = type === 'oem' ? 'OEM' : 'Service company';
  const plural = type === 'oem' ? 'OEMs' : 'Service Companies';
  const [dialog, setDialog] = useState(null); // { row, action: 'suspend' | 'reject' }
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const setStatus = async (row, status, reason) => {
    await api(`/companies/${row._id}/status`, { method: 'PATCH', body: { status, reason } });
    toast.success(`${row.legalName} is now ${status}`);
    bump();
  };
  const run = (fn) => fn().catch((e) => toast.error(e.message));

  const columns = pending
    ? [
      { key: 'legalName', label: 'Company' },
      { key: 'ownerName', label: 'Owner', render: (r) => r.ownerName || '—' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'gstin', label: 'GSTIN', render: (r) => r.gstin || '—' },
      { key: 'authorizedBrands', label: 'Brands', render: (r) => (r.authorizedBrands || []).join(', ') || '—' },
      { key: 'kyc', label: 'KYC docs', render: (r) => r.kyc?.length || 0 },
      { key: 'createdAt', label: 'Applied', render: (r) => fmtDate(r.createdAt) },
    ]
    : [
      { key: 'legalName', label: 'Company' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'gstin', label: 'GSTIN', render: (r) => r.gstin || '—' },
      { key: 'authorizedBrands', label: 'Brands', render: (r) => (r.authorizedBrands || []).join(', ') || '—' },
      ...(type === 'vendor' ? [{ key: 'isBackup', label: 'Backup cover', render: (r) => (r.isBackup ? 'Yes' : 'No') }] : []),
      { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.status)}</Badge> },
    ];

  return (
    <>
      <ResourcePage
        key={`${type}-${pending}`}
        eyebrow={plural}
        title={pending ? `${label} approvals` : plural}
        endpoint="/companies"
        params={{ type, ...(pending ? { status: 'pending' } : {}) }}
        {...(pending ? {} : { filterKey: 'status', filterLabel: 'All statuses', filterOptions: STATUSES })}
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
        open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}
        title={`${dialog?.action === 'reject' ? 'Reject' : 'Suspend'} ${dialog?.row?.legalName}`}
        description={dialog?.action === 'suspend' ? 'Users of this company will not be able to log in.' : undefined}
        label="Reason" required destructive confirmLabel={dialog?.action === 'reject' ? 'Reject' : 'Suspend'}
        onConfirm={(reason) => setStatus(dialog.row, dialog.action === 'reject' ? 'rejected' : 'suspended', reason)}
      />
    </>
  );
}
