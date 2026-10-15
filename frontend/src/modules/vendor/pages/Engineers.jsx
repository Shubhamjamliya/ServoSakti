import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

function PerformanceDialog({ engineer, onClose }) {
  const { data } = useApi(engineer ? `/engineers/${engineer._id}/performance` : null);
  const by = Object.fromEntries((data?.byStatus || []).map((s) => [s._id, s.n]));
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const rows = [
    ['Total calls', total],
    ['Approved / closed', (by.approved || 0) + (by.closed || 0)],
    ['In progress', (by.assigned || 0) + (by.in_progress || 0) + (by.under_review || 0)],
    ['Total earnings', data ? inr(data.earnings) : '—'],
  ];
  return (
    <Dialog open={!!engineer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{engineer?.name} · performance</DialogTitle></DialogHeader>
        <div className="divide-y text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between py-2"><span className="text-neutral-500">{k}</span><b>{v}</b></div>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Engineers() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [perf, setPerf] = useState(null);

  const toggle = async (row) => {
    try {
      await api(`/engineers/${row._id}`, { method: 'PATCH', body: { active: !row.active } });
      toast.success(row.active ? 'Engineer deactivated' : 'Engineer activated');
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <ResourcePage
        eyebrow="Company"
        title="Engineers"
        endpoint="/engineers"
        filterKey="status"
        filterLabel="All statuses"
        filterOptions={['pending', 'approved', 'suspended', 'rejected'].map((v) => ({ value: v, label: humanize(v) }))}
        refreshKey={version}
        createLabel="Add Engineer"
        columns={[
          { key: 'name', label: 'Engineer' },
          { key: 'phone', label: 'Phone' },
          { key: 'city', label: 'City' },
          { key: 'skills', label: 'Skills', render: (r) => (r.skills || []).join(', ') || '—' },
          { key: 'certifications', label: 'Brand certifications', render: (r) => (r.certifications || []).map((c) => c.brand).join(', ') || '—', csv: (r) => (r.certifications || []).map((c) => c.brand).join('; ') },
          { key: 'active', label: 'Active', render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
          { key: 'status', label: 'Approval', render: (r) => <Badge>{humanize(r.status)}</Badge> },
        ]}
        rowActions={({ row }) => (
          <>
            <Button size="sm" variant="ghost" onClick={() => setPerf(row)}>Performance</Button>
            <Button size="sm" variant="outline" onClick={() => toggle(row)}>{row.active ? 'Deactivate' : 'Activate'}</Button>
          </>
        )}
        fields={[
          { name: 'name', label: 'Full name' },
          { name: 'phone', label: 'Phone (login id)', placeholder: '10 digits' },
          { name: 'password', label: 'Temporary password', type: 'password' },
          { name: 'city', label: 'City' },
          { name: 'skills', label: 'Skills', type: 'tags', required: false },
          { name: 'brands', label: 'Brand certifications', type: 'tags' },
          { name: 'serviceTerritories', label: 'Service territories', type: 'tags', required: false },
        ]}
        mapCreate={({ brands, ...rest }) => ({ ...rest, certifications: brands.map((brand) => ({ brand })) })}
      />
      <PerformanceDialog engineer={perf} onClose={() => setPerf(null)} />
    </>
  );
}
