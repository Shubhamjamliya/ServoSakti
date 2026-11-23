import { useState } from 'react';
import { Empty, RowLink, Screen, StatusPill } from '@/shared/components/Mobile';
import Tabs from '@/shared/components/Tabs';
import { useApi } from '@/shared/lib/useApi';
import { fmtDate } from '@/shared/lib/format';
import { jobMeta } from '../jobMeta';

const TABS = [{ value: 'active', label: 'Active' }, { value: 'done', label: 'Completed' }];
const ACTIVE = ['offered', 'assigned', 'in_progress', 'under_review'];

export default function Jobs() {
  const [tab, setTab] = useState('active');
  const { data, loading, error } = useApi('/service-requests?limit=100');
  // a failed visit with money still to collect stays active until the cash is recorded
  const isActive = (j) => ACTIVE.includes(j.status) || (j.status === 'failed' && j.bill?.due > 0);
  const items = (data?.items || []).filter((j) => (tab === 'active' ? isActive(j) : !isActive(j)));

  return (
    <Screen title="My jobs" subtitle="Only calls assigned to you are shown">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && items.length === 0 && <Empty>{tab === 'active' ? 'No active jobs right now.' : 'No completed jobs yet.'}</Empty>}
      <div className="space-y-2">
        {items.map((j) => (
          <RowLink key={j._id} to={`/engineer/jobs/${j._id}`} title={`${j.srNumber} · ${[j.brand, j.model].filter(Boolean).join(' ')}`} meta={tab === 'active' ? jobMeta(j) : `${j.city || '—'} · ${fmtDate(j.createdAt)}`} right={<StatusPill status={j.status} />} />
        ))}
      </div>
    </Screen>
  );
}
