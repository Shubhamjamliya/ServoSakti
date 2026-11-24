import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarDays, ChevronDown, ClipboardList, KeyRound, MapPin, Star, Wrench } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { BackButton } from '@/shared/components/Mobile';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { cn, inr } from '@/shared/lib/utils';
import { fmtDate, fmtDateTime } from '@/shared/lib/format';
import { payWith } from '@/shared/lib/razorpay';
import BillView, { CoverageBadge } from '@/shared/components/BillView';
import { ENDED, customerAction, isActive } from '../srStatus.js';
import { EndedNote, EngineerRow, SrPill, StepBar, Timeline } from '../components/SrParts.jsx';
import { InvoiceButton, ReportProblem, WalletToggle, hasInvoice } from '../components/MoneyParts.jsx';

/** SOP stage 7: the customer reads this code out to the engineer on site to confirm the work. */
function OtpBox({ otp }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#cfe0fb] bg-[#eef4ff] px-3.5 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1456d8]"><KeyRound className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[#4a5263]">Share this OTP with the engineer to confirm the work</p>
        <p className="text-[11px] text-[#5d667a]">Valid till {fmtDateTime(otp.expiresAt)}</p>
      </div>
      <p className="text-[24px] font-extrabold tracking-[0.2em] text-[#1456d8]">{otp.code}</p>
    </div>
  );
}

/** After the service is approved: rate it, which closes the request. */
function RateBox({ sr, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api(`/service-requests/${sr._id}/confirm-closure`, { method: 'POST', body: { rating, feedback } }); toast.success('Thanks for your feedback'); onDone(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
      <p className="text-[13px] font-semibold text-[#0b1324]">Service completed. How was it?</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star className={cn('h-7 w-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-[#cfd6e2]')} />
          </button>
        ))}
      </div>
      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Tell us more (optional)" className="w-full resize-none rounded-xl border border-[#e6ebf3] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1456d8]" />
      <button type="button" disabled={!rating || busy} onClick={submit} className="w-full rounded-xl bg-[#1456d8] py-2.5 text-[14px] font-bold text-white disabled:opacity-50">{busy ? 'Submitting...' : 'Submit & Close Request'}</button>
    </div>
  );
}

const BEFORE_VISIT = ['pending_payment', 'created', 'verified', 'offered', 'unassigned', 'assigned'];

