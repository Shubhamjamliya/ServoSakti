import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Empty, Field, KeyValue, Panel, Screen, Section } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { loginPath } from '@/shared/constants/authRoles';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { data: me, reload } = useApi('/customers/me');
  const [a, setA] = useState({ label: '', line: '', city: '' });

  const save = async (addresses) => {
    try { await api('/customers/me', { method: 'PATCH', body: { addresses } }); reload(); toast.success('Addresses updated'); }
    catch (e) { toast.error(e.message); }
  };
  const add = (e) => { e.preventDefault(); save([...me.addresses, a]); setA({ label: '', line: '', city: '' }); };

  if (!me) return <p className="text-sm text-neutral-500">Loading...</p>;
  return (
    <Screen title="Profile">
      <Panel><KeyValue label="Name">{me.name}</KeyValue><KeyValue label="Phone">{me.phone}</KeyValue></Panel>

      <Section title="Service addresses">
        {!me.addresses.length && <Empty>No saved addresses.</Empty>}
        {me.addresses.map((x, i) => (
          <Panel key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 text-neutral-400" /><div><p className="font-medium">{x.label || 'Address'}</p><p className="text-neutral-500">{x.line}, {x.city}</p></div></div>
            <button aria-label="Remove address" onClick={() => save(me.addresses.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-red-500" /></button>
          </Panel>
        ))}
        <form onSubmit={add}>
          <Panel className="space-y-3">
            <Field label="Label"><Input value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} placeholder="Home / Plant" /></Field>
            <Field label="Address"><Input value={a.line} onChange={(e) => setA({ ...a, line: e.target.value })} required /></Field>
            <Field label="City"><Input value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} required /></Field>
            <Button className="w-full" variant="outline">Add address</Button>
          </Panel>
        </form>
      </Section>

      <Button variant="outline" className="w-full text-red-600" onClick={() => { const to = loginPath(user?.role); logout(); nav(to); }}><LogOut className="h-4 w-4" /> Logout</Button>
    </Screen>
  );
}
