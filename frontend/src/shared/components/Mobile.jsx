import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/lib/utils';
import { humanize } from '@/shared/lib/format';

// Small building blocks for the phone-width Engineer/Customer screens.
// They avoid tables/sidebars so each one maps cleanly onto a React Native View later.

export const Screen = ({ title, subtitle, action, children }) => (
  <div className="space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export const Section = ({ title, children, className }) => (
  <section className={cn('space-y-2', className)}>
    {title && <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500">{title}</h3>}
    {children}
  </section>
);

export const Panel = ({ className, children }) => <div className={cn('rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm', className)}>{children}</div>;

/** Compact stat card for phone screens (same look as the desktop MetricCard). */
export const StatTile = ({ label, value, helper, icon: Icon, accent = 'bg-sky-100', to }) => {
  const body = (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className={cn('absolute inset-0 opacity-40', accent)} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-500">{label}</p>
          <p className="text-xl font-bold leading-tight text-neutral-900">{value}</p>
          {helper && <p className="truncate text-[10px] font-medium text-neutral-500">{helper}</p>}
        </div>
        {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/90 ring-1 ring-neutral-200"><Icon className="h-4 w-4 text-neutral-700" /></span>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

export const Empty = ({ children }) => <p className="rounded-xl border border-dashed py-8 text-center text-sm text-neutral-500">{children}</p>;

export const Field = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label}</span>
    {children}
  </label>
);

export const KeyValue = ({ label, children }) => (
  <div className="flex justify-between gap-3 border-b border-neutral-100 py-2 text-sm last:border-0">
    <span className="text-neutral-500">{label}</span>
    <span className="text-right font-medium text-neutral-800">{children || '—'}</span>
  </div>
);

export const StatusPill = ({ status }) => <Badge>{humanize(status)}</Badge>;

/** A tappable list row that navigates. */
export const RowLink = ({ to, title, meta, right }) => (
  <Link to={to} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition active:scale-[0.99]">
    <div className="min-w-0">
      <p className="truncate font-semibold text-neutral-900">{title}</p>
      {meta && <p className="truncate text-sm text-neutral-500">{meta}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{right}<ChevronRight className="h-4 w-4 text-neutral-400" /></div>
  </Link>
);

export const ErrorNote = ({ children }) => children ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null;
