import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { humanize } from '@/shared/lib/format';

// Small building blocks for the phone-width Engineer/Customer screens, in the customer app's look
// (Plus Jakarta Sans, white rounded cards, #1456d8 accents). They avoid tables/sidebars so each one maps cleanly
// onto a React Native View later.

/**
 * Back button for pages that are not on the bottom nav bar.
 *   to       where to go when there is no in-app page to return to (link opened directly, from a push, etc.)
 *   onClick  for in-page sub-screens (a form inside a list page): replaces the history step
 */
export function BackButton({ to = '/', onClick, className }) {
  const navigate = useNavigate();
  const back = onClick || (() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(to, { replace: true })));
  return (
    <button
      type="button"
      onClick={back}
      aria-label="Back"
      className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e2e8f0] bg-white text-[#5d667a] transition hover:bg-[#f8fafc]', className)}
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}

/** `back`: a fallback path, or a function for in-page sub-screens. Omit it on bottom-nav pages. */
export const Screen = ({ title, subtitle, action, back, children }) => (
  <div className="space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {back && <BackButton {...(typeof back === 'function' ? { onClick: back } : { to: back })} />}
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold leading-tight text-[#0b1324]">{title}</h1>
          {subtitle && <p className="text-[13.5px] text-[#5d667a]">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </div>
);

export const Section = ({ title, action, children, className }) => (
  <section className={cn('space-y-2.5', className)}>
    {title && (
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-bold text-[#0b1324]">{title}</h3>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const Panel = ({ className, children }) => (
  <div className={cn('rounded-[18px] border border-[#e6ebf3] bg-white p-4 shadow-[0_2px_10px_rgba(15,35,80,0.04)]', className)}>{children}</div>
);

/** Metric tile, like the customer Profile's activity tiles. `accent` tints the icon square. */
export const StatTile = ({ label, value, helper, icon: Icon, accent = 'bg-sky-100', to }) => {
  const body = (
    <div className="flex items-center gap-3 rounded-[18px] border border-[#e6ebf3] bg-white p-3 shadow-[0_2px_10px_rgba(15,35,80,0.04)] transition active:scale-[0.99]">
      {Icon && <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#0b1324]', accent)}><Icon className="h-5 w-5" strokeWidth={1.9} /></span>}
      <div className="min-w-0">
        <p className="text-[19px] font-bold leading-tight text-[#0b1324]">{value}</p>
        <p className="truncate text-[11.5px] font-semibold text-[#4a5263]">{label}</p>
        {helper && <p className="truncate text-[10.5px] text-[#8a93a5]">{helper}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

export const Empty = ({ children, icon: Icon = Inbox }) => (
  <div className="rounded-[18px] border border-dashed border-[#d7deea] bg-white px-4 py-8 text-center">
    <Icon className="mx-auto h-8 w-8 text-[#9aa5b8]" strokeWidth={1.6} />
    <p className="mt-2 text-[13px] text-[#5d667a]">{children}</p>
  </div>
);

export const Field = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[#475467]">{label}</span>
    {children}
  </label>
);

export const KeyValue = ({ label, children }) => (
  <div className="flex justify-between gap-3 border-b border-[#eef1f6] py-2 text-[13px] last:border-0">
    <span className="text-[#5d667a]">{label}</span>
    <span className="text-right font-semibold text-[#0b1324]">{children || '—'}</span>
  </div>
);

// Status words → pill label and colour (service request, payout and incentive statuses).
const PILL = {
  pending_payment: ['Awaiting Payment', 'bg-amber-50 text-amber-700'],
  created: ['New', 'bg-amber-50 text-amber-700'],
  verified: ['Verified', 'bg-sky-50 text-sky-700'],
  offered: ['Offered', 'bg-sky-50 text-sky-700'],
  unassigned: ['Unassigned', 'bg-red-50 text-red-700'],
  assigned: ['Assigned', 'bg-[#e9f0fe] text-[#1456d8]'],
  in_progress: ['In Progress', 'bg-[#e9f0fe] text-[#1456d8]'],
  under_review: ['Under Review', 'bg-violet-50 text-violet-700'],
  approved: ['Approved', 'bg-emerald-50 text-emerald-700'],
  closed: ['Closed', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Cancelled', 'bg-slate-100 text-slate-600'],
  failed: ['Not Completed', 'bg-red-50 text-red-700'],
  paid: ['Paid', 'bg-emerald-50 text-emerald-700'],
  credited: ['In Wallet', 'bg-emerald-50 text-emerald-700'],
  pending: ['Pending', 'bg-amber-50 text-amber-700'],
  held: ['Held', 'bg-amber-50 text-amber-700'],
  eligible: ['Eligible', 'bg-emerald-50 text-emerald-700'],
  issued: ['Issued', 'bg-sky-50 text-sky-700'],
  'in progress': ['In Progress', 'bg-[#e9f0fe] text-[#1456d8]'],
};

export const StatusPill = ({ status, className }) => {
  const [label, tone] = PILL[String(status || '').toLowerCase()] || [humanize(status), 'bg-slate-100 text-slate-600'];
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-0.5 text-[11.5px] font-semibold', tone, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{label}
    </span>
  );
};

/** A tappable list row that navigates. */
export const RowLink = ({ to, title, meta, right }) => (
  <Link to={to} className="flex items-center justify-between gap-3 rounded-[18px] border border-[#e6ebf3] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,35,80,0.04)] transition active:scale-[0.99]">
    <div className="min-w-0">
      <p className="truncate text-[14.5px] font-bold text-[#0b1324]">{title}</p>
      {meta && <p className="truncate text-[12px] text-[#5d667a]">{meta}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{right}<ChevronRight className="h-4 w-4 text-[#9aa5b8]" /></div>
  </Link>
);

export const ErrorNote = ({ children }) => children ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{children}</p> : null;

/** Primary / secondary buttons in the customer app's style (rounded-xl, bold, blue with a soft shadow). */
export const primaryBtn = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1456d8] text-[14px] font-bold text-white shadow-md shadow-[#1456d8]/20 transition hover:bg-[#1149b8] active:scale-[0.99] disabled:opacity-50';
export const secondaryBtn = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d0d5dd] bg-white text-[14px] font-semibold text-[#344054] transition hover:bg-[#f8fafc] active:scale-[0.99] disabled:opacity-50';
