import { Check, ChevronRight, Phone, UserRound, XCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STEPS, isDone, pillOf, stepIndex, stepNote } from '../srStatus.js';

export function SrPill({ status }) {
  const [label, tone] = pillOf(status);
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-0.5 text-[11.5px] font-semibold', tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{label}
    </span>
  );
}

const initials = (name) => name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Engineer row inside a request card. */
export function EngineerRow({ r, chevron = true, call = false }) {
  return (
    <div className="flex items-center gap-2.5">
      {r.engineerName
        ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1d2848] text-[12px] font-bold text-white">{initials(r.engineerName)}</span>
        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f4f9] text-[#9aa5b8]"><UserRound className="h-4.5 w-4.5" /></span>}
      <div className="min-w-0 flex-1 leading-tight">
        <p className={cn('truncate text-[13.5px] font-semibold', r.engineerName ? 'text-[#0b1324]' : 'text-[#5d667a]')}>{r.engineerName || 'Engineer will be assigned soon'}</p>
        <p className="truncate text-[11.5px] text-[#5d667a]">{r.engineerName ? 'Assigned Engineer' : 'We are matching the best engineer near you'}</p>
      </div>
      {call && r.engineerPhone && (
        <a href={`tel:${r.engineerPhone}`} onClick={(e) => e.stopPropagation()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9f0fe] text-[#1456d8]" aria-label="Call engineer"><Phone className="h-4 w-4" /></a>
      )}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa5b8]" />}
    </div>
  );
}

/** Compact horizontal progress for cards. */
export function StepBar({ status }) {
  const at = stepIndex(status);
  const done = isDone(status);
  return (
    <ol className="grid grid-cols-5">
      {STEPS.map((s, n) => {
        const complete = n < at || (done && n === at);
        const current = n === at && !done;
        return (
          <li key={s.key} className="relative flex flex-col items-center">
            {n > 0 && <span className={cn('absolute right-1/2 top-[9px] h-[2px] w-full', n <= at ? 'bg-[#1456d8]' : 'bg-[#e1e6ef]')} />}
            <span className={cn('relative z-10 flex h-5 w-5 items-center justify-center rounded-full',
              complete ? 'bg-[#1456d8] text-white' : current ? 'border-2 border-[#1456d8] bg-white ring-[3px] ring-[#e3ecfd]' : 'border-2 border-[#d6dce7] bg-white')}>
              {complete ? <Check className="h-3 w-3" strokeWidth={3.2} /> : current ? <span className="h-1.5 w-1.5 rounded-full bg-[#1456d8]" /> : null}
            </span>
            <span className={cn('mt-1.5 whitespace-nowrap text-[10.5px]', n <= at ? 'font-semibold text-[#0b1324]' : 'text-[#8a93a5]')}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Vertical timeline with a detail line per step, for the tracking screen. */
export function Timeline({ r }) {
  const at = stepIndex(r.status);
  const done = isDone(r.status);
  return (
    <ol>
      {STEPS.map((s, n) => {
        const complete = n < at || (done && n === at);
        const current = n === at && !done;
        const note = stepNote(s, r);
        return (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {n < STEPS.length - 1 && <span className={cn('absolute left-[11px] top-6 h-[calc(100%-24px)] w-[2px]', n < at ? 'bg-[#1456d8]' : 'bg-[#e1e6ef]')} />}
            <span className={cn('relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
              complete ? 'bg-[#1456d8] text-white' : current ? 'border-2 border-[#1456d8] bg-white ring-4 ring-[#e3ecfd]' : 'border-2 border-[#d6dce7] bg-white')}>
              {complete ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : current ? <span className="h-2 w-2 rounded-full bg-[#1456d8]" /> : null}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn('text-[14px] leading-tight', n <= at ? 'font-semibold text-[#0b1324]' : 'text-[#8a93a5]')}>{s.title}</p>
              {note && <p className="mt-0.5 text-[12px] text-[#5d667a]">{note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Replaces the progress bar for cancelled / failed requests. */
export function EndedNote({ r }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px]', r.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700')}>
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{r.status === 'failed' ? `Service could not be completed${r.failReason ? `: ${r.failReason}` : '.'}` : 'This request was cancelled.'}</span>
    </div>
  );
}
