import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Textarea, Input, NativeSelect } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize, labelOf, JOB_TYPES, WARRANTY_TYPES } from '@/shared/lib/format';

/** Asks for a (optionally required) text reason/note, then calls onConfirm(text). */
export function PromptDialog({ open, onOpenChange, title, description, label = 'Note', required = false, confirmLabel = 'Confirm', destructive = false, onConfirm, inputProps }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(value);
      setValue('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prompt-input">{label}</Label>
            {inputProps ? <Input id="prompt-input" required={required} value={value} onChange={(e) => setValue(e.target.value)} {...inputProps} /> : <Textarea id="prompt-input" required={required} value={value} onChange={(e) => setValue(e.target.value)} />}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy}>{busy ? 'Working...' : confirmLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 border-b border-neutral-100 py-1.5 text-sm last:border-0">
    <span className="text-neutral-500">{label}</span>
    <span className="text-right font-medium text-neutral-800">{children || '—'}</span>
  </div>
);

/** Read-only view of a service request: details, dispatch history and the engineer's field report. */
export function SrDetailDialog({ srId, onClose }) {
  const { data: sr, loading, error } = useApi(srId ? `/service-requests/${srId}` : null);
  const r = sr?.report;
  return (
    <Dialog open={!!srId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{sr ? `${sr.srNumber} · ${sr.brand || ''} ${sr.model || ''}` : 'Service request'}</DialogTitle></DialogHeader>
        {loading && <p className="text-sm text-neutral-500">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {sr && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge>{humanize(sr.status)}</Badge>
              <Badge>{sr.priority}</Badge>
              <Badge tone={sr.warranty === 'warranty' ? 'green' : 'gray'}>{labelOf(WARRANTY_TYPES, sr.warranty)}</Badge>
              {sr.repeatOf && <Badge tone="amber">Repeat call</Badge>}
            </div>
            <div>
              <Row label="Customer">{sr.customerName}{sr.customerPhone ? ` · ${sr.customerPhone}` : ''}</Row>
              <Row label="Serial number">{sr.serialNumber}</Row>
              <Row label="Job type">{labelOf(JOB_TYPES, sr.jobType)}</Row>
              <Row label="City / address">{[sr.city, sr.address].filter(Boolean).join(' · ')}</Row>
              <Row label="Issue">{sr.issue}</Row>
              <Row label="OEM">{sr.oemName}</Row>
              <Row label="Service company">{sr.vendorName}</Row>
              <Row label="Engineer">{sr.engineerName}</Row>
              <Row label="Call type">{humanize(sr.origin)}</Row>
              <Row label="TAT due">{fmtDateTime(sr.tatDueAt)}</Row>
              <Row label="Created">{fmtDateTime(sr.createdAt)}</Row>
            </div>

            {sr.dispatchLogs?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">Dispatch history</h4>
                <ol className="space-y-1.5 text-sm">
                  {sr.dispatchLogs.map((l) => (
                    <li key={l._id} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                      <span>P{l.priority} · {l.candidateName}{l.reason ? <span className="text-neutral-500"> — {l.reason}</span> : null}</span>
                      <Badge>{humanize(l.outcome)}</Badge>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {r && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">Field report (eFSR)</h4>
                <Row label="GPS check-in">{r.checkIn?.at ? `${fmtDateTime(r.checkIn.at)}${r.checkIn.distanceKm != null ? ` · ${r.checkIn.distanceKm} km` : ''}` : null}</Row>
                <Row label="Serial (verified)">{r.serialNumber}</Row>
                <Row label="CRM / SR ref">{r.crmRef}</Row>
                <Row label="Work performed">{r.workDone}</Row>
                <Row label="Remarks">{r.remarks}</Row>
                <Row label="Customer confirmation">{sr.otp?.verified ? 'OTP verified' : r.customerSignature ? 'Signature' : null}</Row>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...(r.beforePhotos || []), ...(r.afterPhotos || [])].map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-lg border px-2 py-1 text-xs text-primary hover:bg-muted">{u.split('/').pop()}</a>
                  ))}
                </div>
                {r.review?.status && r.review.status !== 'pending' && <Row label="Review">{humanize(r.review.status)}{r.review.note ? ` — ${r.review.note}` : ''}</Row>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Approve / reject an engineer's submitted eFSR. */
export function ReviewDialog({ srId, onClose, onDone }) {
  const { data: sr } = useApi(srId ? `/service-requests/${srId}` : null);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const r = sr?.report;

  const decide = async (decision) => {
    if (decision === 'rejected' && !note.trim()) return toast.error('Add a note so the engineer knows what to fix');
    setBusy(true);
    try {
      await api(`/field/${srId}/review`, { method: 'PATCH', body: { decision, note } });
      toast.success(decision === 'approved' ? 'Call approved — payout created' : 'Sent back to the engineer');
      setNote('');
      onClose();
      onDone?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!srId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Review {sr?.srNumber}</DialogTitle>
          <DialogDescription>Check the evidence before approving. Approval makes the call eligible for billing, incentive and payout.</DialogDescription>
        </DialogHeader>
        {r ? (
          <div className="space-y-4">
            <div>
              <Row label="Engineer">{sr.engineerName}</Row>
              <Row label="GPS check-in">{r.checkIn?.at ? `${fmtDateTime(r.checkIn.at)}${r.checkIn.distanceKm != null ? ` · ${r.checkIn.distanceKm} km` : ''}` : null}</Row>
              <Row label="Serial number">{r.serialNumber}</Row>
              <Row label="Work performed">{r.workDone}</Row>
              <Row label="Customer confirmation">{sr.otp?.verified ? 'OTP verified' : r.customerSignature ? 'Signature' : null}</Row>
              <Row label="Photos">{`${r.beforePhotos?.length || 0} before / ${r.afterPhotos?.length || 0} after`}</Row>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review-note">Note</Label>
              <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required when rejecting" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => decide('rejected')}>Reject</Button>
              <Button disabled={busy} onClick={() => decide('approved')}>Approve</Button>
            </div>
          </div>
        ) : <p className="text-sm text-neutral-500">{sr ? 'The engineer has not submitted a field report for this call yet.' : 'Loading report...'}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Pick an approved engineer to assign (admin: any engineer, vendor owner: their own). */
export function AssignDialog({ srId, onClose, onDone }) {
  const { data } = useApi(srId ? '/engineers?status=approved&limit=200' : null);
  const toast = useToast();
  const [engineerId, setEngineerId] = useState('');
  const [reason, setReason] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/dispatch/${srId}/assign`, { method: 'POST', body: { engineerId, reason } });
      toast.success('Engineer assigned');
      onClose();
      onDone?.();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <Dialog open={!!srId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign engineer</DialogTitle>
          <DialogDescription>This overrides any pending offer and is recorded in the dispatch log.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="eng">Engineer</Label>
            <NativeSelect id="eng" required value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
              <option value="" disabled>Select engineer...</option>
              {data?.items?.map((e) => <option key={e._id} value={e._id}>{e.name} · {e.city || '—'} · {e.companyName || 'Independent'}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="why">Reason (optional)</Label>
            <Input id="why" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Assign</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Vendor hands a call to an authorized outside-location partner company. */
export function OutsourceDialog({ srId, onClose, onDone }) {
  const { data, loading } = useApi(srId ? `/companies/partners?srId=${srId}` : null);
  const toast = useToast();
  const [companyId, setCompanyId] = useState('');
  const [reason, setReason] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/dispatch/${srId}/outsource`, { method: 'POST', body: { companyId, reason } });
      toast.success('Request sent to partner company');
      onClose();
      onDone?.();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <Dialog open={!!srId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request outside-location partner</DialogTitle>
          <DialogDescription>Only companies authorized by the OEM for this brand are listed. You stay accountable for the call until it is completed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="partner">Partner company</Label>
            <NativeSelect id="partner" required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="" disabled>{loading ? 'Loading...' : data?.items?.length ? 'Select partner...' : 'No authorized partner available'}</option>
              {data?.items?.map((p) => <option key={p._id} value={p._id}>{p.legalName} · {p.cities?.join(', ') || p.city}{p.backup ? ' · backup' : ''}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="why2">Reason (optional)</Label>
            <Input id="why2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No engineer in this city" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!companyId}>Send request</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Partner vendor accepts an incoming offer by choosing one of its own engineers. */
export function AcceptOfferDialog({ offer, onClose, onDone }) {
  const { data } = useApi(offer ? '/engineers?status=approved&limit=200' : null);
  const toast = useToast();
  const [engineerId, setEngineerId] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/dispatch/offers/${offer._id}/accept`, { method: 'POST', body: { engineerId } });
      toast.success('Call accepted and assigned');
      onClose();
      onDone?.();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <Dialog open={!!offer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept {offer?.srNumber}</DialogTitle>
          <DialogDescription>Choose which of your engineers will take this call.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <NativeSelect required value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
            <option value="" disabled>Select engineer...</option>
            {data?.items?.map((e) => <option key={e._id} value={e._id}>{e.name} · {e.city || '—'} · {e.dayStatus}</option>)}
          </NativeSelect>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!engineerId}>Accept call</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
