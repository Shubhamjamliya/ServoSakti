import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Clock, Gift, IndianRupee, Landmark, Wallet } from 'lucide-react';
import { Empty, Field, Panel, Screen, Section, StatusPill, primaryBtn, secondaryBtn } from '@/shared/components/Mobile';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, fmtDate, fmtDateTime, labelOf } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';

const payoutStatus = (p) => (['paid', 'credited'].includes(p.paymentStatus) ? 'credited' : p.approval === 'approved' ? 'approved' : p.approval === 'held' ? 'held' : 'pending');

const KIND = {
  job_earning: 'Job earning', cash_collected: 'Cash collected from customer', cash_handover: 'Cash given to company', cash_deposit: 'Cash deposited',
  withdrawal: 'Withdrawal', withdrawal_reversal: 'Withdrawal returned', adjustment: 'Adjustment',
};
const TONE = { requested: 'bg-amber-50 text-amber-700', submitted: 'bg-amber-50 text-amber-700', paid: 'bg-emerald-50 text-emerald-700', confirmed: 'bg-emerald-50 text-emerald-700', rejected: 'bg-red-50 text-red-600' };
const Tag = ({ s }) => <span className={cn('rounded-lg px-2 py-0.5 text-[11px] font-semibold', TONE[s] || 'bg-neutral-100')}>{['requested', 'submitted'].includes(s) ? 'Waiting' : s[0].toUpperCase() + s.slice(1)}</span>;

