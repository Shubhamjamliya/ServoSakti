import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { KeyValue, Panel, Screen } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { loginPath } from '@/shared/constants/authRoles';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { data: e, reload } = useApi('/engineers/me');

  const toggle = async () => {
    try { await api('/engineers/me', { method: 'PATCH', body: { available: !e.available } }); toast.success(e.available ? 'You are now off duty' : 'You are available for calls'); reload(); }
    catch (err) { toast.error(err.message); }
  };

  if (!e) return <p className="text-sm text-neutral-500">Loading...</p>;
  return (
    <Screen title="Profile" subtitle={e.engineerType === 'independent' ? 'Independent engineer' : 'Company engineer'}>
      <Panel className="flex items-center justify-between">
        <div><p className="font-semibold">{e.available ? 'Available for calls' : 'Off duty'}</p><p className="text-sm text-neutral-500">Off-duty engineers are skipped by dispatch.</p></div>
        <Button variant={e.available ? 'outline' : 'default'} onClick={toggle}>{e.available ? 'Go off duty' : 'Go available'}</Button>
      </Panel>
      <Panel>
        <KeyValue label="Name">{e.name}</KeyValue>
        <KeyValue label="Phone">{e.phone}</KeyValue>
        <KeyValue label="City">{e.city}</KeyValue>
        <KeyValue label="Skills">{(e.skills || []).join(', ')}</KeyValue>
        <KeyValue label="Territories">{(e.serviceTerritories || []).join(', ')}</KeyValue>
        <KeyValue label="Brand certifications">{(e.certifications || []).map((c) => c.brand).join(', ')}</KeyValue>
        <KeyValue label="Profile status"><Badge>{humanize(e.status)}</Badge></KeyValue>
      </Panel>
      <Button variant="outline" className="w-full text-red-600" onClick={() => { const to = loginPath(user?.role); logout(); nav(to); }}><LogOut className="h-4 w-4" /> Logout</Button>
    </Screen>
  );
}
