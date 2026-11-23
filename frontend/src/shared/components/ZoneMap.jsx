import { useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { INDIA_CENTER, loadGoogleMaps, mapsEnabled, toLatLng } from '@/shared/lib/googleMaps';

/**
 * Admin zone editor: click the map to add corner points, drag a point to move it, right-click a point to remove it.
 *   coordinates  [{ latitude, longitude }]
 *   onChange     (coordinates) => void
 *   others       other zones, drawn in grey for context
 */
export default function ZoneMap({ coordinates, onChange, others = [], height = 380 }) {
  const mapEl = useRef(null);
  const searchEl = useRef(null);
  const map = useRef(null);
  const polygon = useRef(null);
  const emit = useRef(onChange);
  emit.current = onChange;
  const [error, setError] = useState('');
  const [count, setCount] = useState(coordinates?.length || 0);

  const sync = () => {
    const path = polygon.current.getPath().getArray().map((p) => ({ latitude: p.lat(), longitude: p.lng() }));
    setCount(path.length);
    emit.current(path);
  };

  useEffect(() => {
    if (!mapsEnabled) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapEl.current) return;
      map.current = new maps.Map(mapEl.current, { center: INDIA_CENTER, zoom: 5, streetViewControl: false, gestureHandling: 'greedy' });
      others.forEach((z) => new maps.Polygon({ map: map.current, paths: z.coordinates.map(toLatLng), strokeColor: '#737373', strokeWeight: 1, fillColor: '#737373', fillOpacity: 0.12, clickable: false }));

      polygon.current = new maps.Polygon({ map: map.current, paths: (coordinates || []).map(toLatLng), editable: true, strokeColor: '#9333ea', strokeWeight: 2, fillColor: '#9333ea', fillOpacity: 0.3 });
      const path = polygon.current.getPath();
      ['set_at', 'insert_at', 'remove_at'].forEach((ev) => maps.event.addListener(path, ev, sync));
      maps.event.addListener(polygon.current, 'rightclick', (e) => { if (e.vertex != null) polygon.current.getPath().removeAt(e.vertex); });
      map.current.addListener('click', (e) => { polygon.current.getPath().push(e.latLng); });

      if (coordinates?.length >= 3) {
        const b = new maps.LatLngBounds();
        coordinates.forEach((c) => b.extend(toLatLng(c)));
        map.current.fitBounds(b);
      }
      if (searchEl.current) {
        const ac = new maps.places.Autocomplete(searchEl.current, { componentRestrictions: { country: 'in' }, fields: ['geometry'] });
        ac.addListener('place_changed', () => {
          const g = ac.getPlace()?.geometry;
          if (!g) return;
          if (g.viewport) map.current.fitBounds(g.viewport); else { map.current.setCenter(g.location); map.current.setZoom(14); }
        });
      }
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mapsEnabled) return <p className="rounded-xl border border-dashed p-4 text-sm text-neutral-500">Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env to draw zones on the map.</p>;
  return (
    <div className="space-y-2">
      <Input ref={searchEl} placeholder="Search a city or area to jump there" />
      <div className="overflow-hidden rounded-xl border" style={{ height }}><div ref={mapEl} className="h-full w-full" /></div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>{count} point{count === 1 ? '' : 's'} — click the map to add corners (need at least 3), drag to adjust, right-click a corner to delete.</span>
        <Button type="button" size="sm" variant="outline" disabled={!count} onClick={() => polygon.current.getPath().pop()}><Undo2 className="h-3.5 w-3.5" /> Undo point</Button>
        <Button type="button" size="sm" variant="outline" disabled={!count} onClick={() => polygon.current.getPath().clear()}><Eraser className="h-3.5 w-3.5" /> Clear</Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
