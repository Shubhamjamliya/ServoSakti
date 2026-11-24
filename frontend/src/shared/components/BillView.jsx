import { ShieldCheck } from 'lucide-react';
import { cn, inr } from '@/shared/lib/utils';
import { COVERAGE } from '@/shared/lib/format';

/** Coverage chip: OEM warranty / AMC / CMC / not covered. */
export function CoverageBadge({ coverage, className }) {
  const c = COVERAGE[coverage || 'none'];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', c.tone, className)}>
      <ShieldCheck className="h-3 w-3" /> {c.label}
    </span>
  );
}

const Row = ({ label, value, strong, muted, className }) => (
  <div className={cn('flex justify-between gap-3 py-1 text-[13px]', strong && 'font-bold text-[#0b1324]', muted && 'text-[#5d667a]', className)}>
    <span>{label}</span><span className="shrink-0">{value}</span>
  </div>
);

/**
 * A bill as the server computed it: every line, covered lines struck through with the reason, discount, GST, total
 * and (once payments exist) paid / refunded / due. Nothing is calculated here.
 */
export default function BillView({ bill, showPayments = true, title }) {
  if (!bill) return null;
  return (
    <div className="space-y-0.5">
      {title && <p className="pb-1 text-[12px] font-bold uppercase tracking-wide text-[#5d667a]">{title}</p>}
      {(bill.lines || []).map((l) => (
        <div key={l.code} className="flex justify-between gap-3 py-1 text-[13px]">
          <span className="min-w-0">
            <span className="text-[#0b1324]">{l.label}{l.qty > 1 ? ` × ${l.qty}` : ''}</span>
            {l.covered && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">{l.note || 'Covered'}</span>}
          </span>
          <span className="shrink-0">
            {l.covered && <span className="mr-1.5 text-[#9aa5b8] line-through">{inr(l.listAmount)}</span>}
            {inr(l.amount)}
          </span>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-[#e1e6ef]" />
      {(bill.prepaidDiscount ?? (bill.couponDiscount ? 0 : bill.discount)) > 0 && <Row label="Prepaid discount" value={`− ${inr(bill.prepaidDiscount ?? bill.discount)}`} className="text-emerald-700" />}
      {bill.couponDiscount > 0 && <Row label={`Coupon ${bill.couponCode || ''}`} value={`− ${inr(bill.couponDiscount)}`} className="text-emerald-700" />}
      {bill.couponNote && <p className="py-0.5 text-[11.5px] text-amber-700">{bill.couponNote}</p>}
      <Row label={`GST ${bill.gstPercent ?? 18}%`} value={inr(bill.gst)} muted />
      <Row label="Total" value={inr(bill.total)} strong />
      {showPayments && bill.paid > 0 && <Row label="Paid" value={inr(bill.paid)} muted />}
      {showPayments && bill.refunded > 0 && <Row label="Refunded" value={inr(bill.refunded)} muted />}
      {showPayments && bill.due > 0 && <Row label="Due" value={inr(bill.due)} strong className="text-[#b42318]" />}
    </div>
  );
}
