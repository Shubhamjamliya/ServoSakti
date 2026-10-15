import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, Textarea } from '@/shared/components/ui/input';
import { ErrorNote, Field, KeyValue, Panel, Screen, Section, StatusPill } from '@/shared/components/Mobile';
import { api, uploadFiles } from '@/shared/lib/api';
import { getPosition } from '@/shared/lib/geo';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';

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
      setForm({ serialNumber: r.serialNumber || sr.serialNumber || '', crmRef: r.crmRef || '', workDone: r.workDone || '', remarks: r.remarks || '', readings: readingsText(r.readings), beforePhotos: r.beforePhotos || [], afterPhotos: r.afterPhotos || [] });
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
    <Screen title={sr.srNumber} subtitle={[sr.brand, sr.model].filter(Boolean).join(' ')} action={<StatusPill status={sr.status} />}>
      <Link to="/engineer/jobs" className="-mt-2 flex items-center gap-1 text-sm text-neutral-500"><ArrowLeft className="h-4 w-4" /> Back to jobs</Link>

      {rejected && sr.status === 'in_progress' && <ErrorNote>Sent back by reviewer: {sr.report.review.note || 'please redo the evidence'}</ErrorNote>}

      <Panel>
        <KeyValue label="Customer">{sr.customerName}</KeyValue>
        <KeyValue label="Phone">{sr.customerPhone && <a className="inline-flex items-center gap-1 text-primary" href={`tel:${sr.customerPhone}`}><Phone className="h-3 w-3" />{sr.customerPhone}</a>}</KeyValue>
        <KeyValue label="Site">{[sr.city, sr.address].filter(Boolean).join(' · ')}</KeyValue>
        <KeyValue label="Job">{humanize(sr.jobType)} · {sr.priority}</KeyValue>
        <KeyValue label="Warranty">{humanize(sr.warranty)}</KeyValue>
        <KeyValue label="Issue">{sr.issue}</KeyValue>
      </Panel>

      {(sr.status === 'assigned' || (sr.status === 'in_progress' && !sr.report?.checkIn?.at)) && (
        <Button size="lg" className="w-full" disabled={busy === 'checkin'} onClick={checkIn}><MapPin className="h-4 w-4" /> {busy === 'checkin' ? 'Getting location...' : 'Check in at site (GPS)'}</Button>
      )}

      {sr.status === 'in_progress' && form && (
        <>
          {sr.report?.checkIn?.at && <p className="flex items-center gap-1 text-sm text-green-700"><ShieldCheck className="h-4 w-4" /> Checked in{sr.report.checkIn.distanceKm != null ? ` · ${sr.report.checkIn.distanceKm} km from site` : ''}</p>}
          <Section title="Service report">
            <Panel className="space-y-3">
              <Field label="Equipment serial number"><Input value={form.serialNumber} onChange={set('serialNumber')} /></Field>
              <Field label="CRM / SR reference"><Input value={form.crmRef} onChange={set('crmRef')} /></Field>
              <Field label="Work performed"><Textarea value={form.workDone} onChange={set('workDone')} /></Field>
              <Field label="Readings (one per line, e.g. DC bus: 540V)"><Textarea value={form.readings} onChange={set('readings')} /></Field>
              <Field label="Remarks"><Input value={form.remarks} onChange={set('remarks')} /></Field>
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
                <Input inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <Button disabled={otp.length !== 6 || !!busy} onClick={verifyOtp}>Verify</Button>
              </div>
            </Panel>
          </Section>

          <ErrorNote>{problem}</ErrorNote>
          <Button size="lg" className="w-full" disabled={!!busy} onClick={submit}>{busy === 'submit' ? 'Submitting...' : 'Submit eFSR for review'}</Button>
        </>
      )}

      {sr.status === 'under_review' && <Panel className="border-amber-200 bg-amber-50 text-sm text-amber-900">Report submitted. Waiting for review — you'll be notified once it is approved.</Panel>}
      {['approved', 'closed'].includes(sr.status) && <Panel className="border-green-200 bg-green-50 text-sm text-green-900">This call was approved{sr.reviewNote ? `: ${sr.reviewNote}` : '.'} Payout details are under Earnings.</Panel>}
    </Screen>
  );
}
