import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate, humanize, JOB_TYPES, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Monthly claim of approved warranty jobs: labour cost plus covered parts. The OEM approves or rejects each line. */
export default function WarrantyClaims({ eyebrow = 'Finance' }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);
  const { data } = useApi(`/settlements/warranty-claims?month=${month}&limit=1&v=${version}`);
  const decide = async (row, decision) => {
    const note = window.prompt(decision === 'approved' ? 'Note (optional)' : 'Reason for rejecting this line', '');
    if (note === null) return;
    try { await api(`/settlements/warranty-claims/${row._id}`, { method: 'PATCH', body: { decision, note } }); toast.success(`Claim ${decision}`); setVersion((v) => v + 1); } catch (e) { toast.error(e.message); }
  };
  const total = (status) => data?.totals?.find((t) => t._id === status) || { amount: 0, jobs: 0 };
  return (
    <ResourcePage
      eyebrow={eyebrow} title="Warranty Claims" endpoint="/settlements/warranty-claims" params={{ month }} refreshKey={version}
      filterKey="status" filterLabel="All lines" filterOptions={['pending', 'approved', 'rejected'].map((v) => ({ value: v, label: humanize(v) }))}
      extraActions={<Input type="month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} />}
      header={(
        <div className="grid gap-3 sm:grid-cols-3">
          {['pending', 'approved', 'rejected'].map((s) => (
            <div key={s} className="rounded-xl border border-neutral-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{humanize(s)}</p>
              <p className="text-xl font-bold">{inr(total(s).amount)}</p>
              <p className="text-xs text-neutral-500">{total(s).jobs} jobs</p>
            </div>
          ))}
        </div>
      )}
      columns={[
        { key: 'srNumber', label: 'SR' },
        { key: 'approvedAt', label: 'Approved', render: (r) => fmtDate(r.approvedAt), csv: (r) => fmtDate(r.approvedAt) },
        { key: 'product', label: 'Product', render: (r) => `${r.brand} ${r.model || ''} · ${r.subtypeName || ''}`, csv: (r) => `${r.brand} ${r.model || ''}` },
        { key: 'serialNumber', label: 'Serial' },
        { key: 'jobType', label: 'Job', render: (r) => labelOf(JOB_TYPES, r.jobType) },
        { key: 'parts', label: 'Parts', render: (r) => r.parts || '—' },
        { key: 'nameplate', label: 'Nameplate', render: (r) => (r.nameplatePhoto ? <a className="text-primary underline" href={r.nameplatePhoto} target="_blank" rel="noreferrer">Photo</a> : '—'), csv: (r) => r.nameplatePhoto },
        { key: 'amount', label: 'Claim', render: (r) => inr(r.claim?.amount), csv: (r) => r.claim?.amount },
        { key: 'status', label: 'Status', render: (r) => <Badge>{humanize(r.claim?.status)}</Badge>, csv: (r) => r.claim?.status },
      ]}
      rowActions={({ row }) => row.claim?.status === 'pending' && (
        <>
          <Button size="sm" onClick={() => decide(row, 'approved')}>Approve</Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={() => decide(row, 'rejected')}>Reject</Button>
        </>
      )}
    />
  );
}
