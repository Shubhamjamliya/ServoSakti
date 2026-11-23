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

  const start = useCallback(() => {
    if (!navigator.geolocation) { setStatus('unsupported'); return; }
    setStatus('pending');
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(next);
        setStatus('granted');
        if (sync && Date.now() - lastSync.current > SYNC_EVERY_MS) {
          lastSync.current = Date.now();
          api('/engineers/me', { method: 'PATCH', body: { location: { lat: next.lat, lng: next.lng } } }).catch(() => {});
        }
      },
      (err) => setStatus(err.code === 1 ? 'denied' : pos ? 'granted' : 'denied'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }, [sync]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    start();
    return () => { if (watch.current != null) navigator.geolocation?.clearWatch(watch.current); };
  }, [start]);

  return { pos, status, retry: start };
}
