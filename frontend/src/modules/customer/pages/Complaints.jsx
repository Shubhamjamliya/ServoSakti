import { useRef, useState } from 'react';
import { Bot, Mic, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { NativeSelect, Textarea } from '@/shared/components/ui/input';
import { Empty, ErrorNote, Field, KeyValue, Panel, Screen, StatusPill } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate } from '@/shared/lib/format';

const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/**
 * Phase 1B: AI-assisted complaint intake.
 * Step 1 describe (text or voice) -> step 2 confirm the AI summary -> the platform queues the call to the brand's customer care.
 */
export default function Complaints() {
  const toast = useToast();
  const { data, reload } = useApi('/complaints?limit=50');
  const { data: passports } = useApi('/products/passports?limit=100');
  const [step, setStep] = useState('list'); // list | describe | confirm
  const [passportId, setPassportId] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('text');
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState(null);
  const [summary, setSummary] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef(null);

  const toggleMic = () => {
    if (listening) return recRef.current?.stop();
    const rec = new Speech();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => { setText((t) => `${t} ${e.results[0][0].transcript}`.trim()); setMode('voice'); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error('Could not hear you — type instead'); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const c = await api('/complaints', { method: 'POST', body: { passportId, transcript: text, inputMode: mode } });
      setDraft(c);
      setSummary(c.summary);
      setStep('confirm');
    } catch (err) { setError(err.message); }
  };

  const confirm = async () => {
    try {
      await api(`/complaints/${draft._id}/confirm`, { method: 'PATCH', body: { summary, consent } });
      toast.success('Complaint submitted — we will register it with the brand');
      setStep('list'); setText(''); setDraft(null); setConsent(false);
      reload();
    } catch (err) { setError(err.message); }
  };

  if (step === 'describe') {
    return (
      <Screen title="Describe the problem" subtitle="Speak or type — our assistant summarises it for you">
        <form onSubmit={create} className="space-y-3">
          <Panel className="space-y-3">
            <Field label="Product">
              <NativeSelect required value={passportId} onChange={(e) => setPassportId(e.target.value)}>
                <option value="" disabled>Select product...</option>
                {passports?.items?.map((p) => <option key={p._id} value={p._id}>{p.brand} {p.model} · {p.serialNumber}</option>)}
              </NativeSelect>
            </Field>
            <Field label="What is happening?"><Textarea className="min-h-32" value={text} onChange={(e) => setText(e.target.value)} required /></Field>
            {Speech && <Button type="button" variant="outline" className="w-full" onClick={toggleMic}><Mic className="h-4 w-4" /> {listening ? 'Listening... tap to stop' : 'Speak instead'}</Button>}
          </Panel>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setStep('list')}>Cancel</Button><Button className="flex-1">Summarise</Button></div>
        </form>
      </Screen>
    );
  }

  if (step === 'confirm') {
    return (
      <Screen title="Confirm summary" subtitle="Check what we will tell the brand's customer care">
        <Panel className="space-y-3">
          <Field label="Complaint summary"><Textarea className="min-h-28" value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
          <label className="flex items-start gap-2 text-sm text-neutral-600">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I agree to the call being recorded and transcribed for this complaint.
          </label>
          <p className="text-xs text-neutral-400">AI calling and call recording depend on the telephony provider and applicable law. If the call fails, a human operator will follow up.</p>
        </Panel>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setStep('describe')}>Back</Button><Button className="flex-1" onClick={confirm}>Confirm &amp; submit</Button></div>
      </Screen>
    );
  }

  return (
    <Screen title="AI complaint assistant" subtitle="Register a complaint with the brand's customer care" action={<Button size="sm" onClick={() => setStep('describe')}><Plus className="h-4 w-4" /> New</Button>}>
      {!data?.items?.length && <Empty><Bot className="mx-auto mb-2 h-6 w-6" />No complaints yet. Tell us the problem and we'll raise it with the brand.</Empty>}
      {(data?.items || []).map((c) => (
        <Panel key={c._id}>
          <div className="mb-1 flex items-start justify-between gap-2"><p className="font-semibold">{c.brand} {c.model}</p><StatusPill status={c.status} /></div>
          <p className="mb-2 text-sm text-neutral-600">{c.summary}</p>
          <KeyValue label="Submitted">{fmtDate(c.createdAt)}</KeyValue>
          <KeyValue label="Brand SR number">{c.call?.srNumber}</KeyValue>
          <KeyValue label="Expected turnaround">{c.call?.expectedTat}</KeyValue>
          <KeyValue label="Call status"><StatusPill status={c.call?.status || 'not_started'} /></KeyValue>
        </Panel>
      ))}
    </Screen>
  );
}
