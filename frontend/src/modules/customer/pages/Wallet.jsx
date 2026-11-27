import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CreditCard, Hourglass, Plus, Wallet as WalletIcon } from 'lucide-react';
import { Empty, Panel, Screen } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { payWith } from '@/shared/lib/razorpay';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';

const KIND = { refund: 'Refund', wallet_payment: 'Paid from wallet', adjustment: 'Adjustment by support', topup: 'Added money' };
const QUICK = [200, 500, 1000, 2000];

/** Add money to the wallet through Razorpay. The balance updates once the server has verified the payment. */
function TopUp({ onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const add = async () => {
    setBusy(true);
    try {
      const payment = await api('/wallet/topup', { method: 'POST', body: { amount: value } });
      await payWith(payment);
      toast.success(`${inr(value)} added to your wallet`);
      setAmount('');
      onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Panel className="space-y-2.5">
      <p className="text-[14px] font-bold text-[#0b1324]">Add money</p>
      <div className="flex items-center rounded-xl border border-[#d0d5dd] bg-white px-3 focus-within:border-[#1456d8]">
        <span className="text-[15px] font-bold text-[#5d667a]">₹</span>
        <input type="number" inputMode="numeric" min="10" max="50000" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent px-2 py-2.5 text-[15px] font-semibold text-[#0b1324] outline-none" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setAmount(String(q))} className={cn('rounded-lg border px-1 py-1.5 text-[12.5px] font-semibold', value === q ? 'border-[#1456d8] bg-[#eef3fd] text-[#1456d8]' : 'border-[#d0d5dd] bg-white text-[#344054]')}>+{inr(q)}</button>
        ))}
      </div>
      <button type="button" disabled={busy || !(value >= 10 && value <= 50000)} onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1456d8] py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">
        <Plus className="h-4 w-4" />{busy ? 'Processing...' : value > 0 ? `Add ${inr(value)}` : 'Add money'}
      </button>
      <p className="text-[11px] text-[#5d667a]">Pay securely with UPI, card or net banking via Razorpay. Min ₹10, max ₹50,000.</p>
    </Panel>
  );
}
const STATUS = {
  awaiting_customer: ['Choose where to refund', 'bg-amber-100 text-amber-800'],
  pending_approval: ['Waiting for approval', 'bg-sky-100 text-sky-800'],
  completed: ['Refunded', 'bg-emerald-100 text-emerald-800'],
  rejected: ['Not approved', 'bg-red-100 text-red-700'],
  cancelled: ['Cancelled', 'bg-neutral-100 text-neutral-600'],
};

