import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import RouteMap from '@/shared/components/RouteMap';
import { useLiveLocation } from '@/shared/lib/useLiveLocation';
import { directionsUrl } from '@/shared/lib/googleMaps';
import { CheckCircle2, Headset, LocateOff, MapPin, Navigation, Play, Timer, Wallet } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Empty, Panel, RowLink, Screen, Section, StatTile, StatusPill } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { getPosition } from '@/shared/lib/geo';
import { useApi } from '@/shared/lib/useApi';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';
import { jobMeta } from '../jobMeta';
import { fmtDateTime, humanize } from '@/shared/lib/format';

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
            <button key={j._id} onClick={() => setSel(j._id)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${j._id === job._id ? 'border-primary bg-primary text-white' : 'bg-white text-neutral-600'}`}>{j.srNumber}</button>
          ))}
        </div>
      )}
      <RouteMap origin={pos} destination={dest} onRoute={setRoute} height={300} />
      <Panel className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{job.customerName || 'Customer'} · {job.srNumber}</p>
            <p className="text-sm text-neutral-500">{[job.address, job.city].filter(Boolean).join(', ') || 'Address not provided'}</p>
          </div>
          <StatusPill status={job.status} />
        </div>
        {dest ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-sky-700">{route ? [route.distanceText, route.durationText].filter(Boolean).join(' · ') : 'Finding route...'}</span>
            <a className="inline-flex items-center gap-1 text-primary" target="_blank" rel="noreferrer" href={directionsUrl(dest.lat, dest.lng)}><Navigation className="h-4 w-4" /> Open in Google Maps</a>
          </div>
        ) : (
          <p className="text-xs text-amber-700">The customer did not pin a map location for this call. Use the address above or call them.</p>
        )}
        {route?.approx && <p className="text-xs text-neutral-400">Showing a straight line — enable the Directions API on the Maps key for road routes.</p>}
        <Button asChild className="w-full" variant="outline"><Link to={`/engineer/jobs/${job._id}`}>Open job</Link></Button>
      </Panel>
    </Section>
  );
}

function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to) - now) / 1000));
  return <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function Home() {
  const { user } = useAuth();
  const toast = useToast();
  const loc = useLiveLocation({ sync: true });
  const { data: day, reload: reloadDay } = useApi('/field/day');
  const { data: offers, reload: reloadOffers } = useApi('/dispatch/offers');
  const { data: jobs, reload: reloadJobs } = useApi('/service-requests?limit=30');
  const { data: inc } = useApi('/settlements/incentives');
  const [busy, setBusy] = useState(false);

  const started = day?.day && !day.day.closedAt;
  const active = (jobs?.items || []).filter((j) => ACTIVE.includes(j.status));
  const mine = inc?.items?.[0];
  const done = (jobs?.items || []).filter((j) => ['approved', 'closed'].includes(j.status)).length;

  const startDay = async () => {
    setBusy(true);
    try {
      const pos = await getPosition();
      await api('/field/day-start', { method: 'POST', body: pos });
      toast.success('Day started — you can now accept calls');
      reloadDay();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

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
      <Screen title={`Hi, ${user?.name?.split(' ')[0] || 'Engineer'}`}>
        <Panel className="space-y-3 border-amber-200 bg-amber-50 text-center">
          <LocateOff className="mx-auto h-8 w-8 text-amber-700" />
          <p className="font-semibold text-amber-900">{loc.status === 'pending' ? 'Getting your location...' : 'Location is required'}</p>
          <p className="text-sm text-amber-800">
            {loc.status === 'pending'
              ? 'Please allow location access when your browser asks.'
              : loc.status === 'unsupported'
                ? 'This device cannot share its location, so jobs cannot be shown.'
                : 'Turn on location for this site in your browser settings, then try again. You cannot accept or work on calls without it.'}
          </p>
          {loc.status !== 'pending' && <Button className="w-full" onClick={loc.retry}>Try again</Button>}
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen title={`Hi, ${user?.name?.split(' ')[0] || 'Engineer'}`} subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}>
      <Panel className={started ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
        {day?.day?.closedAt ? (
          <div><p className="font-semibold">Day closed</p><p className="text-sm text-neutral-600">Your day ended automatically at 11:59 PM. Start a new day tomorrow.</p></div>
        ) : started ? (
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-green-700" />
            <div><p className="font-semibold text-green-800">Day started</p><p className="text-sm text-green-700">Since {fmtDateTime(day.day.startedAt)} · closes automatically at 11:59 PM</p></div>
          </div>
        ) : (
          <div className="space-y-3">
            <div><p className="font-semibold text-amber-900">Day not started</p><p className="text-sm text-amber-800">Day Start is compulsory before you can accept or work on calls.</p></div>
            <Button className="w-full" size="lg" onClick={startDay} disabled={busy}><Play className="h-4 w-4" /> {busy ? 'Getting location...' : 'Start Day'}</Button>
          </div>
        )}
      </Panel>

      {active.length > 0 && <JobMap jobs={active} pos={loc.pos} />}

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Active calls" value={active.length} helper="Assigned to you" icon={Headset} accent="bg-sky-100" to="/engineer/jobs" />
        <StatTile label="New offers" value={offers?.total ?? 0} helper="Waiting for reply" icon={Timer} accent="bg-amber-100" />
        <StatTile label="Completed" value={done} helper="Approved / closed" icon={CheckCircle2} accent="bg-green-100" to="/engineer/jobs" />
        <StatTile label="This month" value={mine ? `${mine.approvedCalls}/${mine.target}` : '—'} helper="Approved calls" icon={Wallet} accent="bg-violet-100" to="/engineer/earnings" />
      </div>

      {offers?.total > 0 && (
        <Section title={`New offers (${offers.total})`}>
          {offers.items.map((o) => (
            <Panel key={o._id} className="space-y-3 border-sky-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{o.srNumber} · {o.sr?.brand} {o.sr?.model}</p>
                  <p className="text-sm text-neutral-500">{o.sr?.slot === 'urgent' ? 'URGENT · ' : o.sr?.scheduledAt ? `${fmtDateTime(o.sr.scheduledAt)} · ` : ''}{o.sr?.city} · {humanize(o.sr?.jobType)}{o.sr?.subtypeName ? ` · ${o.sr.subtypeName}` : ` · ${o.sr?.priority}`}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700"><Timer className="h-3 w-3" /><Countdown to={o.expiresAt} /></span>
              </div>
              {o.sr?.issue && <p className="text-sm text-neutral-600">{o.sr.issue}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => respond(o, true)}>Accept</Button>
                <Button className="flex-1" variant="outline" onClick={() => respond(o, false)}>Decline</Button>
              </div>
            </Panel>
          ))}
        </Section>
      )}

      <Section title="Today's calls">
        {active.length === 0 && <Empty>No active calls. New offers will appear here.</Empty>}
        {active.map((j) => (
          <RowLink key={j._id} to={`/engineer/jobs/${j._id}`} title={`${j.srNumber} · ${[j.brand, j.model].filter(Boolean).join(' ')}`} meta={`${jobMeta(j)} · ${j.customerName || ''}`} right={<StatusPill status={j.status} />} />
        ))}
      </Section>

      {mine && (
        <Section title="Monthly incentive">
          <Link to="/engineer/earnings"><Panel className="space-y-2">
            <div className="flex justify-between text-sm"><span>{mine.approvedCalls} of {mine.target} approved calls</span><StatusPill status={mine.status} /></div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (mine.approvedCalls / mine.target) * 100)}%` }} /></div>
            <p className="text-xs text-neutral-500">Reach {mine.target} approved calls this month for a free {mine.rechargeDays}-day mobile recharge.</p>
          </Panel></Link>
        </Section>
      )}
    </Screen>
  );
}