/** Wallet: approved earnings come in, customer cash counts against it, withdrawals are paid by the admin by hand. */
function WalletBox() {
  const toast = useToast();
  const [v, setV] = useState(0);
  const { data: w } = useApi(`/wallet/me?v=${v}`);
  const { data: txns } = useApi(`/wallet/txns?limit=30&v=${v}`);
  const { data: wds } = useApi(`/wallet/withdrawals?limit=10&v=${v}`);
  const { data: deps } = useApi(w?.independent ? `/wallet/cash/deposits?limit=10&v=${v}` : null);
  const [panel, setPanel] = useState('');
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState(null);
  const [dep, setDep] = useState({ amount: '', method: 'upi', reference: '' });
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok, after) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setPanel(''); after?.(); setV((x) => x + 1); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  if (!w) return <div className="h-32 animate-pulse rounded-[18px] bg-[#e8eef8]" />;
  const b = bank || w.bank || {};
  const setB = (k) => (e) => setBank({ ...b, [k]: e.target.value });
  const canDeposit = w.independent && w.cashHeld > 0;

  return (
    <Section title="Wallet">
      <Panel className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[10.5px] font-semibold uppercase text-[#5d667a]">Balance</p><p className={cn('text-[16px] font-extrabold', w.balance < 0 ? 'text-red-600' : 'text-[#0b1324]')}>{inr(w.balance)}</p></div>
          <div><p className="text-[10.5px] font-semibold uppercase text-[#5d667a]">Cash held</p><p className="text-[16px] font-extrabold text-amber-700">{inr(w.cashHeld)}</p></div>
          <div><p className="text-[10.5px] font-semibold uppercase text-[#5d667a]">Withdrawable</p><p className="text-[16px] font-extrabold text-emerald-700">{inr(w.withdrawable)}</p></div>
        </div>
        {w.cashHeld > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            {w.independent ? 'Deposit the customer cash you hold to the platform and report it here.' : 'Hand the customer cash you hold to your service company. They confirm it in their panel.'}
          </p>
        )}
        {w.openWithdrawal && <p className="rounded-xl bg-sky-50 px-3 py-2 text-[11.5px] text-sky-800">{inr(w.openWithdrawal.amount)} withdrawal requested on {fmtDate(w.openWithdrawal.createdAt)} is waiting to be paid.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={primaryBtn} disabled={!!w.openWithdrawal || w.withdrawable < w.minWithdrawal} onClick={() => setPanel(panel === 'wd' ? '' : 'wd')}><Landmark className="h-4 w-4" />Withdraw</button>
          {canDeposit
            ? <button type="button" className={secondaryBtn} onClick={() => setPanel(panel === 'dep' ? '' : 'dep')}><Banknote className="h-4 w-4" />Deposit cash</button>
            : <button type="button" className={secondaryBtn} onClick={() => setPanel(panel === 'bank' ? '' : 'bank')}>Bank details</button>}
        </div>
        {w.withdrawable < w.minWithdrawal && !w.openWithdrawal && <p className="text-center text-[11px] text-[#5d667a]">Minimum withdrawal is {inr(w.minWithdrawal)}</p>}
        {canDeposit && <button type="button" className="w-full text-center text-[12px] font-semibold text-[#1456d8]" onClick={() => setPanel(panel === 'bank' ? '' : 'bank')}>Bank details</button>}

        {panel === 'wd' && (
          <div className="space-y-2 rounded-xl border border-[#e6ebf3] p-3">
            {!w.bank?.accountNumber && !w.bank?.upi && <p className="text-[11.5px] text-red-600">Add your bank details or UPI first.</p>}
            <Field label={`Amount (max ${inr(w.withdrawable)})`}><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <button type="button" className={primaryBtn} disabled={busy || !(Number(amount) > 0)} onClick={() => run(() => api('/wallet/withdrawals', { method: 'POST', body: { amount: Number(amount) } }), 'Withdrawal requested', () => setAmount(''))}>{busy ? 'Sending...' : 'Request withdrawal'}</button>
          </div>
        )}
        {panel === 'bank' && (
          <div className="space-y-2 rounded-xl border border-[#e6ebf3] p-3">
            <Field label="Account holder"><Input value={b.accountName || ''} onChange={setB('accountName')} /></Field>
            <Field label="Account number"><Input inputMode="numeric" value={b.accountNumber || ''} onChange={setB('accountNumber')} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="IFSC"><Input value={b.ifsc || ''} onChange={setB('ifsc')} /></Field>
              <Field label="Bank"><Input value={b.bankName || ''} onChange={setB('bankName')} /></Field>
            </div>
            <Field label="UPI ID"><Input value={b.upi || ''} onChange={setB('upi')} placeholder="name@okaxis" /></Field>
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => api('/wallet/bank', { method: 'PUT', body: b }), 'Bank details saved')}>Save</button>
          </div>
        )}
        {panel === 'dep' && (
          <div className="space-y-2 rounded-xl border border-[#e6ebf3] p-3">
            <p className="text-[11.5px] text-[#5d667a]">Pay the cash to the platform account, then report it here. Admin confirms it.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Amount"><Input type="number" inputMode="decimal" value={dep.amount} onChange={(e) => setDep({ ...dep, amount: e.target.value })} /></Field>
              <Field label="Paid by"><NativeSelect value={dep.method} onChange={(e) => setDep({ ...dep, method: e.target.value })}><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="cash">Cash at office</option></NativeSelect></Field>
            </div>
            <Field label="Reference (UTR / UPI ref)"><Input value={dep.reference} onChange={(e) => setDep({ ...dep, reference: e.target.value })} /></Field>
            <button type="button" className={primaryBtn} disabled={busy || !(Number(dep.amount) > 0) || !dep.reference.trim()} onClick={() => run(() => api('/wallet/cash/deposits', { method: 'POST', body: { ...dep, amount: Number(dep.amount) } }), 'Deposit reported', () => setDep({ amount: '', method: 'upi', reference: '' }))}>Report deposit</button>
          </div>
        )}
      </Panel>

      {(wds?.items?.length > 0 || deps?.items?.length > 0) && (
        <Panel className="space-y-1">
          {(wds?.items || []).map((x) => (
            <div key={x._id} className="flex items-center justify-between gap-2 border-b border-[#f0f3f8] py-1.5 text-[12.5px] last:border-0">
              <span className="min-w-0">Withdrawal {inr(x.amount)} <span className="text-[11px] text-[#8a93a5]">· {fmtDate(x.createdAt)}{x.reference ? ` · ${x.reference}` : ''}{x.status === 'rejected' && x.note ? ` · ${x.note}` : ''}</span></span><Tag s={x.status} />
            </div>
          ))}
          {(deps?.items || []).map((x) => (
            <div key={x._id} className="flex items-center justify-between gap-2 border-b border-[#f0f3f8] py-1.5 text-[12.5px] last:border-0">
              <span className="min-w-0">Deposit {inr(x.amount)} <span className="text-[11px] text-[#8a93a5]">· {fmtDate(x.createdAt)} · {x.reference}</span></span><Tag s={x.status} />
            </div>
          ))}
        </Panel>
      )}

      <Panel className="space-y-1">
        <p className="text-[13px] font-bold text-[#0b1324]">Transactions</p>
        {!txns?.items?.length && <p className="py-2 text-[12px] text-[#5d667a]">No wallet transactions yet.</p>}
        {(txns?.items || []).map((t) => (
          <div key={t._id} className="flex items-center gap-2.5 border-b border-[#f0f3f8] py-2 last:border-0">
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', t.direction === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>{t.direction === 'credit' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[#0b1324]">{KIND[t.kind] || t.kind}{t.srNumber ? ` · ${t.srNumber}` : ''}</p>
              <p className="text-[10.5px] text-[#8a93a5]">{fmtDateTime(t.createdAt)} · balance {inr(t.balanceAfter)}</p>
            </div>
            <p className={cn('text-[13px] font-bold', t.direction === 'credit' ? 'text-emerald-700' : 'text-red-600')}>{t.direction === 'credit' ? '+' : '−'}{inr(t.amount)}</p>
          </div>
        ))}
      </Panel>
    </Section>
  );
}

