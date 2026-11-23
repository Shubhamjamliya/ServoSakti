import { directionsUrl } from '@/shared/lib/googleMaps';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { ErrorNote, Field, KeyValue, Panel, Screen, Section, StatusPill } from '@/shared/components/Mobile';
import BillView, { CoverageBadge } from '@/shared/components/BillView';
import { api, uploadFiles } from '@/shared/lib/api';
import { getPosition } from '@/shared/lib/geo';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, fmtDateTime, humanize } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const parseReadings = (text) =>
  Object.fromEntries(String(text || '').split('\n').map((l) => l.split(':').map((s) => s.trim())).filter(([k, v]) => k && v));
const readingsText = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join('\n');

function PhotoPicker({ label, urls, onChange }) {
  const ref = useRef(null);
  const toast = useToast();
  const add = async (e) => {
    try { onChange([...urls, ...(await uploadFiles(e.target.files))]); } catch (err) { toast.error(err.message); } finally { e.target.value = ''; }
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-lg border bg-muted px-2 py-1 text-xs">{u.split('/').pop().slice(-14)}</a>)}
        <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={add} />
        <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}><Camera className="h-4 w-4" /> Add photo</Button>
      </div>
    </Field>
  );
}

/**
 * On-site pricing steps. The engineer only reports facts (product type, service needed, damage, parts used);
 * the server prices them. Increases go to the customer for approval, decreases apply at once.
 */
