import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { Empty, ErrorNote, Field, Panel, RowLink, Screen, StatusPill } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, PRIORITIES, fmtDate } from '@/shared/lib/format';

export default function ServiceRequests() {
  const toast = useToast();
  const { data, reload } = useApi('/service-requests?limit=100');
  const { data: passports } = useApi('/products/passports?limit=100');
  const { data: me } = useApi('/customers/me');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ passportId: '', jobType: 'breakdown', priority: 'Medium', city: '', address: '', issue: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const saved = me?.addresses?.[0];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/service-requests', { method: 'POST', body: { ...f, city: f.city || saved?.city, address: f.address || saved?.line } });
      toast.success('Service request raised');
      setOpen(false);
      setF((s) => ({ ...s, issue: '' }));
      reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (open) {
    return (
      <Screen title="New service request" subtitle="Pick the product that needs service">
        <form onSubmit={submit} className="space-y-3">
          <Panel className="space-y-3">
            <Field label="Product">
              <NativeSelect required value={f.passportId} onChange={set('passportId')}>
                <option value="" disabled>{passports?.items?.length ? 'Select product...' : 'Add a product first'}</option>
                {passports?.items?.map((p) => <option key={p._id} value={p._id}>{p.brand} {p.model} · {p.serialNumber} ({p.warrantyStatus})</option>)}
              </NativeSelect>
            </Field>
            <Field label="Service type"><NativeSelect value={f.jobType} onChange={set('jobType')}>{JOB_TYPES.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</NativeSelect></Field>
            <Field label="Priority"><NativeSelect value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</NativeSelect></Field>
            <Field label="City"><Input value={f.city} onChange={set('city')} placeholder={saved?.city || 'City'} required={!saved?.city} /></Field>
            <Field label="Service address"><Input value={f.address} onChange={set('address')} placeholder={saved?.line || 'Address'} /></Field>
            <Field label="What is the problem?"><Textarea value={f.issue} onChange={set('issue')} required /></Field>
          </Panel>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button><Button className="flex-1" disabled={busy}>{busy ? 'Submitting...' : 'Submit request'}</Button></div>
        </form>
      </Screen>
    );
  }

  return (
    <Screen title="Service requests" action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New</Button>}>
      <p className="text-sm text-neutral-500">Prefer to describe it in your own words? <Link className="text-primary underline" to="/customer/complaints">Use the AI complaint assistant</Link>.</p>
      {!data?.items?.length && <Empty>No service requests yet.</Empty>}
      <div className="space-y-2">
        {(data?.items || []).map((r) => (
          <RowLink key={r._id} to="/customer/tracking" title={`${r.srNumber} · ${[r.brand, r.model].filter(Boolean).join(' ')}`} meta={`${fmtDate(r.createdAt)} · ${r.city || ''}`} right={<StatusPill status={r.status} />} />
        ))}
      </div>
    </Screen>
  );
}