export default function Earnings() {
  const { data: pay, loading } = useApi('/settlements/payouts?limit=100');
  const { data: inc } = useApi('/settlements/incentives');
  const items = pay?.items || [];
  const sum = (fn) => items.filter(fn).reduce((a, p) => a + (p.engineerAmount || 0), 0);
  const credited = sum((p) => ['paid', 'credited'].includes(p.paymentStatus));
  const approved = sum((p) => p.paymentStatus === 'unpaid' && p.approval === 'approved');
  const pending = sum((p) => p.approval !== 'approved');
  const thisMonth = inc?.items?.[0];

  return (
    <Screen title="Earnings" subtitle="Wallet, call-wise payouts and monthly incentive">
      <div className="overflow-hidden rounded-[18px] bg-gradient-to-br from-[#1456d8] to-[#3b82f6] p-4 text-white shadow-[0_10px_30px_rgba(20,86,216,0.25)]">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85"><Wallet className="h-4 w-4" /> Total earned</p>
        <p className="mt-1 text-[28px] font-extrabold leading-none">{inr(credited + approved + pending)}</p>
        <p className="mt-1 text-[11.5px] text-white/75">{items.length} call{items.length === 1 ? '' : 's'} with a payout</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['In wallet', credited, CheckCircle2, 'bg-emerald-50 text-emerald-700'],
          ['Approved', approved, IndianRupee, 'bg-[#e9f0fe] text-[#1456d8]'],
          ['In review', pending, Clock, 'bg-amber-50 text-amber-700'],
        ].map(([label, value, Icon, tone]) => (
          <div key={label} className="flex flex-col items-center rounded-[18px] border border-[#e6ebf3] bg-white p-2.5 text-center shadow-[0_2px_10px_rgba(15,35,80,0.04)]">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span>
            <span className="mt-1.5 text-[15px] font-bold leading-tight text-[#0b1324]">{inr(value)}</span>
            <span className="mt-0.5 text-[10.5px] font-medium text-[#5d667a]">{label}</span>
          </div>
        ))}
      </div>

      <WalletBox />

      <Section title="Monthly incentive">
        {thisMonth ? (
          <Panel className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Gift className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#0b1324]">{thisMonth.month}</p>
                <p className="text-[12px] text-[#5d667a]">{thisMonth.approvedCalls} of {thisMonth.target} approved calls · {thisMonth.rechargeDays}-day recharge</p>
              </div>
              <StatusPill status={thisMonth.status} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#edf2fa]"><div className="h-full rounded-full bg-[#1456d8]" style={{ width: `${Math.min(100, (thisMonth.approvedCalls / thisMonth.target) * 100)}%` }} /></div>
          </Panel>
        ) : <Empty icon={Gift}>No incentive progress yet this month.</Empty>}
        {(inc?.items || []).slice(1, 3).map((i) => (
          <div key={i._id} className="flex items-center justify-between rounded-[18px] border border-[#e6ebf3] bg-white px-3.5 py-2.5 text-[12.5px]">
            <span className="font-semibold text-[#0b1324]">{i.month}</span>
            <span className="text-[#5d667a]">{i.approvedCalls}/{i.target} calls</span>
            <StatusPill status={i.status} />
          </div>
        ))}
      </Section>

      <Section title="Call payouts">
        {loading && <div className="h-24 animate-pulse rounded-[18px] bg-[#e8eef8]" />}
        {!loading && items.length === 0 && <Empty icon={Wallet}>No payouts yet. They appear after a call is approved.</Empty>}
        <div className="space-y-2">
          {items.map((p) => (
            <div key={p._id} className="flex items-center gap-3 rounded-[18px] border border-[#e6ebf3] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,35,80,0.04)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e9f0fe] text-[#1456d8]"><IndianRupee className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[#0b1324]">{p.srNumber}</p>
                <p className="truncate text-[11.5px] text-[#5d667a]">{[p.brand, labelOf(JOB_TYPES, p.jobType), fmtDate(p.createdAt)].filter(Boolean).join(' · ')}</p>
                {p.cashCollected > 0 && <p className="text-[11px] text-amber-700">Cash collected {inr(p.cashCollected)}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-[15px] font-bold text-[#0b1324]">{inr(p.engineerAmount)}</p>
                <StatusPill status={payoutStatus(p)} />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </Screen>
  );
}
