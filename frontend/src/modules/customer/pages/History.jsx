import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronDown, ClipboardList, Star, Wrench } from 'lucide-react';
import BillView from '@/shared/components/BillView';
import { inr } from '@/shared/lib/utils';
import { useApi } from '@/shared/lib/useApi';
import { COVERAGE, JOB_TYPES, WARRANTY_TYPES, fmtDate, labelOf } from '@/shared/lib/format';
import { ENDED } from '../srStatus.js';
import { EndedNote, SrPill } from '../components/SrParts.jsx';

/** Amount line with an expandable bill (lines, coverage, discount, GST, paid / refunded / due). */
function BillToggle({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-xl bg-[#f7f9fd] px-3 py-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-[12.5px]">
        <span className="text-[#4a5263]">
          {r.bill.total > 0 ? <>Total <span className="font-bold text-[#0b1324]">{inr(r.bill.total)}</span></> : <span className="font-semibold text-emerald-700">Free of charge</span>}
          {r.bill.due > 0 && <span className="ml-1.5 font-semibold text-red-600">· {inr(r.bill.due)} due</span>}
          {r.bill.refunded > 0 && <span className="ml-1.5 text-[#5d667a]">· {inr(r.bill.refunded)} refunded</span>}
        </span>
        <span className="flex items-center gap-0.5 font-semibold text-[#1456d8]">{open ? 'Hide bill' : 'View bill'}<ChevronDown className={open ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} /></span>
      </button>
      {open && <div className="mt-2 border-t border-[#e6ebf3] pt-2"><BillView bill={r.bill} /></div>}
      {r.bill.due > 0 && <Link to={`/customer/tracking#${r._id}`} className="mt-1 block text-[12px] font-semibold text-[#1456d8]">Pay now</Link>}
    </div>
  );
}

// Finished requests. "approved" is complete but still waiting for the customer's rating, so it links to Tracking.
const FINISHED = ['approved', 'closed', ...ENDED];

export default function History() {
  const { data, loading } = useApi('/service-requests?limit=100');
  const done = (data?.items || []).filter((r) => FINISHED.includes(r.status));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold text-[#0b1324]">Service History</h1>
        <p className="text-[13.5px] text-[#5d667a]">Completed, cancelled and unsuccessful requests</p>
      </div>
      {loading && <div className="h-40 animate-pulse rounded-[18px] bg-[#e8eef8]" />}
      {!loading && done.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-[#d7deea] bg-white px-4 py-10 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-[#9aa5b8]" strokeWidth={1.6} />
          <p className="mt-2 text-[13px] text-[#5d667a]">No completed services yet.</p>
        </div>
      )}
      {done.map((r) => (
        <article key={r._id} className="rounded-[18px] border border-[#e6ebf3] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,35,80,0.04)]">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1f4f9] text-[#5d667a]"><Wrench className="h-5 w-5" strokeWidth={1.9} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[15px] font-bold text-[#0b1324]">SR #{String(r.srNumber).replace(/^SR-/, '')}</p>
                <SrPill status={r.status} />
              </div>
              <p className="mt-0.5 truncate text-[12.5px] text-[#4a5263]">{[r.model || r.brand, r.issue].filter(Boolean).join(' – ')}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-[#5d667a]">
                <CalendarDays className="h-3.5 w-3.5" />{fmtDate(r.closedAt || r.approvedAt || r.createdAt)}
                <span className="text-[#c3cad6]">·</span>{labelOf(JOB_TYPES, r.jobType)}
                <span className="text-[#c3cad6]">·</span>{r.bill ? COVERAGE[r.coverage || 'none'].label : labelOf(WARRANTY_TYPES, r.warranty)}
              </p>
            </div>
          </div>
          {r.bill && <BillToggle r={r} />}
          {ENDED.includes(r.status) ? <div className="mt-3"><EndedNote r={r} /></div> : (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#eef1f6] pt-2.5 text-[12.5px]">
              <span className="truncate text-[#4a5263]">{r.engineerName ? <>Serviced by <span className="font-semibold text-[#0b1324]">{r.engineerName}</span></> : 'Service completed'}</span>
              {r.rating
                ? <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-[#0b1324]">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= r.rating ? 'h-3.5 w-3.5 fill-amber-400 text-amber-400' : 'h-3.5 w-3.5 text-[#d6dce7]'} />)}</span>
                : r.status === 'approved' && <Link to={`/customer/tracking#${r._id}`} className="shrink-0 font-semibold text-[#1456d8]">Rate service</Link>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
