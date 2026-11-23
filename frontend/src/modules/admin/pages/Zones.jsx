import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { ConfirmDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import ZoneMap from '@/shared/components/ZoneMap';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';

const EMPTY = { name: '', city: '', state: '', maxRadiusKm: '', coordinates: [] };

function ZoneDialog({ zone, others, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = zone !== null;
  // re-seed the form whenever a different zone (or "new") is opened
  useEffect(() => { setF(open ? { ...EMPTY, ...zone, maxRadiusKm: zone?.maxRadiusKm ?? '' } : null); }, [zone, open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (f.coordinates.length < 3) return toast.error('Draw the zone on the map — at least 3 points');
    setBusy(true);
    try {
      const body = { name: f.name, city: f.city, state: f.state, coordinates: f.coordinates, maxRadiusKm: f.maxRadiusKm === '' ? null : Number(f.maxRadiusKm) };
      await api(zone?._id ? `/zones/${zone._id}` : '/zones', { method: zone?._id ? 'PATCH' : 'POST', body });
      toast.success('Zone saved');
      onSaved();
      onClose();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{zone?._id ? 'Edit zone' : 'New service zone'}</DialogTitle></DialogHeader>
        {f && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Zone name</Label><Input required value={f.name} onChange={set('name')} placeholder="e.g. Indore Central" /></div>
              <div className="space-y-1.5"><Label>City</Label><Input value={f.city || ''} onChange={set('city')} /></div>
              <div className="space-y-1.5"><Label>State</Label><Input value={f.state || ''} onChange={set('state')} /></div>
              <div className="space-y-1.5"><Label>Max dispatch radius (km, optional)</Label><Input type="number" min="0" value={f.maxRadiusKm} onChange={set('maxRadiusKm')} placeholder="Uses the global radius when empty" /></div>
            </div>
            <ZoneMap coordinates={f.coordinates} others={others.filter((z) => z._id !== zone?._id)} onChange={(coordinates) => setF((s) => ({ ...s, coordinates }))} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={busy}>{busy ? 'Saving...' : 'Save zone'}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Zones() {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // null = closed, {} = new, zone = edit
  const [removing, setRemoving] = useState(null);
  const [version, setVersion] = useState(0);
  const { data: zoneData, reload } = useApi('/zones');
  const bump = () => { setVersion((v) => v + 1); reload(); };

  const toggle = async (z) => {
    try { await api(`/zones/${z._id}`, { method: 'PATCH', body: { active: !z.active } }); bump(); } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <ResourcePage
        eyebrow="Operations"
        title="Service Zones"
        endpoint="/zones"
        searchable={false}
        refreshKey={version}
        extraActions={<Button onClick={() => setEditing({})}><Plus className="h-4 w-4" /> New zone</Button>}
        header={<ZonesHint />}
        columns={[
          { key: 'name', label: 'Zone' },
          { key: 'city', label: 'City' },
          { key: 'state', label: 'State' },
          { key: 'coordinates', label: 'Points', render: (r) => r.coordinates.length, csv: (r) => r.coordinates.length },
          { key: 'maxRadiusKm', label: 'Radius (km)', render: (r) => r.maxRadiusKm ?? 'Global' },
          { key: 'engineers', label: 'Engineers' },
          { key: 'companies', label: 'Companies' },
          { key: 'active', label: 'Status', render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
        ]}
        rowActions={({ row }) => (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(row)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => toggle(row)}>{row.active ? 'Deactivate' : 'Activate'}</Button>
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRemoving(row)}>Delete</Button>
          </>
        )}
      />
      <ZoneDialog zone={editing} others={zoneData?.items || []} onClose={() => setEditing(null)} onSaved={bump} />
      <ConfirmDialog
        open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Delete ${removing?.name}?`} destructive confirmLabel="Delete zone"
        description="Engineers and companies lose this zone from their coverage. Existing service requests keep their zone name."
        onConfirm={async () => { await api(`/zones/${removing._id}`, { method: 'DELETE' }); toast.success('Zone deleted'); bump(); }}
      />
    </>
  );
}

const ZonesHint = () => (
  <p className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
    Draw each area you serve. Customers can only save addresses and raise requests inside an active zone (switch this off in Settings), and dispatch prefers engineers and companies who cover the request's zone.
  </p>
);
