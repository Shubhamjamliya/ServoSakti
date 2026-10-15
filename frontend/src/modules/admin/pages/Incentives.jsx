import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate } from '@/shared/lib/format';

export default function Incentives() {
  const toast = useToast();
  const [issuing, setIssuing] = useState(null);
  const [version, setVersion] = useState(0);

  return (
    <>
      <ResourcePage
        eyebrow="Finance"
        title="Incentives"
        endpoint="/settlements/incentives"
        filterKey="status"
        filterLabel="All"
        filterOptions={['In progress', 'Eligible', 'Issued']}
        refreshKey={version}
        columns={[
          { key: 'engineerName', label: 'Engineer' },
          { key: 'month', label: 'Month' },
          { key: 'approvedCalls', label: 'Approved calls', render: (r) => `${r.approvedCalls} / ${r.target}`, csv: (r) => r.approvedCalls },
          { key: 'rechargeDays', label: 'Recharge', render: (r) => `${r.rechargeDays} days` },
          { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          { key: 'rechargeIssuedAt', label: 'Issued on', render: (r) => fmtDate(r.rechargeIssuedAt), csv: (r) => fmtDate(r.rechargeIssuedAt) },
        ]}
        rowActions={({ row }) => row.status === 'Eligible' && <Button size="sm" onClick={() => setIssuing(row)}>Issue recharge</Button>}
      />
      <PromptDialog
        open={!!issuing} onOpenChange={(o) => !o && setIssuing(null)} title={`Issue recharge · ${issuing?.engineerName}`}
        description="Record the recharge reference once the 28-day mobile recharge has been done." label="Recharge reference / note" confirmLabel="Mark issued"
        onConfirm={async (note) => {
          await api(`/settlements/incentives/${issuing._id}/issue`, { method: 'PATCH', body: { note } });
          toast.success('Recharge marked as issued');
          setVersion((v) => v + 1);
        }}
      />
    </>
  );
}
