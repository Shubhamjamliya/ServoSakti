import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import RouteMap from '@/shared/components/RouteMap';
import { useLiveLocation } from '@/shared/lib/useLiveLocation';
import { directionsUrl } from '@/shared/lib/googleMaps';
import { Briefcase, CalendarDays, CheckCircle2, ChevronRight, Gift, Headset, LocateOff, MapPin, Navigation, Play, Timer, Wallet, Zap } from 'lucide-react';
import { Empty, Panel, Section, StatTile, StatusPill, primaryBtn, secondaryBtn } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, fmtDateTime, labelOf } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import JobCard from '../components/JobCard';
import { useDuty } from '../duty';

const ACTIVE = ['assigned', 'in_progress', 'under_review'];

/** Live map: the engineer's position, the customer's site and the road route between them. */
function JobMap({ jobs, pos }) {
  const [sel, setSel] = useState(jobs[0]?._id);
  const [route, setRoute] = useState(null);
  const job = jobs.find((j) => j._id === sel) || jobs[0];
  useEffect(() => { setRoute(null); }, [job?._id]);
  const dest = job?.location?.lat != null ? { lat: job.location.lat, lng: job.location.lng } : null;

  return (
    <Section title="Route to customer">
      {jobs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {jobs.map((j) => (
            <button key={j._id} type="button" onClick={() => setSel(j._id)}
              className={cn('shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold', j._id === job._id ? 'border-[#1456d8] bg-[#1456d8] text-white' : 'border-[#e6ebf3] bg-white text-[#4a5263]')}>
              {j.srNumber}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-[18px] border border-[#e6ebf3] bg-white shadow-[0_2px_10px_rgba(15,35,80,0.04)]">
        <RouteMap origin={pos} destination={dest} onRoute={setRoute} height={240} />
        <div className="space-y-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-[#0b1324]">{job.customerName || 'Customer'} · {job.srNumber}</p>
              <p className="text-[12px] text-[#5d667a]">{[job.address, job.city].filter(Boolean).join(', ') || 'Address not provided'}</p>
            </div>
            <StatusPill status={job.status} />
          </div>
          {dest ? (
            <div className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="font-semibold text-[#1456d8]">{route ? [route.distanceText, route.durationText].filter(Boolean).join(' · ') : 'Finding route...'}</span>
              <a className="inline-flex items-center gap-1 font-semibold text-[#1456d8]" target="_blank" rel="noreferrer" href={directionsUrl(dest.lat, dest.lng)}><Navigation className="h-4 w-4" /> Google Maps</a>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">The customer did not pin a map location. Use the address above or call them.</p>
          )}
          {route?.approx && <p className="text-[11px] text-[#8a93a5]">Showing a straight line — enable the Directions API on the Maps key for road routes.</p>}
          <Link to={`/engineer/jobs/${job._id}`} className={secondaryBtn}>Open job <ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </Section>
  );
}

function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to) - now) / 1000));
  return <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

const Greeting = ({ name }) => {
  const h = new Date().getHours();
  return (
    <div>
      <h1 className="text-[22px] font-bold leading-tight text-[#0b1324]">{h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, {name}</h1>
      <p className="text-[13.5px] text-[#5d667a]">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    </div>
  );
};

export default function Home() {
  const { user } = useAuth();
  const toast = useToast();
  const loc = useLiveLocation({ sync: true });
  const duty = useDuty();
  const { data: offers, reload: reloadOffers } = useApi('/dispatch/offers');
  const { data: jobs, reload: reloadJobs } = useApi('/service-requests?limit=30');
  const { data: inc } = useApi('/settlements/incentives');
  const firstName = user?.name?.split(' ')[0] || 'Engineer';
  useEffect(() => {
    const onChange = () => { reloadOffers(); reloadJobs(); };
    window.addEventListener('sf:jobs-changed', onChange);
    return () => window.removeEventListener('sf:jobs-changed', onChange);
  }, [reloadOffers, reloadJobs]);

  const active = (jobs?.items || []).filter((j) => ACTIVE.includes(j.status));
  const mine = inc?.items?.[0];
  const done = (jobs?.items || []).filter((j) => ['approved', 'closed'].includes(j.status)).length;

  const respond = async (offer, accept) => {
    try {
      await api(`/dispatch/offers/${offer._id}/${accept ? 'accept' : 'reject'}`, { method: 'POST', body: accept ? {} : { reason: 'Declined by engineer' } });
      toast.success(accept ? 'Call accepted' : 'Declined');
      reloadOffers();
      reloadJobs();
    } catch (e) { toast.error(e.message); }
  };

  // Location is mandatory: nothing else is shown until the device shares its position.
  if (loc.status !== 'granted') {
    return (
      <div className="space-y-4">
        <Greeting name={firstName} />
        <Panel className="space-y-3 border-amber-200 bg-amber-50 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-700"><LocateOff className="h-6 w-6" /></span>
          <p className="text-[15px] font-bold text-amber-900">{loc.status === 'pending' ? 'Getting your location...' : 'Location is required'}</p>
          <p className="text-[12.5px] text-amber-800">
            {loc.status === 'pending'
              ? 'Please allow location access when your browser asks.'
              : loc.status === 'unsupported'
                ? 'This device cannot share its location, so jobs cannot be shown.'
                : 'Turn on location for this site in your browser settings, then try again. You cannot accept or work on calls without it.'}
          </p>
          {loc.status !== 'pending' && <button type="button" className={primaryBtn} onClick={loc.retry}>Try again</button>}
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Greeting name={firstName} />

      {/* Online / offline */}
      {duty.dayClosed && !duty.online ? (
        <Panel className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1f4f9] text-[#5d667a]"><CalendarDays className="h-5 w-5" /></span>
          <div><p className="text-[14.5px] font-bold text-[#0b1324]">Day closed</p><p className="text-[12px] text-[#5d667a]">Your day ended at 11:59 PM. Go online again tomorrow.</p></div>
        </Panel>
      ) : duty.online ? (
        <Panel className="flex items-center gap-3 border-emerald-200 bg-emerald-50/70">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
            <MapPin className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold text-emerald-800">You&apos;re online</p>
            <p className="text-[12px] text-emerald-700">New calls near you can reach you · day started {fmtDateTime(duty.day?.startedAt)}</p>
          </div>
          <button type="button" disabled={duty.busy} onClick={() => duty.setOnline(false)} className="shrink-0 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[12px] font-bold text-emerald-700 disabled:opacity-60">Go offline</button>
        </Panel>
      ) : (
        <div className="overflow-hidden rounded-[18px] bg-gradient-to-br from-[#1456d8] to-[#3b82f6] p-4 text-white shadow-[0_10px_30px_rgba(20,86,216,0.25)]">
          <p className="text-[16px] font-bold">You&apos;re offline</p>
          <p className="mt-0.5 text-[12.5px] text-white/85">Go online to receive new calls. {duty.day ? 'Jobs you already accepted stay with you.' : 'Your day starts when you go online (uses your location).'}</p>
          <button type="button" onClick={() => duty.setOnline(true)} disabled={duty.busy || duty.loading} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-bold text-[#1456d8] transition active:scale-[0.99] disabled:opacity-60">
            <Play className="h-4 w-4" /> {duty.busy ? 'Getting location...' : 'Go Online'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Active calls" value={active.length} icon={Headset} accent="bg-[#e9f0fe] text-[#1456d8]" to="/engineer/jobs" />
        <StatTile label="New offers" value={offers?.total ?? 0} icon={Timer} accent="bg-amber-50 text-amber-700" />
        <StatTile label="Completed" value={done} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-700" to="/engineer/jobs" />
        <StatTile label="This month" value={mine ? `${mine.approvedCalls}/${mine.target}` : '—'} icon={Wallet} accent="bg-violet-50 text-violet-700" to="/engineer/earnings" />
      </div>

      {offers?.total > 0 && (
        <Section title={`New offers (${offers.total})`}>
          {offers.items.map((o) => (
            <div key={o._id} className="overflow-hidden rounded-[18px] border border-[#bcd2fa] bg-white shadow-[0_2px_10px_rgba(15,35,80,0.06)]">
              <div className="flex gap-3 p-3.5">
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', o.sr?.slot === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-[#e9f0fe] text-[#1456d8]')}>
                  {o.sr?.slot === 'urgent' ? <Zap className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-bold text-[#0b1324]">{o.srNumber}</p>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[11.5px] font-bold text-amber-700"><Timer className="h-3.5 w-3.5" /><Countdown to={o.expiresAt} /></span>
                  </div>
                  <p className="truncate text-[12.5px] text-[#4a5263]">{[o.sr?.brand, o.sr?.model].filter(Boolean).join(' ')}{o.sr?.subtypeName ? ` · ${o.sr.subtypeName}` : ''} — {labelOf(JOB_TYPES, o.sr?.jobType)}</p>
                  <p className={cn('mt-0.5 text-[11.5px]', o.sr?.slot === 'urgent' ? 'font-semibold text-red-600' : 'text-[#5d667a]')}>
                    {o.sr?.slot === 'urgent' ? 'Urgent · within 3 hours' : o.sr?.scheduledAt ? fmtDateTime(o.sr.scheduledAt) : o.sr?.priority} {o.sr?.city ? `· ${o.sr.city}` : ''}
                  </p>
                  {o.sr?.issue && <p className="mt-1 line-clamp-2 text-[12px] text-[#5d667a]">{o.sr.issue}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-[#eef1f6] p-3">
                <button type="button" onClick={() => respond(o, false)} className={secondaryBtn}>Decline</button>
                <button type="button" onClick={() => respond(o, true)} className={primaryBtn}>Accept</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {active.length > 0 && <JobMap jobs={active} pos={loc.pos} />}

      <Section title="Today's calls" action={active.length > 0 && <Link to="/engineer/jobs" className="flex items-center gap-0.5 text-[13.5px] font-semibold text-[#1456d8]">View all<ChevronRight className="h-4 w-4" /></Link>}>
        {active.length === 0 && <Empty icon={Briefcase}>No active calls. New offers will appear here.</Empty>}
        <div className="space-y-3">{active.map((j) => <JobCard key={j._id} j={j} />)}</div>
      </Section>

      {mine && (
        <Link to="/engineer/earnings" className="block">
          <Panel className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Gift className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#0b1324]">Monthly incentive</p>
                <p className="text-[12px] text-[#5d667a]">{mine.approvedCalls} of {mine.target} approved calls</p>
              </div>
              <StatusPill status={mine.status} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#edf2fa]"><div className="h-full rounded-full bg-[#1456d8]" style={{ width: `${Math.min(100, (mine.approvedCalls / mine.target) * 100)}%` }} /></div>
            <p className="text-[11.5px] text-[#5d667a]">Reach {mine.target} approved calls this month for a free {mine.rechargeDays}-day mobile recharge.</p>
          </Panel>
        </Link>
      )}
    </div>
  );
}
