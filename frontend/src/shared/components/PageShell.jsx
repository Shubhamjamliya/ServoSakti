import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/shared/components/ui/card';
import { NativeSelect } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';

export const PERIODS = [['overall', 'All time'], ['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month']];

/** Dashboard period filter; pass the value as `?period=` to the stats endpoint. */
export const PeriodSelect = ({ value, onChange }) => (
  <NativeSelect className="w-40" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Period">
    {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </NativeSelect>
);

export function PageShell({ eyebrow, title, actions, children }) {
  return (
    <div className="px-4 pb-10 pt-4 lg:px-6">
      <div className="sf-rise relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 border-b border-neutral-200 bg-gradient-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {eyebrow && <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{eyebrow}</p>}
            <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <div className="space-y-6 p-6">{children}</div>
      </div>
    </div>
  );
}

export function MetricCard({ title, value, helper, icon: Icon, accent = 'bg-amber-100', path }) {
  const navigate = useNavigate();
  return (
    <Card
      className="group relative cursor-pointer overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
      onClick={() => path && navigate(path)}
    >
      <CardContent className="relative flex flex-col gap-2 px-4 pb-4 pt-4">
        <div className={`absolute inset-0 opacity-40 transition-opacity duration-300 group-hover:opacity-60 ${accent}`} />
        <div className="relative z-10 flex items-center justify-between">
          <div className="mr-2 min-w-0 flex-1">
            <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">{title}</p>
            <p className="mb-1 text-xl font-bold leading-tight text-neutral-900">{value}</p>
            <p className="line-clamp-1 text-[10px] font-medium text-neutral-500">{helper}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-neutral-200 transition-all duration-300 group-hover:rotate-6 group-hover:scale-110">
            {Icon && <Icon className="h-5 w-5 text-neutral-700" />}
          </div>
        </div>
        <ArrowUpRight className="absolute bottom-2 right-2 h-3 w-3 translate-x-2 text-neutral-400 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
      </CardContent>
    </Card>
  );
}

export function DataTable({ columns, rows, empty = 'No records found' }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
          <tr>{columns.map((c) => <th key={c.key} className={cn('whitespace-nowrap px-4 py-3 font-semibold', c.key === '_actions' && 'sticky right-0 bg-neutral-50')}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row._id || row.id} className="transition hover:bg-neutral-50/70">
              {columns.map((c) => (
                <td key={c.key} className={cn('whitespace-nowrap px-4 py-3 text-neutral-700', c.key === '_actions' && 'sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]')}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-neutral-500">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
