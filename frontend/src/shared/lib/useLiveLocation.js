import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

const SYNC_EVERY_MS = 30000;

/**
 * Watches the device GPS. status: 'pending' (asking) | 'granted' | 'denied' | 'unsupported'.
 * With `sync`, the position is also saved on the engineer's profile (at most every 30 s) so the service company's
 * tracking map and dispatch distance checks use a fresh location.
 */
export function useLiveLocation({ sync = false } = {}) {
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState('pending');
  const lastSync = useRef(0);
  const watch = useRef(null);
  const hasFix = useRef(false); // a position was received at least once (read inside the GPS callbacks, so a ref)

  const start = useCallback(() => {
    if (!navigator.geolocation) { setStatus('unsupported'); return; }
    setStatus('pending');
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        // heading (degrees from north) and speed (m/s) come from the phone's GPS while moving; null otherwise
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed };
        hasFix.current = true;
        setPos(next);
        setStatus('granted');
        if (sync && Date.now() - lastSync.current > SYNC_EVERY_MS) {
          lastSync.current = Date.now();
          api('/engineers/me', { method: 'PATCH', body: { location: { lat: next.lat, lng: next.lng } } }).catch(() => {});
        }
      },
      // permission refused → denied; a timeout / signal loss keeps the last known position instead of flashing "denied"
      (err) => setStatus(err.code === 1 ? 'denied' : hasFix.current ? 'granted' : 'denied'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }, [sync]);

  useEffect(() => {
    start();
    return () => { if (watch.current != null) navigator.geolocation?.clearWatch(watch.current); };
  }, [start]);

  return { pos, status, retry: start };
}
