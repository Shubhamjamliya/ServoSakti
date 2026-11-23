import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { api } from '@/shared/lib/api';
import { INDIA_CENTER, loadGoogleMaps, mapsEnabled, parsePlace, toLatLng } from '@/shared/lib/googleMaps';

/**
 * Address picker (search box + draggable pin + "use my location"), with a live "do we serve here?" check
 * against the admin's service zones — the same pattern as OyeChotuu's location selector.
 *
 *   value   { lat, lng } of the current pin, or null
 *   onPick  ({ lat, lng, line, city, state, pincode }) => void   (called on search, tap, drag and GPS)
 */
export default function MapPicker({ value, onPick, height = 260 }) {
  const mapEl = useRef(null);
  const searchEl = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const geocoder = useRef(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [zone, setZone] = useState(null); // { status, zone }

  const checkZone = async (lat, lng) => {
    try { setZone(await api(`/zones/detect?lat=${lat}&lng=${lng}`)); } catch { setZone(null); }
  };

  const place = (lat, lng, geocode = true) => {
    marker.current?.setPosition({ lat, lng });
    map.current?.panTo({ lat, lng });
    checkZone(lat, lng);
    if (geocode && geocoder.current) {
      geocoder.current.geocode({ location: { lat, lng } }, (results, status) => pick.current(parsePlace(status === 'OK' ? results[0] : null, lat, lng)));
    } else pick.current({ lat, lng, line: '', city: '', state: '', pincode: '' });
  };

  useEffect(() => {
    if (!mapsEnabled) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapEl.current) return;
      const start = value?.lat != null ? { lat: value.lat, lng: value.lng } : INDIA_CENTER;
      map.current = new maps.Map(mapEl.current, { center: start, zoom: value?.lat != null ? 16 : 5, streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: 'greedy' });
      marker.current = new maps.Marker({ map: map.current, position: start, draggable: true, visible: value?.lat != null });
      geocoder.current = new maps.Geocoder();

      // draw the admin's service zones so customers can see the coverage
      api('/zones/public').then(({ items }) => {
        items.forEach((z) => new maps.Polygon({ map: map.current, paths: z.coordinates.map(toLatLng), strokeColor: '#16a34a', strokeWeight: 1.5, fillColor: '#16a34a', fillOpacity: 0.08, clickable: false }));
      }).catch(() => {});

      map.current.addListener('click', (e) => { marker.current.setVisible(true); place(e.latLng.lat(), e.latLng.lng()); });
      marker.current.addListener('dragend', (e) => place(e.latLng.lat(), e.latLng.lng()));

      if (searchEl.current) {
        const ac = new maps.places.Autocomplete(searchEl.current, { componentRestrictions: { country: 'in' }, fields: ['geometry', 'formatted_address', 'address_components'] });
        ac.addListener('place_changed', () => {
          const p = ac.getPlace();
          if (!p?.geometry) return;
          const lat = p.geometry.location.lat();
          const lng = p.geometry.location.lng();
          marker.current.setVisible(true);
          map.current.setZoom(16);
          marker.current.setPosition({ lat, lng });
          map.current.panTo({ lat, lng });
          checkZone(lat, lng);
          pick.current(parsePlace(p, lat, lng));
        });
      }
      if (value?.lat != null) checkZone(value.lat, value.lng);
      setReady(true);
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker position when external value changes (e.g. editing an existing address)
  useEffect(() => {
    if (!ready || value?.lat == null || !marker.current || !map.current) return;
    const pos = { lat: Number(value.lat), lng: Number(value.lng) };
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return;
    marker.current.setPosition(pos);
    marker.current.setVisible(true);
    map.current.panTo(pos);
    checkZone(pos.lat, pos.lng);
  }, [value?.lat, value?.lng, ready]);

  const locate = () => {
    if (!navigator.geolocation) return setError('Location is not supported on this device');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setError('');
        marker.current?.setVisible(true);
        map.current?.setZoom(16);
        place(pos.coords.latitude, pos.coords.longitude);
        if (!mapsEnabled) checkZone(pos.coords.latitude, pos.coords.longitude);
      },
      () => setError('Could not get your location. Allow location access or search for the address.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const status = zone?.status;
  return (
    <div className="space-y-2">
      {mapsEnabled && <Input ref={searchEl} placeholder="Search your address, area or landmark" />}
      {mapsEnabled ? (
        <div className="relative overflow-hidden rounded-xl border" style={{ height }}>
          <div ref={mapEl} className="h-full w-full" />
          {!ready && !error && <p className="absolute inset-0 grid place-items-center bg-neutral-50 text-sm text-neutral-500">Loading map...</p>}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-xs text-neutral-500">Map search is off (no Google Maps key). Use "Use my current location" and type the address below.</p>
      )}
      <Button type="button" variant="outline" size="sm" onClick={locate}><LocateFixed className="h-4 w-4" /> Use my current location</Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {status === 'IN_SERVICE' && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">We serve this location — zone: {zone.zone.name}</p>}
      {status === 'OUT_OF_SERVICE' && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">Sorry, we do not serve this location yet.</p>}
    </div>
  );
}
