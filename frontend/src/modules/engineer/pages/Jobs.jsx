import { useState } from 'react';
import { Briefcase } from 'lucide-react';
import { Empty, ErrorNote, Screen } from '@/shared/components/Mobile';
import { useApi } from '@/shared/lib/useApi';
import { cn } from '@/shared/lib/utils';
import JobCard from '../components/JobCard';

const ACTIVE = ['offered', 'assigned', 'in_progress', 'under_review'];
// a failed visit with money still to collect stays active until the cash is recorded
const isActive = (j) => ACTIVE.includes(j.status) || (j.status === 'failed' && j.bill?.due > 0);

export default function Jobs() {
  const [tab, setTab] = useState('active');
  const { data, loading, error } = useApi('/service-requests?limit=100');
  const all = data?.items || [];
  const counts = { active: all.filter(isActive).length, done: all.filter((j) => !isActive(j)).length };
  const items = all.filter((j) => (tab === 'active' ? isActive(j) : !isActive(j)));

  return (
    <Screen title="My Jobs" subtitle="Calls assigned to you">
      <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-[#edf2fa] p-1">
        {[['active', 'Active'], ['done', 'Completed']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={cn('flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] transition', tab === key ? 'bg-white font-bold text-[#1456d8] shadow-[0_2px_6px_rgba(20,86,216,0.12)]' : 'font-medium text-[#5d667a]')}>
            {label}
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none', tab === key ? 'bg-[#1456d8]/10 text-[#1456d8]' : 'bg-[#dce4f0] text-[#5d667a]')}>{counts[key]}</span>
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && <div className="h-32 animate-pulse rounded-[18px] bg-[#e8eef8]" />}
      {!loading && items.length === 0 && <Empty icon={Briefcase}>{tab === 'active' ? 'No active jobs right now. New offers appear on Home.' : 'No completed jobs yet.'}</Empty>}
      <div className="space-y-3">
        {items.map((j) => <JobCard key={j._id} j={j} done={tab === 'done'} />)}
      </div>
    </Screen>
  );
}
