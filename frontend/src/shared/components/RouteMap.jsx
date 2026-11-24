import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, mapsEnabled, MAP_ID } from '@/shared/lib/googleMaps';
import { haversineKm } from '@/shared/lib/geo';

const RIDER_ICON = '/images/map/engineer-rider-top.svg'; // top view, travelling up (north), rotated around its centre
const RIDER_SIZE = 56;
const REROUTE_METERS = 150;   // re-request the route only after moving this far
const REROUTE_MIN_MS = 45000; // ...and not more often than this (Directions calls are billed)
const MOVE_FOR_HEADING_M = 8; // movement needed before a computed heading is trusted (GPS jitter)

/** Compass bearing (0 = north, clockwise) from a to b. */
function bearing(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** First point on the route at least ~25 m ahead, so a parked rider faces the road he will take. */
function aheadOnRoute(path, from) {
  for (const p of path) {
    const pt = { lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng };
    if (haversineKm(from, pt) * 1000 > 25) return pt;
  }
  return null;
}

/**
 * The engineer marker: an <img> on the map's overlay layer, so it can be rotated freely (a classic Marker can't).
 * Rotation takes the shortest way round, so 350° → 10° turns 20°, not 340°.
 */
function createRider(maps, map) {
  class Rider extends maps.OverlayView {
    constructor() {
      super();
      this.pos = null;
      this.angle = 0;
      this.div = document.createElement('div');
      this.div.title = 'You';
      this.div.style.cssText = `position:absolute;width:${RIDER_SIZE}px;height:${RIDER_SIZE}px;margin-left:-${RIDER_SIZE / 2}px;margin-top:-${RIDER_SIZE / 2}px;pointer-events:none;z-index:3`;
      this.img = document.createElement('img');
      this.img.src = RIDER_ICON;
      this.img.alt = '';
      this.img.style.cssText = 'width:100%;height:100%;transition:transform .7s ease-out;will-change:transform';
      this.div.appendChild(this.img);
    }

    onAdd() { this.getPanes().floatPane.appendChild(this.div); }

    draw() {
      const proj = this.getProjection();
      if (!proj || !this.pos) return;
      const p = proj.fromLatLngToDivPixel(new maps.LatLng(this.pos.lat, this.pos.lng));
      if (p) { this.div.style.left = `${p.x}px`; this.div.style.top = `${p.y}px`; }
    }

    onRemove() { this.div.remove(); }

    setPosition(pos) { this.pos = pos; this.draw(); }

    /** Points the rider at `deg` on screen (compass bearing minus the map's own rotation). */
    face(deg) {
      const delta = ((((deg - this.angle) % 360) + 540) % 360) - 180;
      this.angle += delta;
      this.img.style.transform = `rotate(${this.angle}deg)`;
    }
  }
  const rider = new Rider();
  rider.setMap(map);
  return rider;
}

/**
 * Map with the engineer's live position, the customer's site and a road-following route between them.
 * The rider faces the direction of travel: the phone's GPS heading while moving, else the direction of his last
 * movement, else (parked) along the route towards the customer. With VITE_GOOGLE_MAP_ID (a vector map) the map
 * itself also turns so the direction of travel points up. Falls back to a dashed straight line without the Directions API.
 *   origin / destination  { lat, lng, heading?, speed? }
 *   onRoute({ distanceText, durationText, approx })
 */
export default function RouteMap({ origin, destination, onRoute, height = 300 }) {
  const el = useRef(null);
  const s = useRef({});            // map, rider, markers, polylines, route path, last positions
  const cb = useRef(onRoute);
  cb.current = onRoute;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // create the map once
  useEffect(() => {
    if (!mapsEnabled) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !el.current) return;
      s.current.map = new maps.Map(el.current, {
        center: origin || destination || { lat: 22.97, lng: 78.65 }, zoom: 14, streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
        gestureHandling: 'greedy', ...(MAP_ID && { mapId: MAP_ID, heading: 0, tilt: 0 }),
      });
      s.current.directions = new maps.DirectionsService();
      s.current.rider = createRider(maps, s.current.map);
      setReady(true);
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; s.current.rider?.setMap(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Works out which way the rider is facing and turns the rider (and, with a vector map, the map). */
  const orient = () => {
    const st = s.current;
    const here = st.here;
    if (!here || !st.rider) return;
    let deg = null;
    if (here.heading != null && !Number.isNaN(here.heading) && (here.speed == null || here.speed > 0.7)) deg = here.heading; // phone GPS, moving
    else if (st.prev && haversineKm(st.prev, here) * 1000 >= MOVE_FOR_HEADING_M) deg = bearing(st.prev, here);             // last movement
    else if (st.path) { const next = aheadOnRoute(st.path, here); if (next) deg = bearing(here, next); }                    // parked: face the road
    if (deg == null) deg = st.lastDeg ?? 0;
    st.lastDeg = deg;
    if (MAP_ID && st.map.getHeading) st.map.setHeading(deg); // heading-up navigation view
    st.rider.face(deg - (st.map.getHeading?.() || 0));
  };

  // rider and destination follow the live positions
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps;
    const st = s.current;
    if (origin) {
      if (!st.here || haversineKm(st.here, origin) * 1000 >= MOVE_FOR_HEADING_M) st.prev = st.here; // remember where he came from
      st.here = origin;
      st.rider.setPosition(origin);
      orient();
    }
    if (destination) {
      if (!st.dest) st.dest = new maps.Marker({ map: st.map, title: 'Customer site', zIndex: 2, label: { text: 'C', color: '#fff', fontWeight: '700' } });
      st.dest.setPosition(destination);
    } else if (st.dest) { st.dest.setMap(null); st.dest = null; }
  }, [ready, origin?.lat, origin?.lng, origin?.heading, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // route (re-computed only when it matters)
  useEffect(() => {
    if (!ready || !origin || !destination) return;
    const maps = window.google.maps;
    const st = s.current;
    const moved = st.routedFrom ? haversineKm(st.routedFrom, origin) * 1000 : Infinity;
    const sameDest = st.routedTo && st.routedTo.lat === destination.lat && st.routedTo.lng === destination.lng;
    if (sameDest && moved < REROUTE_METERS) return;
    if (sameDest && Date.now() - (st.routedAt || 0) < REROUTE_MIN_MS) return;
    st.routedFrom = origin; st.routedTo = destination; st.routedAt = Date.now();

    const draw = (path, dashed) => {
      st.line?.setMap(null);
      st.line = new maps.Polyline({
        map: st.map, path, strokeColor: '#1456d8', strokeOpacity: dashed ? 0 : 0.9, strokeWeight: 5,
        icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] : undefined,
      });
      st.path = path;
      const b = new maps.LatLngBounds();
      path.forEach((p) => b.extend(p));
      st.map.fitBounds(b, 50);
      orient(); // a parked rider now knows which road to face
    };

    st.directions.route({ origin: { lat: origin.lat, lng: origin.lng }, destination, travelMode: maps.TravelMode.DRIVING }, (res, status) => {
      if (status === 'OK' && res.routes[0]) {
        const leg = res.routes[0].legs[0];
        draw(res.routes[0].overview_path, false);
        cb.current?.({ distanceText: leg.distance.text, durationText: leg.duration.text, approx: false });
      } else {
        draw([{ lat: origin.lat, lng: origin.lng }, destination], true);
        const km = haversineKm(origin, destination);
        cb.current?.({ distanceText: km == null ? '' : `${km.toFixed(1)} km (straight line)`, durationText: '', approx: true });
      }
    });
  }, [ready, origin?.lat, origin?.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mapsEnabled) return <p className="rounded-xl border border-dashed p-4 text-sm text-neutral-500">Map unavailable — add VITE_GOOGLE_MAPS_API_KEY to frontend/.env.</p>;
  return (
    <div className="relative overflow-hidden" style={{ height }}>
      <div ref={el} className="h-full w-full" />
      {!ready && !error && <p className="absolute inset-0 grid place-items-center bg-neutral-50 text-sm text-neutral-500">Loading map...</p>}
      {error && <p className="absolute inset-0 grid place-items-center bg-neutral-50 p-4 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
