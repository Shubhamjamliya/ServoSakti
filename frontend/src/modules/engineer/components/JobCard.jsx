import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin, UserRound, Wrench, Zap } from 'lucide-react';
import { StatusPill } from '@/shared/components/Mobile';
import { JOB_TYPES, fmtDate, fmtDateTime, labelOf } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';

/** What needs the engineer's attention on a job, or null. */
const attention = (j) => {
  if (j.quote?.status === 'pending') return ['Waiting for customer to approve the revised price', 'bg-amber-50 text-amber-800'];
  if (j.bill?.due > 0 && ['in_progress', 'failed'].includes(j.status)) return [`Collect ${inr(j.bill.due)} before closing`, 'bg-red-50 text-red-700'];
  if (j.status === 'assigned') return ['Check in at the site when you arrive', 'bg-[#eef4ff] text-[#1456d8]'];
  return null;
};

/** One job in the engineer's lists, in the customer app's card style. */
export default function JobCard({ j, done = false }) {
  const note = !done && attention(j);
  const when = j.slot === 'urgent' ? 'Urgent · within 3 hours' : j.scheduledAt ? fmtDateTime(j.scheduledAt) : null;
  return (
    <Link to={`/engineer/jobs/${j._id}`} className="block overflow-hidden rounded-[18px] border border-[#e6ebf3] bg-white shadow-[0_2px_10px_rgba(15,35,80,0.04)] transition active:scale-[0.99]">
      <div className="flex gap-3 p-3.5">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', j.slot === 'urgent' && !done ? 'bg-red-50 text-red-600' : 'bg-[#e9f0fe] text-[#1456d8]')}>
          {j.slot === 'urgent' && !done ? <Zap className="h-5 w-5" strokeWidth={1.9} /> : <Wrench className="h-5 w-5" strokeWidth={1.9} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15px] font-bold text-[#0b1324]">SR #{String(j.srNumber).replace(/^SR-/, '')}</p>
            <StatusPill status={j.status} />
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-[#4a5263]">
            {[[j.brand, j.model].filter(Boolean).join(' '), j.subtypeName].filter(Boolean).join(' · ')} — {labelOf(JOB_TYPES, j.jobType)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#5d667a]">
            {done
              ? <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(j.approvedAt || j.updatedAt || j.createdAt)}</span>
              : when && <span className={cn('flex items-center gap-1', j.slot === 'urgent' && 'font-semibold text-red-600')}><CalendarDays className="h-3.5 w-3.5" />{when}</span>}
            {j.customerName && <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{j.customerName}</span>}
            {j.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.city}</span>}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 self-center text-[#9aa5b8]" />
      </div>
      {note && <p className={cn('border-t border-[#eef1f6] px-3.5 py-2 text-[12px] font-semibold', note[1])}>{note[0]}</p>}
    </Link>
  );
}
