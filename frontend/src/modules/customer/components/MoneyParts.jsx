import { useState } from 'react';
import { FileDown, Wallet } from 'lucide-react';
import { api, downloadFile } from '@/shared/lib/api';
import { useBranding } from '@/shared/lib/useBranding';
import { useToast } from '@/shared/context/ToastContext';
import { cn, inr } from '@/shared/lib/utils';

/** Downloads the tax invoice PDF. */
export function InvoiceButton({ path, filename, className, label = 'Download invoice' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const get = async () => {
    setBusy(true);
    try { await downloadFile(path, filename); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <button type="button" disabled={busy} onClick={get} className={cn('inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1456d8] disabled:opacity-50', className)}>
      <FileDown className="h-3.5 w-3.5" />{busy ? 'Preparing...' : label}
    </button>
  );
}

/** An invoice exists once something was billed and the booking is not still waiting for payment. */
export const hasInvoice = (r) => !!r.bill && (r.bill.total > 0 || r.bill.paid > 0) && r.status !== 'pending_payment';

/** "Use wallet balance" choice shown next to a payment button. */
export function WalletToggle({ balance, checked, onChange, amount }) {
  if (!(balance > 0)) return null;
  const used = Math.min(balance, amount || 0);
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#e6ebf3] bg-white px-3 py-2.5 text-[12.5px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#1456d8]" />
      <Wallet className="h-4 w-4 text-[#1456d8]" />
      <span className="flex-1 text-[#0b1324]">Use wallet balance <span className="text-[#5d667a]">({inr(balance)})</span></span>
      {checked && amount > 0 && <span className="font-semibold text-emerald-700">− {inr(used)}</span>}
    </label>
  );
}

const FINISHED = ['approved', 'closed', 'failed'];

/** Can the customer still report a problem on this request (admin switch + days after the visit)? */
export function canReport(r, rules) {
  if (!rules?.disputesEnabled || !FINISHED.includes(r.status)) return false;
  const at = r.closedAt || r.approvedAt || r.completedAt || r.updatedAt;
  return Date.now() - new Date(at).getTime() <= (rules.disputeWindowDays ?? 7) * 86400000;
}

/** "Report a problem" link and form for a finished visit. */
export function ReportProblem({ r, onDone }) {
  const toast = useToast();
  const branding = useBranding();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({ category: 'Wrong charge', reason: '' });
  if (!canReport(r, branding?.rules)) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/service-requests/${r._id}/dispute`, { method: 'POST', body: d });
      toast.success('Problem reported. We will get back within 72 hours.');
      setOpen(false); setD({ category: 'Wrong charge', reason: '' }); onDone?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="text-[12.5px] font-semibold text-[#1456d8]">Report a problem with this visit</button>
      {open && (
        <div className="space-y-2 rounded-2xl border border-[#e6ebf3] p-3">
          <p className="text-[11.5px] text-[#5d667a]">You can report a problem up to {branding.rules.disputeWindowDays} days after the visit.</p>
          <select value={d.category} onChange={(e) => setD((x) => ({ ...x, category: e.target.value }))} className="w-full rounded-xl border border-[#e6ebf3] bg-white px-3 py-2 text-[13px]">
            {['Wrong charge', 'Work not done properly', 'Problem came back', 'Part not replaced', 'Engineer behaviour', 'Damage caused'].map((c) => <option key={c}>{c}</option>)}
          </select>
          <textarea rows={3} value={d.reason} onChange={(e) => setD((x) => ({ ...x, reason: e.target.value }))} placeholder="What went wrong?" className="w-full resize-none rounded-xl border border-[#e6ebf3] px-3 py-2 text-[13px]" />
          <button type="button" disabled={!d.reason.trim() || busy} onClick={submit} className="w-full rounded-xl bg-[#1456d8] py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy ? 'Sending...' : 'Submit'}</button>
        </div>
      )}
    </div>
  );
}
