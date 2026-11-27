import { directionsUrl } from '@/shared/lib/googleMaps';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, Camera, MapPin, Navigation, Phone, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { ErrorNote, Field, KeyValue, Panel, Screen, Section, StatusPill, primaryBtn, secondaryBtn } from '@/shared/components/Mobile';
import BillView, { CoverageBadge } from '@/shared/components/BillView';
import { api, uploadFiles } from '@/shared/lib/api';
import { getPosition } from '@/shared/lib/geo';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, PAYMENT_STATUSES, fmtDateTime, humanize, labelOf } from '@/shared/lib/format';
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
        {urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-xl border border-[#e6ebf3] bg-[#f7f9fd]">
            <img src={u} alt="" className="h-full w-full object-cover" />
          </a>
        ))}
        <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={add} />
        <button type="button" onClick={() => ref.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-[#c7d9fc] bg-[#f4f8ff] text-[10.5px] font-semibold text-[#1456d8]">
          <Camera className="h-5 w-5" /> Add
        </button>
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
  const sendOtp = () => run('otp', async () => { await saveReport(); await api(`/field/${id}/otp`, { method: 'POST' }); }, 'OTP sent to customer');
  const verifyOtp = () => run('verify', () => api(`/field/${id}/otp/verify`, { method: 'POST', body: { otp } }), 'Customer confirmed');
  const submit = () => run('submit', async () => { await saveReport(); await api(`/field/${id}/submit`, { method: 'POST' }); }, 'eFSR submitted for review');

  if (loading) return <div className="space-y-3"><div className="h-10 w-40 animate-pulse rounded-xl bg-[#e8eef8]" /><div className="h-48 animate-pulse rounded-[18px] bg-[#e8eef8]" /></div>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const rejected = sr.report?.review?.status === 'rejected';

  return (
    <Screen back="/engineer/jobs" title={`SR #${String(sr.srNumber).replace(/^SR-/, '')}`} subtitle={`Created ${fmtDateTime(sr.createdAt)}`} action={<StatusPill status={sr.status} />}>

      {rejected && sr.status === 'in_progress' && <ErrorNote>Sent back by reviewer: {sr.report.review.note || 'please redo the evidence'}</ErrorNote>}

      {/* Job card */}
      <div className="overflow-hidden rounded-[18px] border border-[#e6ebf3] bg-white shadow-[0_2px_10px_rgba(15,35,80,0.04)]">
        <div className="flex gap-3 p-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${sr.slot === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-[#e9f0fe] text-[#1456d8]'}`}><Wrench className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-[#0b1324]">{[sr.brand, sr.model].filter(Boolean).join(' ') || 'Equipment'}</p>
            <p className="text-[12.5px] text-[#4a5263]">{[sr.subtypeName, labelOf(JOB_TYPES, sr.jobType)].filter(Boolean).join(' · ')}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <CoverageBadge coverage={sr.coverage} />
              {sr.slot === 'urgent'
                ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Urgent · within 3 hours</span>
                : sr.scheduledAt && <span className="flex items-center gap-1 rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-semibold text-[#4a5263]"><CalendarDays className="h-3 w-3" />{fmtDateTime(sr.scheduledAt)}</span>}
            </div>
          </div>
        </div>
        {sr.issue && <p className="mx-3.5 mb-3 rounded-xl bg-[#f7f9fd] px-3 py-2 text-[12.5px] text-[#4a5263]"><span className="font-semibold text-[#0b1324]">Issue: </span>{sr.issue}</p>}
        <div className="border-t border-[#eef1f6] px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1d2848] text-[12px] font-bold text-white">{(sr.customerName || 'C').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13.5px] font-semibold text-[#0b1324]">{sr.customerName || 'Customer'}</p>
              <p className="truncate text-[11.5px] text-[#5d667a]">{[sr.address, sr.city].filter(Boolean).join(', ') || 'Address not provided'}{sr.zoneName ? ` · ${sr.zoneName}` : ''}</p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {sr.customerPhone ? <a href={`tel:${sr.customerPhone}`} className={secondaryBtn}><Phone className="h-4 w-4" /> Call</a> : <span className={`${secondaryBtn} opacity-50`}><Phone className="h-4 w-4" /> No phone</span>}
            {sr.location?.lat != null
              ? <a target="_blank" rel="noreferrer" href={directionsUrl(sr.location.lat, sr.location.lng)} className={secondaryBtn}><Navigation className="h-4 w-4" /> Navigate</a>
              : <span className={`${secondaryBtn} opacity-50`}><MapPin className="h-4 w-4" /> No map pin</span>}
          </div>
        </div>
        <div className="border-t border-[#eef1f6] px-3.5 py-1">
          <KeyValue label="Payment">{sr.paymentMode === 'prepaid' ? 'Prepaid online' : 'Pay after service'}{sr.bill ? ` · ${labelOf(PAYMENT_STATUSES, sr.paymentStatus)}` : ''}</KeyValue>
          <KeyValue label="Priority">{sr.priority}</KeyValue>
        </div>
      </div>

      {(sr.status === 'assigned' || (sr.status === 'in_progress' && !sr.report?.checkIn?.at)) && (
        <button type="button" className={`${primaryBtn} h-12`} disabled={busy === 'checkin'} onClick={checkIn}><MapPin className="h-4 w-4" /> {busy === 'checkin' ? 'Getting location...' : 'Check in at site (GPS)'}</button>
      )}

      {sr.status === 'in_progress' && form && (
        <>
          {sr.report?.checkIn?.at && <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Checked in at site{sr.report.checkIn.distanceKm != null ? ` · ${sr.report.checkIn.distanceKm} km from the pin` : ''}</p>}
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
              <button type="button" className={secondaryBtn} disabled={!!busy} onClick={save}>Save progress</button>
            </Panel>
          </Section>

          <Section title="Customer confirmation">
            <Panel className="space-y-3">
              <p className="text-[12.5px] text-[#5d667a]">Ask the customer for the OTP shown in their app to confirm the service is complete.</p>
              <button type="button" className={secondaryBtn} disabled={!!busy} onClick={sendOtp}>Send OTP to customer</button>
              {sr.otp?.verified
                ? <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Customer confirmed</p>
                : (
                  <div className="flex gap-2">
                    <Input inputMode="numeric" maxLength={6} placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} className="h-11 rounded-xl text-center text-[16px] font-bold tracking-[0.3em]" />
                    <button type="button" className={`${primaryBtn} w-28`} disabled={otp.length < 4 || !!busy} onClick={verifyOtp}>Verify</button>
                  </div>
                )}
            </Panel>
          </Section>

          <ErrorNote>{problem}</ErrorNote>
          <button type="button" className={`${primaryBtn} h-12`} disabled={!!busy} onClick={submit}>{busy === 'submit' ? 'Submitting...' : 'Submit eFSR for review'}</button>
        </>
      )}

      {sr.status === 'failed' && sr.bill?.due > 0 && (
        <Panel className="space-y-3">
          <p className="text-[13px] font-semibold text-[#0b1324]">Visit ended: <span className="font-normal text-[#4a5263]">{sr.failReason}</span></p>
          <BillView bill={sr.bill} />
          <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => window.confirm(`Confirm you collected ₹${sr.bill.due} in cash?`) && run('cash', () => api(`/field/${id}/collect-cash`, { method: 'POST', body: { amount: sr.bill.due } }), 'Cash recorded')}>
            Collected {inr(sr.bill.due)} in cash
          </button>
        </Panel>
      )}
      {sr.status === 'under_review' && <Panel className="border-amber-200 bg-amber-50 text-[13px] text-amber-900"><p className="font-bold">Report submitted</p>Waiting for review — you will be notified once it is approved.</Panel>}
      {['approved', 'closed'].includes(sr.status) && <Panel className="border-emerald-200 bg-emerald-50 text-[13px] text-emerald-900"><p className="font-bold">Call approved</p>{sr.reviewNote ? `${sr.reviewNote}. ` : ''}Payout details are under Earnings.</Panel>}
    </Screen>
  );
}
