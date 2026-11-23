import { useEffect, useRef } from 'react';
import { INDIA_CENTER, loadGoogleMaps, mapsEnabled, toLatLng } from '@/shared/lib/googleMaps';

/** Live map of engineers' last known locations (from Day Start / check-in), with the service zones underneath. */
export default function EngineersMap({ engineers = [], zones = [], height = 320 }) {
  const el = useRef(null);
  const state = useRef({});

  useEffect(() => {
    if (!mapsEnabled) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !el.current) return;
      const map = (state.current.map ||= new maps.Map(el.current, { center: INDIA_CENTER, zoom: 5, streetViewControl: false, mapTypeControl: false }));
      (state.current.overlays || []).forEach((o) => o.setMap(null));
      const bounds = new maps.LatLngBounds();
      const overlays = [];
      zones.forEach((z) => overlays.push(new maps.Polygon({ map, paths: z.coordinates.map(toLatLng), strokeColor: '#16a34a', strokeWeight: 1, fillColor: '#16a34a', fillOpacity: 0.07, clickable: false })));
      const info = (state.current.info ||= new maps.InfoWindow());
      engineers.filter((e) => e.location?.lat != null).forEach((e) => {
        const pos = { lat: e.location.lat, lng: e.location.lng };
        const m = new maps.Marker({ map, position: pos, title: e.name, label: { text: (e.name || '?')[0], color: '#fff' } });
        m.addListener('click', () => { info.setContent(`<b>${e.name}</b><br/>${e.dayStatus || ''} · ${e.openCalls || 0} open call(s)`); info.open(map, m); });
        overlays.push(m);
        bounds.extend(pos);
      });
      state.current.overlays = overlays;
      if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [engineers, zones]);

  if (!mapsEnabled) return null;
  return <div className="overflow-hidden rounded-xl border" style={{ height }}><div ref={el} className="h-full w-full" /></div>;
}
