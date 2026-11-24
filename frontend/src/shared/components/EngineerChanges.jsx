import { useState } from 'react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Textarea } from '@/shared/components/ui/input';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime } from '@/shared/lib/format';

const LABEL = { name: 'Name', city: 'Base city', certifications: 'Brand certifications' };
const show = (k, v) => (k === 'certifications' ? (v || []).map((c) => c.brand).join(', ') : v) || '—';

/** "Change requested" tag for engineer tables (admin and service company). */
export const ChangesBadge = ({ row }) => (row.pendingChanges ? <Badge tone="amber">Change requested</Badge> : null);

/**
 * Shows an engineer's requested profile change next to the current value, with approve / reject.
 * Used by the service company (its own engineers) and the admin (independent engineers, or anyone).
 */
export function ChangesDialog({ engineer, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = engineer?.pendingChanges || {};
  const fields = Object.keys(LABEL).filter((k) => p[k] !== undefined);

  const decide = async (decision) => {
    if (decision === 'reject' && !note.trim()) { toast.error('Add a note so the engineer knows why'); return; }
    setBusy(true);
    try {
      await api(`/engineers/${engineer._id}/changes`, { method: 'PATCH', body: { decision, note } });
      toast.success(decision === 'approve' ? 'Profile updated' : 'Change rejected');
      setNote('');
      onClose();
      onDone?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!engineer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{engineer?.name} · profile change</DialogTitle>
          <DialogDescription>Requested {fmtDateTime(p.requestedAt)}. These details decide which calls the engineer is offered, so they need your approval.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border border-neutral-200 text-sm">
          <div className="grid grid-cols-3 bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"><span>Field</span><span>Now</span><span>Requested</span></div>
          {fields.map((k) => (
            <div key={k} className="grid grid-cols-3 gap-2 border-t border-neutral-100 px-3 py-2">
              <span className="text-neutral-500">{LABEL[k]}</span>
              <span>{show(k, engineer[k])}</span>
              <span className="font-semibold text-neutral-900">{show(k, p[k])}</span>
            </div>
          ))}
        </div>
        {p.certifications?.some((c) => c.docUrl) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {p.certifications.filter((c) => c.docUrl).map((c) => <a key={c.brand} href={c.docUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-2 py-1 text-primary">{c.brand} certificate</a>)}
          </div>
        )}
        {p.note && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">Engineer&apos;s note: {p.note}</p>}
        <Textarea placeholder="Note to the engineer (required when rejecting)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="text-red-600" disabled={busy} onClick={() => decide('reject')}>Reject</Button>
          <Button disabled={busy} onClick={() => decide('approve')}>Approve change</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
