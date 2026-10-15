import { Star, Timer, Wrench } from 'lucide-react';
import ResourcePage from '@/shared/components/ResourcePage';
import { MetricCard } from '@/shared/components/PageShell';
import { Badge } from '@/shared/components/ui/badge';
import { useApi } from '@/shared/lib/useApi';

const pct = (v) => <Badge tone={v >= 85 ? 'green' : v >= 70 ? 'amber' : 'red'}>{v}%</Badge>;

export default function Quality() {
  const { data: dash } = useApi('/admin/dashboard');
  return (
    <ResourcePage
      eyebrow="Operations"
      title="Quality"
      endpoint="/admin/quality"
      searchable={false}
      header={
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard title="Avg TAT" value={dash ? `${dash.avgTatHours} h` : '—'} helper="Request to approval" icon={Timer} accent="bg-amber-100" />
          <MetricCard title="First-time Fix" value={dash ? `${dash.firstTimeFixPercent}%` : '—'} helper="Platform-wide" icon={Wrench} accent="bg-green-100" />
          <MetricCard title="Repeat Complaints" value={dash ? `${dash.repeatPercent}%` : '—'} helper="Same serial within 30 days" icon={Star} accent="bg-rose-100" />
        </div>
      }
      columns={[
        { key: 'name', label: 'Service company' },
        { key: 'calls', label: 'Calls' },
        { key: 'completed', label: 'Completed' },
        { key: 'avgTatHours', label: 'Avg TAT (h)' },
        { key: 'firstTimeFix', label: 'First-time fix', render: (r) => pct(r.firstTimeFix), csv: (r) => `${r.firstTimeFix}%` },
        { key: 'repeatCalls', label: 'Repeat calls' },
        { key: 'rating', label: 'Customer rating', render: (r) => (r.rating ? `${r.rating} / 5` : '—') },
        { key: 'evidenceComplete', label: 'Evidence complete', render: (r) => pct(r.evidenceComplete), csv: (r) => `${r.evidenceComplete}%` },
      ]}
    />
  );
}
