import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, humanize } from '@/shared/lib/format';

const pathFor = (row) => (row.kind === 'company' ? `/companies/${row.id}/status` : `/engineers/${row.id}/status`);

export default function Approvals() {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(null);
  const [version, setVersion] = useState(0);

  const approve = async (row) => {
    try {
      await api(pathFor(row), { method: 'PATCH', body: { status: 'approved' } });
      toast.success(`${row.name} approved`);
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <ResourcePage
        eyebrow="Onboarding"
        title="Approvals"
        endpoint="/admin/approvals"
        searchable={false}
        refreshKey={version}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'kind', label: 'Type', render: (r) => <Badge tone="blue">{r.kind === 'company' ? (r.subtype === 'oem' ? 'OEM' : 'Service company') : `${humanize(r.subtype)} engineer`}</Badge> },
          { key: 'company', label: 'Company', render: (r) => r.company || '—' },
          { key: 'city', label: 'City' },
          { key: 'phone', label: 'Phone' },
          { key: 'detail', label: 'Brands / certifications' },
          { key: 'kycDocs', label: 'KYC docs' },
          { key: 'createdAt', label: 'Applied', render: (r) => fmtDate(r.createdAt) },
        ]}
        rowActions={({ row }) => (
          <>
            <Button size="sm" onClick={() => approve(row)}>Approve</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRejecting(row)}>Reject</Button>
          </>
        )}
      />
      <PromptDialog
        open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={`Reject ${rejecting?.name}`} label="Reason" required destructive confirmLabel="Reject"
        onConfirm={async (reason) => {
          await api(pathFor(rejecting), { method: 'PATCH', body: { status: 'rejected', reason } });
          toast.success('Rejected');
          setVersion((v) => v + 1);
        }}
      />
    </>
  );
}
