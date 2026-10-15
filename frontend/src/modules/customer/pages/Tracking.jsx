import { useState } from 'react';
import { Check, Star } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Empty, KeyValue, Panel, Screen, StatusPill } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { cn } from '@/shared/lib/utils';
import { fmtDateTime } from '@/shared/lib/format';

const STEPS = [
  ['created', 'Request received'],
  ['verified', 'Verified'],
  ['assigned', 'Engineer assigned'],
  ['in_progress', 'Service in progress'],
  ['under_review', 'Quality review'],
  ['approved', 'Service completed'],
  ['closed', 'Closed'],
];
// offered/unassigned are dispatch states that sit between "verified" and "assigned"
const stepIndex = (status) => Math.max(0, STEPS.findIndex(([s]) => s === (['offered', 'unassigned'].includes(status) ? 'verified' : status)));

function Stepper({ status }) {
  const at = stepIndex(status);
  const finished = ['approved', 'closed'].includes(status); // the current step itself is done, not pending
  return (
    <ol className="space-y-2">
      {STEPS.map(([key, label], i) => {
        const done = i < at || (finished && i === at);
        return (
        <li key={key} className="flex items-center gap-3 text-sm">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', done ? 'border-primary bg-primary text-white' : i === at ? 'border-primary text-primary' : 'border-neutral-300 text-neutral-300')}>{done ? <Check className="h-3 w-3" /> : i + 1}</span>
          <span className={i <= at ? 'font-medium text-neutral-900' : 'text-neutral-400'}>{label}</span>
        </li>
        );
      })}
    </ol>
  );
}

function Closure({ sr, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const confirm = async () => {
    try { await api(`/service-requests/${sr._id}/confirm-closure`, { method: 'POST', body: { rating, feedback } }); toast.success('Thanks for your feedback'); onDone(); }
    catch (e) { toast.error(e.message); }
  };
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-green-50 p-3">
      <p className="text-sm font-medium text-green-900">The service was completed. Please confirm and rate it.</p>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}><Star className={cn('h-6 w-6', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300')} /></button>)}</div>
      <Input placeholder="Feedback (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <Button className="w-full" onClick={confirm}>Confirm closure</Button>
    </div>
  );
}

export default function Tracking() {
  const { data, loading, reload } = useApi('/service-requests?limit=50');
  const active = (data?.items || []).filter((r) => !['closed', 'cancelled'].includes(r.status));

  return (
    <Screen title="Track service" subtitle="Live status of your active requests">
      {!loading && active.length === 0 && <Empty>No active requests to track.</Empty>}
      {active.map((r) => (
        <Panel key={r._id}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div><p className="font-semibold">{r.srNumber}</p><p className="text-sm text-neutral-500">{[r.brand, r.model].filter(Boolean).join(' ')}</p></div>
            <StatusPill status={r.status} />
          </div>
          <Stepper status={r.status} />
          <div className="mt-3">
            <KeyValue label="Service company">{r.vendorName}</KeyValue>
            <KeyValue label="Engineer">{r.engineerName ? `${r.engineerName}${r.engineerPhone ? ` · ${r.engineerPhone}` : ''}` : null}</KeyValue>
            <KeyValue label="Expected by">{fmtDateTime(r.tatDueAt)}</KeyValue>
          </div>
          {r.status === 'approved' && <Closure sr={r} onDone={reload} />}
        </Panel>
      ))}
    </Screen>
  );
}
