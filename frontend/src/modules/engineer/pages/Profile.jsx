import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, Bell, Briefcase, Building2, Camera, CheckCircle2, ChevronRight, Clock, Edit2, Lock, LogOut, Mail, MapPin, Phone, Plus, Trash2, Upload, Wallet, Wrench, X } from 'lucide-react';
import { Field, Panel, Screen, Section, primaryBtn, secondaryBtn } from '@/shared/components/Mobile';
import { Input, Textarea } from '@/shared/components/ui/input';
import ZonePicker, { saveCoverage } from '@/shared/components/ZonePicker';
import { api, uploadFiles } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { loginPath } from '@/shared/constants/authRoles';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, humanize } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';
import { useDuty } from '../duty';

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const initialsOf = (name) => (name || 'Engineer').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('');
const certNames = (certs) => (certs || []).map((c) => c.brand).join(', ');

const NeedsApproval = () => (
  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold normal-case tracking-normal text-amber-700"><Lock className="h-2.5 w-2.5" /> Needs approval</span>
);

const InfoRow = ({ icon: Icon, label, children, pending }) => (
  <div className="flex items-start gap-3 px-3.5 py-3">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f4f9] text-[#5d667a]"><Icon className="h-4 w-4" /></span>
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-[#8a93a5]">{label}</p>
      <p className="text-[13px] font-semibold text-[#0b1324]">{children || '—'}</p>
      {pending && <p className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-amber-700"><Clock className="h-3 w-3" /> Requested: {pending}</p>}
    </div>
  </div>
);

const MenuRow = ({ to, icon: Icon, label }) => (
  <Link to={to} className="flex items-center justify-between px-3.5 py-3 text-[13.5px] font-semibold text-[#0b1324] transition hover:bg-[#fafbfd]">
    <span className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e9f0fe] text-[#1456d8]"><Icon className="h-4 w-4" /></span>{label}</span>
    <ChevronRight className="h-4 w-4 text-[#9aa5b8]" />
  </Link>
);

function Avatar({ e, size = 'h-15 w-15 text-[18px]' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-gradient-to-tr from-[#1456d8] to-[#3b82f6] font-extrabold text-white shadow-md ring-2 ring-[#e5ebf5]', size)}>
      {e.avatar ? <img src={e.avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(e.name)}
    </span>
  );
}

/**
 * Edit profile. Photo, email, skills and travel areas save at once. Name, base city and brand certifications change
 * which calls the engineer is trusted with, so they go to the service company (or admin) for approval.
 */
function EditProfile({ e, onDone, onCancel }) {
  const toast = useToast();
  const photoRef = useRef(null);
  const docRef = useRef(null);
  const p = e.pendingChanges || {};
  const [f, setF] = useState({
    avatar: e.avatar || '', email: e.email || '', skills: (e.skills || []).join(', '), serviceTerritories: (e.serviceTerritories || []).join(', '),
    name: p.name ?? e.name ?? '', city: p.city ?? e.city ?? '', certifications: (p.certifications || e.certifications || []).map((c) => ({ ...c })), note: '',
  });
  const [newBrand, setNewBrand] = useState('');
  const [docFor, setDocFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }));

  const upload = async (files, fn) => {
    try { const [url] = await uploadFiles(files); fn(url); } catch (err) { toast.error(err.message); }
  };
  const addBrand = () => {
    const b = newBrand.trim();
    if (!b || f.certifications.some((c) => c.brand.toLowerCase() === b.toLowerCase())) return;
    setF((s) => ({ ...s, certifications: [...s.certifications, { brand: b }] }));
    setNewBrand('');
  };

  const save = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try {
      const res = await api('/engineers/me', {
        method: 'PATCH',
        body: {
          avatar: f.avatar || undefined, email: f.email, skills: list(f.skills), serviceTerritories: list(f.serviceTerritories),
          name: f.name, city: f.city, certifications: f.certifications, note: f.note || undefined,
        },
      });
      toast.success(res.approvalRequested?.length ? 'Saved. Name / city / brand changes were sent for approval.' : 'Profile updated');
      onDone();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Screen title="Edit profile" subtitle="Some details need approval before they change" back={onCancel}>
      <form onSubmit={save} className="space-y-4">
        <input ref={photoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(ev) => { upload(ev.target.files, (url) => setF((s) => ({ ...s, avatar: url }))); ev.target.value = ''; }} />
        <input ref={docRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(ev) => { const i = docFor; upload(ev.target.files, (url) => setF((s) => ({ ...s, certifications: s.certifications.map((c, j) => (j === i ? { ...c, docUrl: url } : c)) }))); ev.target.value = ''; }} />

        <Panel className="flex items-center gap-4">
          <Avatar e={{ ...e, avatar: f.avatar }} size="h-16 w-16 text-[20px]" />
          <div className="space-y-1">
            <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-1.5 text-[13px] font-bold text-[#1456d8]"><Camera className="h-4 w-4" /> Change photo</button>
            {f.avatar && <button type="button" onClick={() => setF((s) => ({ ...s, avatar: '' }))} className="text-[12px] font-semibold text-red-600">Remove photo</button>}
          </div>
        </Panel>

        <Section title="Saved instantly">
          <Panel className="space-y-3">
            <Field label="Mobile number">
              <div className="flex h-10 items-center justify-between rounded-xl border border-[#e2e8f0] bg-neutral-100 px-3 text-[13px] font-semibold text-[#475467]">
                +91 {e.phone}<span className="flex items-center gap-1 text-[10.5px] text-[#8a93a5]"><Lock className="h-3 w-3" /> Login ID · contact support to change</span>
              </div>
            </Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} placeholder="name@example.com" /></Field>
            <Field label="Skills (comma separated)"><Input value={f.skills} onChange={set('skills')} placeholder="e.g. AC, DG sets, UPS" /></Field>
            <Field label="Areas you travel to (comma separated)"><Input value={f.serviceTerritories} onChange={set('serviceTerritories')} placeholder="e.g. Indore, Dewas" /></Field>
          </Panel>
        </Section>

        <Section title="Needs approval">
          <Panel className="space-y-3">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">These decide which calls you are offered. Your {e.engineerType === 'independent' ? 'admin' : 'service company'} approves them; until then your current details stay.</p>
            <Field label={<>Full name<NeedsApproval /></>}><Input required value={f.name} onChange={set('name')} /></Field>
            <Field label={<>Base city<NeedsApproval /></>}><Input required value={f.city} onChange={set('city')} /></Field>
            <Field label={<>Brand certifications<NeedsApproval /></>}>
              <div className="space-y-2">
                {f.certifications.map((c, i) => (
                  <div key={c.brand} className="flex items-center gap-2 rounded-xl border border-[#e6ebf3] bg-white px-3 py-2">
                    <BadgeCheck className="h-4 w-4 shrink-0 text-[#1456d8]" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0b1324]">{c.brand}</span>
                    {c.docUrl
                      ? <a href={c.docUrl} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-emerald-700">Certificate ✓</a>
                      : <button type="button" onClick={() => { setDocFor(i); docRef.current?.click(); }} className="flex items-center gap-1 text-[11.5px] font-semibold text-[#1456d8]"><Upload className="h-3.5 w-3.5" /> Certificate</button>}
                    <button type="button" aria-label={`Remove ${c.brand}`} onClick={() => setF((s) => ({ ...s, certifications: s.certifications.filter((_, j) => j !== i) }))} className="text-[#9aa5b8] hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={newBrand} onChange={(ev) => setNewBrand(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addBrand(); } }} placeholder="Add a brand, e.g. Daikin" />
                  <button type="button" onClick={addBrand} className={`${secondaryBtn} w-24`}><Plus className="h-4 w-4" /> Add</button>
                </div>
              </div>
            </Field>
            <Field label="Note for the approver (optional)"><Textarea rows={2} value={f.note} onChange={set('note')} placeholder="e.g. Completed Daikin VRV training in May" /></Field>
          </Panel>
        </Section>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className={secondaryBtn}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Screen>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const duty = useDuty();
  const e = duty.me;
  const { data: jobs } = useApi('/service-requests?limit=100');
  const { data: pay } = useApi('/settlements/payouts?limit=200');
  const [editing, setEditing] = useState(false);

  if (!e) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded-2xl bg-[#e8eef8]" />
        <div className="h-20 rounded-2xl bg-[#e8eef8]" />
        <div className="h-44 rounded-2xl bg-[#e8eef8]" />
      </div>
    );
  }
  if (editing) return <EditProfile e={e} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); duty.reloadMe(); }} />;

  const all = jobs?.items || [];
  const open = all.filter((j) => ['assigned', 'in_progress', 'under_review'].includes(j.status)).length;
  const completed = all.filter((j) => ['approved', 'closed'].includes(j.status)).length;
  const earned = (pay?.items || []).reduce((a, p) => a + (p.engineerAmount || 0), 0);
  const approved = e.status === 'approved';
  const p = e.pendingChanges;

  const withdraw = async () => {
    try { await api('/engineers/me/changes', { method: 'DELETE' }); toast.success('Request withdrawn'); duty.reloadMe(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden">
      {/* User card */}
      <Panel className="flex items-center gap-3.5">
        <Avatar e={e} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[17px] font-bold text-[#0b1324]">{e.name}</h2>
            <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 text-[10px] font-semibold', approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
              <BadgeCheck className="h-3 w-3" /> {approved ? 'Verified' : humanize(e.status)}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[#5d667a]"><Phone className="h-3 w-3 text-[#8a94a6]" /> +91 {e.phone}</p>
          {e.email && <p className="flex items-center gap-1.5 truncate text-[12px] text-[#5d667a]"><Mail className="h-3 w-3 text-[#8a94a6]" /> {e.email}</p>}
          <p className="flex items-center gap-1.5 text-[12px] text-[#5d667a]"><Building2 className="h-3 w-3 text-[#8a94a6]" /> {e.engineerType === 'independent' ? 'Independent engineer' : 'Company engineer'}</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit profile" className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-xl border border-[#e2e8f0] text-[#5d667a] transition hover:bg-[#f8fafc] hover:text-[#1456d8]">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </Panel>

      {p && (
        <div className="flex items-start gap-3 rounded-[18px] border border-amber-200 bg-amber-50 p-3.5">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1 text-[12.5px] text-amber-900">
            <p className="font-bold">Change waiting for approval</p>
            <p>Sent {fmtDateTime(p.requestedAt)} to your {e.engineerType === 'independent' ? 'admin' : 'service company'}. Your current details stay until it is approved.</p>
          </div>
          <button type="button" onClick={withdraw} aria-label="Withdraw request" className="shrink-0 text-amber-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Online / offline */}
      <Panel className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold text-[#0b1324]">{duty.online ? "You're online" : "You're offline"}</p>
          <p className="text-[12px] text-[#5d667a]">{duty.dayClosed && !duty.online ? 'Your day is closed. Go online again tomorrow.' : duty.online ? 'New calls near you can reach you.' : 'Go online to receive new calls.'}</p>
        </div>
        <button type="button" role="switch" aria-checked={duty.online} aria-label="Online" disabled={duty.busy || (duty.dayClosed && !duty.online)} onClick={() => duty.setOnline(!duty.online)}
          className={cn('relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60', duty.online ? 'bg-emerald-500' : 'bg-[#cfd6e2]')}>
          <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', duty.online ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </Panel>

      {/* Activity */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ['/engineer/jobs', Briefcase, open, 'Open calls', 'bg-blue-50 text-[#1456d8]'],
          ['/engineer/jobs', CheckCircle2, completed, 'Completed', 'bg-emerald-50 text-emerald-700'],
          ['/engineer/earnings', Wallet, inr(earned), 'Earned', 'bg-amber-50 text-amber-700'],
        ].map(([to, Icon, value, label, tone]) => (
          <Link key={label} to={to} className="flex flex-col items-center justify-center rounded-2xl border border-[#e5ebf5] bg-white p-2.5 text-center shadow-sm transition active:scale-[0.98]">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span>
            <span className="mt-1.5 text-[16px] font-bold leading-tight text-[#0b1324]">{value}</span>
            <span className="mt-0.5 text-[10.5px] font-medium leading-none text-[#5d667a]">{label}</span>
          </Link>
        ))}
      </div>

      <Section title="Work details" action={<button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-[13px] font-semibold text-[#1456d8]"><Edit2 className="h-3.5 w-3.5" /> Edit</button>}>
        <div className="divide-y divide-[#f0f4fa] overflow-hidden rounded-2xl border border-[#e5ebf5] bg-white shadow-sm">
          <InfoRow icon={MapPin} label="Base city" pending={p?.city}>{e.city}</InfoRow>
          <InfoRow icon={BadgeCheck} label="Brand certifications" pending={p?.certifications && certNames(p.certifications)}>{certNames(e.certifications)}</InfoRow>
          <InfoRow icon={Wrench} label="Skills">{(e.skills || []).join(', ')}</InfoRow>
          <InfoRow icon={MapPin} label="Areas you travel to">{(e.serviceTerritories || []).join(', ')}</InfoRow>
          {p?.name && <InfoRow icon={Edit2} label="Name" pending={p.name}>{e.name}</InfoRow>}
        </div>
      </Section>

      <Section title="My service zones">
        <Panel>
          <ZonePicker selected={e.serviceZones || []} onSave={async (ids) => { await saveCoverage(ids); duty.reloadMe(); }} hint="Choose the zones you can travel to. Jobs in other zones will not be offered to you." />
        </Panel>
      </Section>

      <div className="divide-y divide-[#f0f4fa] overflow-hidden rounded-2xl border border-[#e5ebf5] bg-white shadow-sm">
        <MenuRow to="/engineer/notifications" icon={Bell} label="Notifications" />
        <MenuRow to="/engineer/earnings" icon={Wallet} label="Earnings & incentive" />
      </div>

      <button type="button" onClick={() => { const to = loginPath(user?.role); logout(); nav(to); }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-[14px] font-semibold text-red-600 transition hover:bg-red-50">
        <LogOut className="h-4 w-4" /> Log Out
      </button>
    </div>
  );
}
