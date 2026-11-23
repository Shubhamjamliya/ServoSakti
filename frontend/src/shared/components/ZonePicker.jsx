import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';

/**
 * Checkbox list of the admin's service zones. Used by engineers and service companies to say where they work;
 * dispatch then matches jobs to people by zone. `onSave(zoneIds)` persists the choice.
 */
export default function ZonePicker({ selected = [], onSave, hint }) {
  const toast = useToast();
  const { data } = useApi('/zones/public');
  const [ids, setIds] = useState(selected.map(String));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setIds(selected.map(String)); }, [selected.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    setBusy(true);
    try { await onSave(ids); toast.success('Service zones saved'); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const zones = data?.items || [];
  if (data && !zones.length) return <p className="text-sm text-neutral-500">No service zones have been created yet. The admin adds them under Service Zones.</p>;
  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {zones.map((z) => (
          <label key={z._id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <input type="checkbox" checked={ids.includes(z._id)} onChange={() => toggle(z._id)} />
            <span>{z.name}{z.city ? <span className="text-neutral-500"> · {z.city}</span> : null}</span>
          </label>
        ))}
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save zones'}</Button>
    </div>
  );
}

export const saveCoverage = (zoneIds) => api('/zones/coverage', { method: 'PUT', body: { zoneIds } });
