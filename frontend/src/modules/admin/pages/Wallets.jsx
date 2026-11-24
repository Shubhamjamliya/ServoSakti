import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { DataTable, PageShell } from '@/shared/components/PageShell';
import ResourcePage from '@/shared/components/ResourcePage';
import Tabs from '@/shared/components/Tabs';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';

const KIND = {
  job_earning: 'Job earning', cash_collected: 'Cash collected on site', cash_handover: 'Cash handed over', cash_deposit: 'Cash deposited',
  withdrawal: 'Withdrawal', withdrawal_reversal: 'Withdrawal returned', refund: 'Refund', wallet_payment: 'Paid from wallet', adjustment: 'Adjustment',
};
const TYPE_LABEL = { engineer: 'Engineer', vendor: 'Service company', customer: 'Customer' };
const signed = (t) => <span className={cn('font-semibold', t.direction === 'credit' ? 'text-emerald-700' : 'text-red-600')}>{t.direction === 'credit' ? '+' : '−'}{inr(t.amount)}</span>;

/** Credit or debit a wallet with a reason. The request id makes a double submit harmless. */
function AdjustDialog({ target, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ direction: 'credit', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const requestId = useMemo(() => crypto.randomUUID(), [target]); // one id per opened dialog
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/wallet/adjust', { method: 'POST', body: { ownerType: target.ownerType, ownerId: target.ownerId, direction: f.direction, amount: Number(f.amount), note: f.note, requestId } });
      toast.success('Wallet adjusted');
      setF({ direction: 'credit', amount: '', note: '' });
      onClose(); onDone();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust wallet · {target?.ownerName}</DialogTitle>
          <DialogDescription>Current balance {inr(target?.balance)}. Every adjustment is recorded in the ledger with your reason.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5"><Label>Type</Label>
            <NativeSelect value={f.direction} onChange={(e) => setF((s) => ({ ...s, direction: e.target.value }))}>
              <option value="credit">Credit (add money)</option><option value="debit">Debit (take money)</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" min="1" step="0.01" required value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea required value={f.note} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} placeholder="e.g. Goodwill for delayed visit SR-1042" /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WalletList({ ownerType, onAdjust, version }) {
  return (
    <ResourcePage
      eyebrow="Finance" title={`${TYPE_LABEL[ownerType]} wallets`} endpoint="/wallet" params={{ ownerType }} refreshKey={version} searchable={false}
      columns={[
        { key: 'ownerName', label: 'Name', render: (r) => `${r.ownerName || '—'}${r.ownerPhone ? ` · ${r.ownerPhone}` : ''}` },
        { key: 'balance', label: 'Balance', render: (r) => <span className={cn('font-bold', r.balance < 0 ? 'text-red-600' : 'text-neutral-900')}>{inr(r.balance)}</span> },
        ...(ownerType === 'customer' ? [] : [{ key: 'cashHeld', label: 'Customer cash held', render: (r) => (r.cashHeld ? <span className="font-semibold text-amber-700">{inr(r.cashHeld)}</span> : '—') }]),
        { key: 'updatedAt', label: 'Last change', render: (r) => fmtDateTime(r.updatedAt) },
      ]}
      rowActions={({ row }) => <Button size="sm" variant="outline" onClick={() => onAdjust(row)}>Adjust</Button>}
    />
  );
}

function Ledger() {
  return (
    <ResourcePage
      eyebrow="Finance" title="Wallet transactions" endpoint="/wallet/txns"
      filterKey="kind" filterLabel="All kinds" filterOptions={Object.entries(KIND).map(([value, label]) => ({ value, label }))}
      columns={[
        { key: 'createdAt', label: 'When', render: (r) => fmtDateTime(r.createdAt) },
        { key: 'ownerName', label: 'Wallet', render: (r) => `${r.ownerName || '—'} (${TYPE_LABEL[r.ownerType]})` },
        { key: 'kind', label: 'What', render: (r) => KIND[r.kind] || humanize(r.kind), csv: (r) => KIND[r.kind] },
        { key: 'srNumber', label: 'SR', render: (r) => r.srNumber || '—' },
        { key: 'amount', label: 'Amount', render: signed, csv: (r) => (r.direction === 'credit' ? r.amount : -r.amount) },
        { key: 'balanceAfter', label: 'Balance after', render: (r) => inr(r.balanceAfter) },
        { key: 'cashHeldAfter', label: 'Cash held after', render: (r) => (r.cashDelta ? inr(r.cashHeldAfter) : '—') },
        { key: 'note', label: 'Note', render: (r) => r.note || '—' },
      ]}
    />
  );
}

/** Who holds customer cash, deposits to confirm, and cash received at the office. */
function Cash() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const { data: holders, reload } = useApi(`/wallet/cash/holders?v=${version}`);
  const bump = () => { setVersion((v) => v + 1); reload(); };
  const receive = async (row) => {
    const ref = window.prompt(`Cash received from ${row.ownerName}: ${inr(row.cashHeld)}. Receipt / reference?`, 'Received at office');
    if (ref === null) return;
    try { await api('/wallet/cash/receive', { method: 'POST', body: { ownerType: row.ownerType, ownerId: row.ownerId, reference: ref } }); toast.success('Cash recorded'); bump(); } catch (e) { toast.error(e.message); }
  };
  const decide = async (row, decision) => {
    const note = decision === 'reject' ? window.prompt('Reason for rejecting this deposit') : '';
    if (note === null) return;
    try { await api(`/wallet/cash/deposits/${row._id}`, { method: 'PATCH', body: { decision, note } }); toast.success(decision === 'confirm' ? 'Deposit confirmed' : 'Deposit rejected'); bump(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="space-y-4">
      <PageShell eyebrow="Finance" title="Customer cash held">
        <p className="text-sm text-neutral-500">Cash engineers collected on site. Company engineers hand it to their service company, which deposits it; independent engineers deposit directly. Engineers above the cash limit (Settings) get no new calls.</p>
        <DataTable
          rows={(holders?.items || []).map((r) => ({ ...r, id: r._id }))}
          empty="Nobody is holding customer cash"
          columns={[
            { key: 'ownerName', label: 'Name', render: (r) => `${r.ownerName || '—'}${r.ownerPhone ? ` · ${r.ownerPhone}` : ''}` },
            { key: 'ownerType', label: 'Type', render: (r) => (r.ownerType === 'vendor' ? 'Service company' : r.independent ? 'Independent engineer' : 'Company engineer') },
            { key: 'cashHeld', label: 'Cash held', render: (r) => <b className="text-amber-700">{inr(r.cashHeld)}</b> },
            { key: '_a', label: '', render: (r) => <Button size="sm" variant="outline" onClick={() => receive(r)}>Cash received</Button> },
          ]}
        />
      </PageShell>
      <ResourcePage
        eyebrow="Finance" title="Cash deposits" endpoint="/wallet/cash/deposits" refreshKey={version}
        filterKey="status" filterLabel="All deposits" filterOptions={[{ value: 'submitted', label: 'To confirm' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'rejected', label: 'Rejected' }]}
        columns={[
          { key: 'createdAt', label: 'Reported', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'ownerName', label: 'From', render: (r) => `${r.ownerName} (${TYPE_LABEL[r.ownerType]})` },
          { key: 'amount', label: 'Amount', render: (r) => <b>{inr(r.amount)}</b> },
          { key: 'method', label: 'Method', render: (r) => humanize(r.method) },
          { key: 'reference', label: 'Reference' },
          { key: 'proofUrl', label: 'Proof', render: (r) => (r.proofUrl ? <a className="text-primary underline" href={r.proofUrl} target="_blank" rel="noreferrer">Open</a> : '—') },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={{ submitted: 'amber', confirmed: 'green', rejected: 'red' }[r.status]}>{r.status === 'submitted' ? 'To confirm' : humanize(r.status)}</Badge> },
        ]}
        rowActions={({ row }) => row.status === 'submitted' && (
          <>
            <Button size="sm" onClick={() => decide(row, 'confirm')}>Confirm received</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => decide(row, 'reject')}>Reject</Button>
          </>
        )}
      />
    </div>
  );
}

const TABS = [
  { value: 'engineer', label: 'Engineers' }, { value: 'vendor', label: 'Service companies' }, { value: 'customer', label: 'Customers' },
  { value: 'cash', label: 'Cash & deposits' }, { value: 'ledger', label: 'All transactions' },
];

export default function Wallets() {
  const [tab, setTab] = useState('engineer');
  const [adjust, setAdjust] = useState(null);
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-4">
      <div className="px-4 pt-4 lg:px-6"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
      {['engineer', 'vendor', 'customer'].includes(tab) && <WalletList key={tab} ownerType={tab} onAdjust={setAdjust} version={version} />}
      {tab === 'cash' && <Cash />}
      {tab === 'ledger' && <Ledger />}
      <AdjustDialog target={adjust} onClose={() => setAdjust(null)} onDone={() => setVersion((v) => v + 1)} />
    </div>
  );
}