/** A refund waiting for the customer: wallet (instant after approval) or the original payment (5–7 working days). */
function ChooseRefund({ r, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const online = r.sourceRefundable ?? 0;
  const choose = async (destination) => {
    setBusy(destination);
    try { await api(`/refunds/${r._id}/choose`, { method: 'PATCH', body: { destination } }); toast.success(r.preApproved ? 'Refund done' : 'Sent for approval'); onDone(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13.5px] font-bold text-[#0b1324]">{inr(r.amount)} refund · {r.srNumber || 'AMC / CMC plan'}</p>
          <p className="text-[12px] text-[#4a5263]">{r.reason}</p>
        </div>
      </div>
      <p className="text-[11.5px] text-[#5d667a]">Where should we send it?</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!!busy} onClick={() => choose('wallet')} className="rounded-xl bg-[#1456d8] px-2 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50">
          <WalletIcon className="mx-auto mb-0.5 h-4 w-4" />{busy === 'wallet' ? 'Sending...' : 'App wallet'}
          <span className="block text-[10.5px] font-normal opacity-80">Use on your next booking</span>
        </button>
        <button type="button" disabled={!!busy || online < r.amount} onClick={() => choose('source')} className="rounded-xl border border-[#d0d5dd] bg-white px-2 py-2.5 text-[12.5px] font-bold text-[#344054] disabled:opacity-50">
          <CreditCard className="mx-auto mb-0.5 h-4 w-4" />{busy === 'source' ? 'Sending...' : 'Original payment'}
          <span className="block text-[10.5px] font-normal text-[#5d667a]">{online >= r.amount ? '5–7 working days' : online > 0 ? `Only ${inr(online)} was paid online` : 'Paid in cash: wallet only'}</span>
        </button>
      </div>
      {!r.preApproved && <p className="text-[11px] text-[#5d667a]">Refunds are checked and approved by our team before the money moves.</p>}
    </div>
  );
}

export default function Wallet() {
  const [v, setV] = useState(0);
  const { data: w } = useApi(`/wallet/me?v=${v}`);
  const { data: refunds } = useApi(`/refunds?limit=50&v=${v}`);
  const { data: txns } = useApi(`/wallet/txns?limit=50&v=${v}`);
  const reload = () => setV((x) => x + 1);
  const items = refunds?.items || [];
  const waiting = items.filter((r) => r.status === 'awaiting_customer');
  const others = items.filter((r) => r.status !== 'awaiting_customer');

  return (
    <Screen back="/customer/profile" title="Wallet & refunds" subtitle="Add money, refunds you keep in the app and how you used them">
      <div className="rounded-[20px] bg-gradient-to-br from-[#1456d8] to-[#0b3a9c] p-4 text-white shadow-lg shadow-[#1456d8]/20">
        <p className="text-[12px] font-medium opacity-80">Wallet balance</p>
        <p className="mt-0.5 text-[30px] font-extrabold">{inr(w?.balance || 0)}</p>
        <p className="text-[11.5px] opacity-80">Tick “Use wallet balance” when you book or pay to use it.</p>
      </div>

      <TopUp onDone={reload} />

      {waiting.length > 0 && <div className="space-y-2">{waiting.map((r) => <ChooseRefund key={r._id} r={r} onDone={reload} />)}</div>}

      <Panel className="space-y-1">
        <p className="mb-1 text-[14px] font-bold text-[#0b1324]">Refunds</p>
        {!others.length && <p className="py-2 text-[12.5px] text-[#5d667a]">No refunds yet.</p>}
        {others.map((r) => {
          const [label, tone] = STATUS[r.status] || [r.status, 'bg-neutral-100'];
          return (
            <div key={r._id} className="flex items-start justify-between gap-3 border-b border-[#f0f3f8] py-2 last:border-0">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#0b1324]">{inr(r.amount)} · {r.srNumber || 'AMC / CMC plan'}</p>
                <p className="truncate text-[11.5px] text-[#5d667a]">{r.reason}</p>
                <p className="text-[11px] text-[#8a93a5]">{fmtDateTime(r.completedAt || r.updatedAt)}{r.destination && ` · to ${r.destination === 'wallet' ? 'wallet' : 'original payment'}`}{r.status === 'rejected' && r.note ? ` · ${r.note}` : ''}</p>
              </div>
              <span className={cn('shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold', tone)}>{r.status === 'pending_approval' ? <Hourglass className="mr-0.5 inline h-3 w-3" /> : null}{label}</span>
            </div>
          );
        })}
      </Panel>

      <Panel className="space-y-1">
        <p className="mb-1 text-[14px] font-bold text-[#0b1324]">Wallet transactions</p>
        {!txns?.items?.length && <Empty>No wallet transactions yet.</Empty>}
        {(txns?.items || []).map((t) => (
          <div key={t._id} className="flex items-center gap-3 border-b border-[#f0f3f8] py-2 last:border-0">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', t.direction === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
              {t.direction === 'credit' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[#0b1324]">{KIND[t.kind] || t.kind}{t.srNumber ? ` · ${t.srNumber}` : ''}</p>
              <p className="text-[11px] text-[#8a93a5]">{fmtDateTime(t.createdAt)}</p>
            </div>
            <p className={cn('text-[13.5px] font-bold', t.direction === 'credit' ? 'text-emerald-700' : 'text-red-600')}>{t.direction === 'credit' ? '+' : '−'}{inr(t.amount)}</p>
          </div>
        ))}
      </Panel>
    </Screen>
  );
}