/** Bill, revised price approval, payment, cancel / reschedule and disputes for one request. */
function MoneyBox({ r, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState(''); // 'reschedule'
  const [useWallet, setUseWallet] = useState(true);
  const { data: wallet } = useApi('/wallet/me');
  const [when, setWhen] = useState('');
  const run = async (name, fn, ok) => {
    setBusy(name);
    try { await fn(); if (ok) toast.success(ok); setPanel(''); onChange(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const quote = r.quote?.status === 'pending' ? r.quote : null;

  const pay = () => run('pay', async () => { const { payment } = await api(`/service-requests/${r._id}/pay`, { method: 'POST', body: { useWallet } }); if (payment) await payWith(payment); }, 'Payment received');
  const dueNow = r.status === 'pending_payment' ? (r.bill?.upfront || r.bill?.due) : r.bill?.due;
  const walletBal = wallet?.balance || 0;
  const payLeft = Math.max(0, (dueNow || 0) - (useWallet ? walletBal : 0));
  const answer = (decision) => {
    if (decision === 'reject' && !window.confirm('Rejecting ends this visit. You pay only the visit charge and anything extra you paid is refunded. Reject?')) return;
    run(decision, () => api(`/service-requests/${r._id}/quote`, { method: 'POST', body: { decision } }), decision === 'approve' ? 'Approved. The engineer will continue.' : 'Revised price rejected');
  };
  const cancel = () => {
    const note = r.status === 'assigned' ? 'An engineer is already assigned. If your slot is less than 2 hours away, a small cancellation fee applies. Cancel anyway?' : 'Cancel this request? Anything you paid is refunded in full.';
    if (window.confirm(note)) run('cancel', () => api(`/service-requests/${r._id}/cancel`, { method: 'PATCH', body: { reason: 'Cancelled by customer' } }), 'Request cancelled');
  };
  const reschedule = () => run('reschedule', () => api(`/service-requests/${r._id}/reschedule`, { method: 'PATCH', body: { scheduledAt: new Date(when).toISOString() } }), 'Visit rescheduled');

  return (
    <div className="space-y-3">
      {quote && (
        <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-3.5">
          <p className="text-[13.5px] font-bold text-[#0b1324]">Approve revised price</p>
          <p className="text-[12.5px] text-[#4a5263]">{quote.reason}</p>
          <p className="text-[15px] font-bold text-[#0b1324]">{inr(quote.oldTotal)} → {inr(quote.newTotal)}</p>
          <div className="rounded-xl bg-white p-2.5"><BillView bill={quote.bill} showPayments={false} /></div>
          <p className="text-[11px] text-[#5d667a]">Waiting until {fmtDateTime(quote.expiresAt)}. If you do not answer, only the booked work is done at the booked price.</p>
          <div className="flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => answer('reject')} className="flex-1 rounded-xl border border-[#d0d5dd] bg-white py-2 text-[13px] font-semibold text-[#344054]">Reject</button>
            <button type="button" disabled={!!busy} onClick={() => answer('approve')} className="flex-1 rounded-xl bg-[#1456d8] py-2 text-[13px] font-bold text-white">{busy === 'approve' ? 'Approving...' : 'Approve'}</button>
          </div>
        </div>
      )}

      {r.bill && (
        <div className="rounded-2xl border border-[#e6ebf3] p-3">
          <div className="mb-1 flex items-center justify-between"><p className="text-[12px] font-bold uppercase tracking-wide text-[#5d667a]">Bill</p><CoverageBadge coverage={r.coverage} /></div>
          <BillView bill={r.bill} />
        </div>
      )}

      {r.bill?.due > 0 && !quote && <WalletToggle balance={walletBal} checked={useWallet} onChange={setUseWallet} amount={dueNow} />}
      {r.bill?.due > 0 && !quote && (
        <button type="button" disabled={!!busy} onClick={pay} className="w-full rounded-xl bg-[#1456d8] py-2.5 text-[14px] font-bold text-white disabled:opacity-50">
          {busy === 'pay' ? 'Opening payment...' : payLeft <= 0 ? 'Pay from wallet' : r.status === 'pending_payment' ? `Pay ${inr(payLeft)} to confirm booking` : `Pay ${inr(payLeft)}`}
        </button>
      )}

      {BEFORE_VISIT.includes(r.status) && (
        <div className="flex gap-2 text-[12.5px] font-semibold">
          {r.status !== 'pending_payment' && r.slot !== 'urgent' && <button type="button" onClick={() => setPanel(panel === 'reschedule' ? '' : 'reschedule')} className="flex-1 rounded-xl border border-[#d0d5dd] py-2 text-[#344054]">Reschedule</button>}
          <button type="button" disabled={!!busy} onClick={cancel} className="flex-1 rounded-xl border border-red-200 py-2 text-red-700">Cancel request</button>
        </div>
      )}
      {panel === 'reschedule' && (
        <div className="flex gap-2">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#e6ebf3] px-3 py-2 text-[13px]" />
          <button type="button" disabled={!when || !!busy} onClick={reschedule} className="rounded-xl bg-[#1456d8] px-3 text-[13px] font-bold text-white disabled:opacity-50">Save</button>
        </div>
      )}

      {hasInvoice(r) && <InvoiceButton path={`/service-requests/${r._id}/invoice`} filename={`Invoice-${r.srNumber}.pdf`} />}
      <ReportProblem r={r} onDone={onChange} />
    </div>
  );
}

const Detail = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#8a93a5]" />
    <div className="min-w-0 text-[12.5px]"><p className="text-[#5d667a]">{label}</p><p className="font-medium text-[#0b1324]">{children}</p></div>
  </div>
);

function TrackCard({ r, onChange, open, onToggle }) {
  return (
    <article id={r._id} className={cn('scroll-mt-24 overflow-hidden rounded-[18px] border bg-white shadow-[0_2px_10px_rgba(15,35,80,0.04)]', open ? 'border-[#bcd2fa]' : 'border-[#e6ebf3]')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full gap-3 p-3.5 pb-3 text-left">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f0fe] text-[#1456d8]"><Wrench className="h-5 w-5" strokeWidth={1.9} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15.5px] font-bold text-[#0b1324]">SR #{String(r.srNumber).replace(/^SR-/, '')}</p>
            <SrPill status={r.status} />
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-[#4a5263]">{[r.model || r.brand, r.issue].filter(Boolean).join(' – ')}</p>
          <p className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-[#5d667a]">
            <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Created: {fmtDate(r.createdAt)}</span>
            <span className="flex items-center gap-0.5 font-semibold text-[#1456d8]">{open ? 'Hide' : 'Details'}<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} /></span>
          </p>
        </div>
      </button>

      <div className="space-y-3 border-t border-[#eef1f6] p-3.5">
        {r.status === 'in_progress' && r.otp?.code && <OtpBox otp={r.otp} />}
        {customerAction(r) && !open && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">{customerAction(r)} · open details</p>}
        {ENDED.includes(r.status) ? <EndedNote r={r} /> : <EngineerRow r={r} chevron={false} call />}
      </div>

      {!open && !ENDED.includes(r.status) && <div className="border-t border-[#eef1f6] bg-[#fafbfe] px-2 pb-3 pt-3"><StepBar status={r.status} /></div>}
      {open && !ENDED.includes(r.status) && <div className="border-t border-[#eef1f6] bg-[#fafbfe] p-3.5"><Timeline r={r} /></div>}
      {open && <div className="border-t border-[#eef1f6] p-3.5"><MoneyBox r={r} onChange={onChange} /></div>}

      {open && <div className="border-t border-[#eef1f6] px-3.5 py-2">
        {r.scheduledAt && BEFORE_VISIT.includes(r.status) && <Detail icon={CalendarDays} label="Visit slot">{r.slot === 'urgent' ? 'Urgent (within 3 hours)' : fmtDateTime(r.scheduledAt)}</Detail>}
        {r.vendorName && <Detail icon={Wrench} label="Service company">{r.vendorName}</Detail>}
        {r.tatDueAt && !['under_review', 'approved'].includes(r.status) && <Detail icon={CalendarDays} label="Expected by">{fmtDateTime(r.tatDueAt)}</Detail>}
        {r.address && <Detail icon={MapPin} label="Service address">{r.address}</Detail>}
      </div>}

      {r.status === 'approved' && <div className="border-t border-[#eef1f6] p-3.5"><RateBox sr={r} onDone={onChange} /></div>}
    </article>
  );
}

export default function Tracking() {
  const { hash } = useLocation();
  const focus = hash.slice(1);
  const { data, loading, reload } = useApi('/service-requests?limit=50');
  const active = (data?.items || []).filter(isActive);
  const [openId, setOpenId] = useState(null);
  const expanded = openId ?? (focus || active[0]?._id); // tapped card, else the one linked from Home, else the first

  useEffect(() => {
    if (focus && active.length) document.getElementById(focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, active.length]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <BackButton to="/customer/home" />
        <div>
          <h1 className="text-[22px] font-bold text-[#0b1324]">Track Service</h1>
          <p className="text-[13.5px] text-[#5d667a]">Live status of your active requests</p>
        </div>
      </div>
      {loading && <div className="h-64 animate-pulse rounded-[18px] bg-[#e8eef8]" />}
      {!loading && active.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-[#d7deea] bg-white px-4 py-10 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-[#9aa5b8]" strokeWidth={1.6} />
          <p className="mt-2 text-[13px] text-[#5d667a]">No active requests to track.</p>
        </div>
      )}
      {active.map((r) => <TrackCard key={r._id} r={r} onChange={reload} open={r._id === expanded} onToggle={() => setOpenId(r._id === expanded ? '' : r._id)} />)}
    </div>
  );
}