function OnSite({ sr, reload }) {
  const toast = useToast();
  const { data: subtypes } = useApi('/catalog/subtypes?limit=200');
  const { data: partList } = useApi(sr.subtypeId ? `/catalog/parts?limit=300&subtype=${sr.subtypeId}` : '/catalog/parts?limit=300');
  const [v, setV] = useState({ subtypeId: sr.subtypeId || '', jobType: sr.jobType, serialNumber: sr.verification?.serialNumber || sr.serialNumber || '', nameplate: sr.verification?.nameplatePhoto ? [sr.verification.nameplatePhoto] : [], damage: !!sr.damage, damageNote: '', damagePhotos: [] });
  const [parts, setParts] = useState(() => Object.fromEntries((sr.parts || []).map((p) => [p.partId, p.qty])));
  const [repair, setRepair] = useState(sr.repair || sr.jobType === 'breakdown');
  const [busy, setBusy] = useState('');
  const verified = !!sr.verification?.nameplatePhoto;
  const quote = sr.quote?.status === 'pending' ? sr.quote : null;

  const run = async (name, fn, ok) => {
    setBusy(name);
    try {
      const r = await fn();
      toast.success(r?.applied === false ? 'Revised price sent to the customer for approval' : ok);
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const verify = () => run('verify', () => api(`/field/${sr._id}/verify-product`, {
    method: 'POST',
    body: { nameplatePhoto: v.nameplate[0], serialNumber: v.serialNumber, subtypeId: v.subtypeId || undefined, jobType: v.jobType, damage: v.damage, damageNote: v.damageNote, damagePhotos: v.damagePhotos },
  }), 'Product verified');
  const saveParts = () => run('parts', () => api(`/field/${sr._id}/parts`, { method: 'PUT', body: { parts: Object.entries(parts).filter(([, q]) => q > 0).map(([partId, qty]) => ({ partId, qty })), repair } }), 'Parts saved');
  const collect = () => {
    if (window.confirm(`Confirm you collected ₹${sr.bill.due} in cash from the customer?`)) run('cash', () => api(`/field/${sr._id}/collect-cash`, { method: 'POST', body: { amount: sr.bill.due } }), 'Cash recorded');
  };
  const noShow = () => {
    if (window.confirm('Customer not available? Only after waiting 15 minutes and calling them. The visit charge applies.')) run('noshow', () => api(`/field/${sr._id}/no-show`, { method: 'POST' }), 'Marked as customer not available');
  };

  return (
    <>
      <Section title="1 · Verify product">
        <Panel className="space-y-3">
          {verified && <p className="flex items-center gap-1 text-sm text-green-700"><ShieldCheck className="h-4 w-4" /> Nameplate checked</p>}
          <PhotoPicker label="Nameplate photo (model & capacity sticker)" urls={v.nameplate} onChange={(u) => setV((x) => ({ ...x, nameplate: u.slice(-1) }))} />
          <Field label="Serial number on the unit"><Input value={v.serialNumber} onChange={(e) => setV((x) => ({ ...x, serialNumber: e.target.value }))} /></Field>
          <Field label="Product type (as on the nameplate)">
            <NativeSelect value={v.subtypeId} onChange={(e) => setV((x) => ({ ...x, subtypeId: e.target.value }))}>
              <option value="">Not set</option>
              {(subtypes?.items || []).map((s) => <option key={s._id} value={s._id}>{s.category} · {s.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Service actually needed">
            <NativeSelect value={v.jobType} onChange={(e) => setV((x) => ({ ...x, jobType: e.target.value }))}>{JOB_TYPES.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</NativeSelect>
          </Field>
          {sr.coverage !== 'none' && !sr.damage && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.damage} onChange={(e) => setV((x) => ({ ...x, damage: e.target.checked }))} /> Physical damage found (coverage will not apply)</label>
          )}
          {v.damage && !sr.damage && (
            <>
              <Field label="Describe the damage"><Textarea value={v.damageNote} onChange={(e) => setV((x) => ({ ...x, damageNote: e.target.value }))} /></Field>
              <PhotoPicker label="Damage photos" urls={v.damagePhotos} onChange={(u) => setV((x) => ({ ...x, damagePhotos: u }))} />
            </>
          )}
          <Button className="w-full" disabled={!v.nameplate.length || !!busy || !!quote} onClick={verify}>{busy === 'verify' ? 'Saving...' : verified ? 'Update product details' : 'Confirm product details'}</Button>
        </Panel>
      </Section>

      {verified && (
        <Section title="2 · Parts and repair">
          <Panel className="space-y-2">
            {sr.jobType === 'breakdown' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={repair} onChange={(e) => setRepair(e.target.checked)} /> Repair confirmed (repair labour replaces the visit charge)</label>}
            {(partList?.items || []).map((p) => (
              <div key={p._id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{p.name} <span className="text-neutral-500">· {inr(p.price)}/{p.unit}{p.coveredBy?.length ? ` · covered by ${p.coveredBy.join(', ').toUpperCase()}` : ''}</span></span>
                <Input type="number" min="0" className="h-8 w-16" value={parts[p._id] || ''} onChange={(e) => setParts((x) => ({ ...x, [p._id]: Number(e.target.value) }))} />
              </div>
            ))}
            {!partList?.items?.length && <p className="text-sm text-neutral-500">No parts in the list for this product.</p>}
            <Button variant="outline" className="w-full" disabled={!!busy || !!quote} onClick={saveParts}>{busy === 'parts' ? 'Saving...' : 'Save parts & send price'}</Button>
            <p className="text-xs text-neutral-500">A part not in the list? Ask your service company to add it; you cannot type a price.</p>
          </Panel>
        </Section>
      )}

      {quote && (
        <Panel className="space-y-1 border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold">Waiting for customer approval: {inr(quote.oldTotal)} → {inr(quote.newTotal)}</p>
          <p className="text-xs">{quote.reason}. Do not start the extra work until it is approved. Expires {fmtDateTime(quote.expiresAt)}.</p>
          <Button size="sm" variant="outline" onClick={reload}>Refresh</Button>
        </Panel>
      )}
      {['rejected', 'expired'].includes(sr.quote?.status) && <Panel className="text-sm text-neutral-700">Revised price {sr.quote.status}. {sr.quote.status === 'expired' ? 'Do only the booked work and offer a follow-up visit.' : ''}</Panel>}

      {sr.bill && (
        <Section title="3 · Bill">
          <Panel className="space-y-3">
            <BillView bill={sr.bill} />
            {sr.bill.due > 0 && !quote && (
              <>
                <p className="text-xs text-neutral-500">The customer can pay {inr(sr.bill.due)} online in their app, or hand you cash.</p>
                <Button variant="outline" className="w-full" disabled={!!busy} onClick={collect}>Collected {inr(sr.bill.due)} in cash</Button>
              </>
            )}
            {sr.bill.due <= 0 && <p className="text-sm font-semibold text-green-700">Fully paid</p>}
          </Panel>
        </Section>
      )}
      {!verified && <Button variant="ghost" className="w-full text-red-700" disabled={!!busy} onClick={noShow}>Customer not available</Button>}
    </>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: sr, loading, error, reload } = useApi(`/service-requests/${id}`);
  const [form, setForm] = useState(null);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (sr) {
      const r = sr.report || {};
      setForm({ serialNumber: r.serialNumber || sr.serialNumber || '', crmRef: r.crmRef || '', workDone: r.workDone || '', remarks: r.remarks || '', readings: readingsText(r.readings), beforePhotos: r.beforePhotos || [], afterPhotos: r.afterPhotos || [], productWorking: r.productWorking });
    }
  }, [sr]);

  const run = async (name, fn, ok) => {
    setBusy(name);
    setProblem('');
    try { await fn(); if (ok) toast.success(ok); reload(); } catch (e) { setProblem(e.message); toast.error(e.message); } finally { setBusy(''); }
  };

  const checkIn = () => run('checkin', async () => api(`/field/${id}/check-in`, { method: 'POST', body: await getPosition() }), 'Checked in at site');
  const saveReport = () => api(`/field/${id}/report`, { method: 'PATCH', body: { ...form, readings: parseReadings(form.readings) } });
  const save = () => run('save', saveReport, 'Progress saved');
  const sendOtp = () => run('otp', async () => { await saveReport(); const r = await api(`/field/${id}/otp`, { method: 'POST' }); setDevOtp(r.devOtp || ''); }, 'OTP sent to customer');
  const verifyOtp = () => run('verify', () => api(`/field/${id}/otp/verify`, { method: 'POST', body: { otp } }), 'Customer confirmed');
  const submit = () => run('submit', async () => { await saveReport(); await api(`/field/${id}/submit`, { method: 'POST' }); }, 'eFSR submitted for review');

  if (loading) return <p className="text-sm text-neutral-500">Loading...</p>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const rejected = sr.report?.review?.status === 'rejected';

  return (
    <Screen back="/engineer/jobs" title={sr.srNumber} subtitle={[sr.brand, sr.model].filter(Boolean).join(' ')} action={<StatusPill status={sr.status} />}>

      {rejected && sr.status === 'in_progress' && <ErrorNote>Sent back by reviewer: {sr.report.review.note || 'please redo the evidence'}</ErrorNote>}

      <Panel>
        <KeyValue label="Customer">{sr.customerName}</KeyValue>
        <KeyValue label="Phone">{sr.customerPhone && <a className="inline-flex items-center gap-1 text-primary" href={`tel:${sr.customerPhone}`}><Phone className="h-3 w-3" />{sr.customerPhone}</a>}</KeyValue>
        <KeyValue label="Site">{[sr.city, sr.address].filter(Boolean).join(' · ')}</KeyValue>
        <KeyValue label="Zone">{sr.zoneName}</KeyValue>
        {sr.location?.lat != null && (
          <KeyValue label="Directions"><a className="inline-flex items-center gap-1 text-primary" target="_blank" rel="noreferrer" href={directionsUrl(sr.location.lat, sr.location.lng)}><MapPin className="h-3 w-3" /> Navigate to site</a></KeyValue>
        )}
        <KeyValue label="Job">{humanize(sr.jobType)} · {sr.priority}{sr.slot === 'urgent' ? ' · URGENT' : ''}</KeyValue>
        {sr.scheduledAt && <KeyValue label="Slot">{fmtDateTime(sr.scheduledAt)}</KeyValue>}
        <KeyValue label="Product type">{sr.subtypeName}</KeyValue>
        <KeyValue label="Coverage"><CoverageBadge coverage={sr.coverage} /></KeyValue>
        <KeyValue label="Payment">{sr.paymentMode === 'prepaid' ? 'Prepaid' : 'Pay after service'}{sr.bill ? ` · ${humanize(sr.paymentStatus)}` : ''}</KeyValue>
        <KeyValue label="Issue">{sr.issue}</KeyValue>
      </Panel>

      {(sr.status === 'assigned' || (sr.status === 'in_progress' && !sr.report?.checkIn?.at)) && (
        <Button size="lg" className="w-full" disabled={busy === 'checkin'} onClick={checkIn}><MapPin className="h-4 w-4" /> {busy === 'checkin' ? 'Getting location...' : 'Check in at site (GPS)'}</Button>
      )}

      {sr.status === 'in_progress' && form && (
        <>
          {sr.report?.checkIn?.at && <p className="flex items-center gap-1 text-sm text-green-700"><ShieldCheck className="h-4 w-4" /> Checked in{sr.report.checkIn.distanceKm != null ? ` · ${sr.report.checkIn.distanceKm} km from site` : ''}</p>}
          {sr.report?.checkIn?.at && <OnSite key={`${sr.updatedAt}`} sr={sr} reload={reload} />}
          <Section title="Service report">
            <Panel className="space-y-3">
              <Field label="Equipment serial number"><Input value={form.serialNumber} onChange={set('serialNumber')} /></Field>
              <Field label="CRM / SR reference"><Input value={form.crmRef} onChange={set('crmRef')} /></Field>
              <Field label="Work performed"><Textarea value={form.workDone} onChange={set('workDone')} /></Field>
              <Field label="Readings (one per line, e.g. DC bus: 540V)"><Textarea value={form.readings} onChange={set('readings')} /></Field>
              <Field label="Remarks"><Input value={form.remarks} onChange={set('remarks')} /></Field>
              {sr.jobType === 'inspection' && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.productWorking !== false} onChange={(e) => setForm((f) => ({ ...f, productWorking: e.target.checked }))} /> Product is working (customer can then buy AMC / CMC)</label>
              )}
              <PhotoPicker label="Before photos" urls={form.beforePhotos} onChange={(v) => setForm((f) => ({ ...f, beforePhotos: v }))} />
              <PhotoPicker label="After photos" urls={form.afterPhotos} onChange={(v) => setForm((f) => ({ ...f, afterPhotos: v }))} />
              <Button variant="outline" className="w-full" disabled={!!busy} onClick={save}>Save progress</Button>
            </Panel>
          </Section>

          <Section title="Customer confirmation">
            <Panel className="space-y-3">
              <p className="text-sm text-neutral-600">Ask the customer for the OTP sent to their app to confirm the service is complete.</p>
              <Button variant="outline" className="w-full" disabled={!!busy} onClick={sendOtp}>Send OTP to customer</Button>
              {devOtp && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Dev mode OTP: <b>{devOtp}</b></p>}
              <div className="flex gap-2">
                <Input inputMode="numeric" maxLength={6} placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <Button disabled={otp.length < 4 || !!busy} onClick={verifyOtp}>Verify</Button>
              </div>
            </Panel>
          </Section>

          <ErrorNote>{problem}</ErrorNote>
          <Button size="lg" className="w-full" disabled={!!busy} onClick={submit}>{busy === 'submit' ? 'Submitting...' : 'Submit eFSR for review'}</Button>
        </>
      )}

      {sr.status === 'failed' && sr.bill?.due > 0 && (
        <Panel className="space-y-3">
          <p className="text-sm text-neutral-700">Visit ended: {sr.failReason}</p>
          <BillView bill={sr.bill} />
          <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => window.confirm(`Confirm you collected ₹${sr.bill.due} in cash?`) && run('cash', () => api(`/field/${id}/collect-cash`, { method: 'POST', body: { amount: sr.bill.due } }), 'Cash recorded')}>
            Collected {inr(sr.bill.due)} in cash
          </Button>
        </Panel>
      )}
      {sr.status === 'under_review' && <Panel className="border-amber-200 bg-amber-50 text-sm text-amber-900">Report submitted. Waiting for review — you'll be notified once it is approved.</Panel>}
      {['approved', 'closed'].includes(sr.status) && <Panel className="border-green-200 bg-green-50 text-sm text-green-900">This call was approved{sr.reviewNote ? `: ${sr.reviewNote}` : '.'} Payout details are under Earnings.</Panel>}
    </Screen>
  );
}
