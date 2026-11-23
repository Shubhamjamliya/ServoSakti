import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, mapsEnabled } from '@/shared/lib/googleMaps';
import { haversineKm } from '@/shared/lib/geo';

const REROUTE_METERS = 150;   // re-request the route only after moving this far
const REROUTE_MIN_MS = 45000; // ...and not more often than this (Directions calls are billed)

/**
 * Map with the engineer's live position, the customer's site and a road-following route between them.
 * Falls back to a dashed straight line if the Directions API is not enabled for the key.
 *   origin / destination  { lat, lng }
 *   onRoute({ distanceText, durationText, approx })
 */
export default function RouteMap({ origin, destination, onRoute, height = 300 }) {
  const el = useRef(null);
  const s = useRef({});            // map, markers, polylines, last routed origin
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
      s.current.map = new maps.Map(el.current, { center: origin || destination || { lat: 22.97, lng: 78.65 }, zoom: 14, streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: 'greedy' });
      s.current.directions = new maps.DirectionsService();
      setReady(true);
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // markers follow the engineer / destination
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps;
    const st = s.current;
    if (origin) {
      if (!st.me) st.me = new maps.Marker({ map: st.map, title: 'You', zIndex: 3, icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2563eb', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
      st.me.setPosition(origin);
    }
    if (destination) {
      if (!st.dest) st.dest = new maps.Marker({ map: st.map, title: 'Customer site', zIndex: 2, label: { text: 'C', color: '#fff', fontWeight: '700' } });
      st.dest.setPosition(destination);
    } else if (st.dest) { st.dest.setMap(null); st.dest = null; }
  }, [ready, origin?.lat, origin?.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

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
        map: st.map, path, strokeColor: '#2563eb', strokeOpacity: dashed ? 0 : 0.9, strokeWeight: 5,
        icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] : undefined,
      });
      const b = new maps.LatLngBounds();
      path.forEach((p) => b.extend(p));
      st.map.fitBounds(b, 50);
    };

    st.directions.route({ origin, destination, travelMode: maps.TravelMode.DRIVING }, (res, status) => {
      if (status === 'OK' && res.routes[0]) {
        const leg = res.routes[0].legs[0];
        draw(res.routes[0].overview_path, false);
        cb.current?.({ distanceText: leg.distance.text, durationText: leg.duration.text, approx: false });
      } else {
        draw([origin, destination], true);
        const km = haversineKm(origin, destination);
        cb.current?.({ distanceText: km == null ? '' : `${km.toFixed(1)} km (straight line)`, durationText: '', approx: true });
      }
    });
  }, [ready, origin?.lat, origin?.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mapsEnabled) return <p className="rounded-xl border border-dashed p-4 text-sm text-neutral-500">Map unavailable — add VITE_GOOGLE_MAPS_API_KEY to frontend/.env.</p>;
  return (
    <div className="relative overflow-hidden rounded-2xl border" style={{ height }}>
      <div ref={el} className="h-full w-full" />
      {!ready && !error && <p className="absolute inset-0 grid place-items-center bg-neutral-50 text-sm text-neutral-500">Loading map...</p>}
      {error && <p className="absolute inset-0 grid place-items-center bg-neutral-50 p-4 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
