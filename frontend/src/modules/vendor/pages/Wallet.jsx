import { useState } from 'react';
import { Banknote, Landmark, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { DataTable, PageShell } from '@/shared/components/PageShell';
import ResourcePage from '@/shared/components/ResourcePage';
import Tabs from '@/shared/components/Tabs';
import { api, uploadFiles } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';

const KIND = {
  job_earning: 'Job earning', cash_handover: 'Cash from engineer', cash_deposit: 'Cash deposited to platform', withdrawal: 'Withdrawal',
  withdrawal_reversal: 'Withdrawal returned', adjustment: 'Adjustment', cash_collected: 'Cash collected',
};

function Stat({ icon: Icon, label, value, tone, hint }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" /></span>
      <div><p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{label}</p><p className="text-2xl font-bold text-neutral-900">{value}</p>{hint && <p className="text-xs text-neutral-500">{hint}</p>}</div>
    </div>
  );
}

/** Balance, withdrawal request and bank details. */
function Overview({ w, reload }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState(w.bank || {});
  const [busy, setBusy] = useState('');
  const withdraw = async (e) => {
    e.preventDefault();
    setBusy('wd');
    try { await api('/wallet/withdrawals', { method: 'POST', body: { amount: Number(amount) } }); toast.success('Withdrawal requested'); setAmount(''); reload(); } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };
  const saveBank = async (e) => {
    e.preventDefault();
    setBusy('bank');
    try { await api('/wallet/bank', { method: 'PUT', body: bank }); toast.success('Bank details saved'); reload(); } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };
  const set = (k) => (e) => setBank((b) => ({ ...b, [k]: e.target.value }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Withdraw</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {w.openWithdrawal
            ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{inr(w.openWithdrawal.amount)} requested on {fmtDateTime(w.openWithdrawal.createdAt)} is waiting to be paid.</p>
            : (
              <form onSubmit={withdraw} className="space-y-3">
                <p className="text-sm text-neutral-500">Available: <b className="text-neutral-900">{inr(w.withdrawable)}</b> · minimum {inr(w.minWithdrawal)}. The platform pays it to your bank / UPI and shares the reference.</p>
                <div className="flex gap-2">
                  <Input type="number" min={w.minWithdrawal} max={w.withdrawable} step="0.01" required placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Button disabled={busy === 'wd' || w.withdrawable < w.minWithdrawal}>{busy === 'wd' ? 'Sending...' : 'Request'}</Button>
                </div>
                {w.balance < 0 && <p className="text-xs text-red-600">Your balance is negative because you hold customer cash. Deposit it to the platform (Cash tab).</p>}
              </form>
            )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Bank details for withdrawals</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveBank} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Account holder</Label><Input value={bank.accountName || ''} onChange={set('accountName')} /></div>
            <div className="space-y-1.5"><Label>Account number</Label><Input inputMode="numeric" value={bank.accountNumber || ''} onChange={set('accountNumber')} /></div>
            <div className="space-y-1.5"><Label>IFSC</Label><Input value={bank.ifsc || ''} onChange={set('ifsc')} placeholder="HDFC0001234" /></div>
            <div className="space-y-1.5"><Label>Bank name</Label><Input value={bank.bankName || ''} onChange={set('bankName')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>UPI ID (optional)</Label><Input value={bank.upi || ''} onChange={set('upi')} placeholder="name@okhdfc" /></div>
            <div className="sm:col-span-2"><Button disabled={busy === 'bank'}>{busy === 'bank' ? 'Saving...' : 'Save bank details'}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Engineers' customer cash: receive it from them, then deposit it to the platform. */
function Cash({ w, reload }) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const { data: holders, reload: reloadHolders } = useApi(`/wallet/cash/holders?v=${version}`);
  const [dep, setDep] = useState({ amount: '', method: 'bank', reference: '', proofUrl: '' });
  const [busy, setBusy] = useState(false);
  const bump = () => { setVersion((v) => v + 1); reloadHolders(); reload(); };
  const receive = async (row) => {
    if (!window.confirm(`Confirm you received ${inr(row.cashHeld)} cash from ${row.ownerName}?`)) return;
    try { const r = await api('/wallet/cash/handover', { method: 'POST', body: { engineerId: row.ownerId } }); toast.success(`${inr(r.amount)} received from ${row.ownerName}`); bump(); } catch (e) { toast.error(e.message); }
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api('/wallet/cash/deposits', { method: 'POST', body: { ...dep, amount: Number(dep.amount) } }); toast.success('Deposit reported. The platform confirms it once received.'); setDep({ amount: '', method: 'bank', reference: '', proofUrl: '' }); bump(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const engineers = (holders?.items || []).filter((r) => r.ownerType === 'engineer').map((r) => ({ ...r, id: r._id }));
  return (
    <div className="space-y-4">
      <PageShell eyebrow="Wallet" title="Cash with your engineers">
        <p className="text-sm text-neutral-500">Customer cash your engineers collected on site. Mark it received when they hand it to you; it then counts as cash your company holds.</p>
        <DataTable
          rows={engineers} empty="None of your engineers is holding customer cash"
          columns={[
            { key: 'ownerName', label: 'Engineer', render: (r) => `${r.ownerName || '—'} · ${r.ownerPhone || ''}` },
            { key: 'cashHeld', label: 'Cash held', render: (r) => <b className="text-amber-700">{inr(r.cashHeld)}</b> },
            { key: '_a', label: '', render: (r) => <Button size="sm" onClick={() => receive(r)}>Received from engineer</Button> },
          ]}
        />
      </PageShell>
      <PageShell eyebrow="Wallet" title="Deposit to the platform">
        <p className="text-sm text-neutral-500">Your company holds <b className="text-neutral-900">{inr(w.cashHeld)}</b> customer cash. Pay it to the platform account, then report it here with the reference.</p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" min="1" step="0.01" max={w.cashHeld} required value={dep.amount} onChange={(e) => setDep((d) => ({ ...d, amount: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Paid by</Label><NativeSelect value={dep.method} onChange={(e) => setDep((d) => ({ ...d, method: e.target.value }))}><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash at office</option></NativeSelect></div>
          <div className="space-y-1.5"><Label>Reference (UTR / UPI ref)</Label><Input required value={dep.reference} onChange={(e) => setDep((d) => ({ ...d, reference: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Proof (optional)</Label>
            <Input type="file" accept="image/*,.pdf" onChange={async (e) => { try { const [u] = await uploadFiles(e.target.files); setDep((d) => ({ ...d, proofUrl: u })); } catch (err) { toast.error(err.message); } }} />
          </div>
          <div className="sm:col-span-4"><Button disabled={busy || !(w.cashHeld > 0)}>{busy ? 'Sending...' : 'Report deposit'}</Button></div>
        </form>
      </PageShell>
      <ResourcePage
        eyebrow="Wallet" title="Deposit history" endpoint="/wallet/cash/deposits" refreshKey={version} searchable={false}
        columns={[
          { key: 'createdAt', label: 'Reported', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) },
          { key: 'method', label: 'Method', render: (r) => humanize(r.method) },
          { key: 'reference', label: 'Reference' },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={{ submitted: 'amber', confirmed: 'green', rejected: 'red' }[r.status]}>{r.status === 'submitted' ? 'Waiting' : humanize(r.status)}</Badge> },
          { key: 'decisionNote', label: 'Note', render: (r) => r.decisionNote || '—' },
        ]}
      />
    </div>
  );
}

const TABS = [{ value: 'overview', label: 'Overview' }, { value: 'cash', label: 'Customer cash' }, { value: 'txns', label: 'Transactions' }, { value: 'withdrawals', label: 'Withdrawals' }];

export default function Wallet() {
  const { data: w, reload } = useApi('/wallet/me');
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-4">
      <PageShell eyebrow="Finance" title="Wallet">
        {w && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={WalletIcon} label="Balance" value={inr(w.balance)} tone={w.balance < 0 ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'} hint="Approved job earnings minus cash you hold" />
            <Stat icon={Banknote} label="Customer cash held" value={inr(w.cashHeld)} tone="bg-amber-50 text-amber-700" hint="To deposit to the platform" />
            <Stat icon={Landmark} label="Withdrawable" value={inr(w.withdrawable)} tone="bg-emerald-50 text-emerald-700" hint={`Minimum ${inr(w.minWithdrawal)}`} />
          </div>
        )}
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </PageShell>
      {w && tab === 'overview' && <div className="px-4 lg:px-6"><Overview key={JSON.stringify(w.bank || {})} w={w} reload={reload} /></div>}
      {w && tab === 'cash' && <Cash w={w} reload={reload} />}
      {tab === 'txns' && (
        <ResourcePage
          eyebrow="Wallet" title="Transactions" endpoint="/wallet/txns"
          filterKey="kind" filterLabel="All" filterOptions={Object.entries(KIND).map(([value, label]) => ({ value, label }))}
          columns={[
            { key: 'createdAt', label: 'When', render: (r) => fmtDateTime(r.createdAt) },
            { key: 'kind', label: 'What', render: (r) => KIND[r.kind] || humanize(r.kind) },
            { key: 'srNumber', label: 'SR', render: (r) => r.srNumber || '—' },
            { key: 'amount', label: 'Amount', render: (r) => <span className={cn('font-semibold', r.direction === 'credit' ? 'text-emerald-700' : 'text-red-600')}>{r.direction === 'credit' ? '+' : '−'}{inr(r.amount)}</span>, csv: (r) => (r.direction === 'credit' ? r.amount : -r.amount) },
            { key: 'balanceAfter', label: 'Balance after', render: (r) => inr(r.balanceAfter) },
            { key: 'note', label: 'Note', render: (r) => r.note || '—' },
          ]}
        />
      )}
      {tab === 'withdrawals' && (
        <ResourcePage
          eyebrow="Wallet" title="Withdrawals" endpoint="/wallet/withdrawals" searchable={false}
          columns={[
            { key: 'createdAt', label: 'Requested', render: (r) => fmtDateTime(r.createdAt) },
            { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={{ requested: 'amber', paid: 'green', rejected: 'red' }[r.status]}>{r.status === 'requested' ? 'Waiting' : humanize(r.status)}</Badge> },
            { key: 'reference', label: 'Reference / note', render: (r) => r.reference || r.note || '—' },
          ]}
        />
      )}
    </div>
  );
}
