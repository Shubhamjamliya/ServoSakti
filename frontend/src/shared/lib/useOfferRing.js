import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api';
import { getSession, roleFromPath } from '../constants/authRoles';

/**
 * Rings like a phone while a job offer is waiting (engineer: call offers; service company: partner requests), and
 * plays a short chime for a new assignment / new call. Offers are re-checked on every live notification and every
 * 15 s as a fallback, so the ring stops by itself once the offer is accepted, declined or expires.
 * The tone is generated with Web Audio (no sound file). Browsers only allow sound after the user has touched the page
 * once, so the audio unlocks on the first tap.
 */
const POLL_MS = 15000;
let ctx = null;
const audio = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

/** One "ring-ring": two short bursts of a 440 + 480 Hz dual tone (classic phone ring). */
function ringOnce(volume = 0.25) {
  const ac = audio();
  if (!ac || ac.state !== 'running') return;
  const burst = (start) => {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.03);
    gain.gain.setValueAtTime(volume, start + 0.38);
    gain.gain.linearRampToValueAtTime(0, start + 0.42);
    gain.connect(ac.destination);
    [440, 480].forEach((f) => {
      const o = ac.createOscillator();
      o.frequency.value = f;
      o.connect(gain);
      o.start(start);
      o.stop(start + 0.45);
    });
  };
  burst(ac.currentTime);
  burst(ac.currentTime + 0.6);
  navigator.vibrate?.([400, 200, 400]);
}

/** A soft two-note chime for "something new was assigned to you". */
function chime() {
  const ac = audio();
  if (!ac || ac.state !== 'running') return;
  [[880, 0], [1175, 0.18]].forEach(([f, t]) => {
    const g = ac.createGain();
    const o = ac.createOscillator();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.2, ac.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.5);
    o.connect(g); g.connect(ac.destination);
    o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.55);
  });
  navigator.vibrate?.(200);
}

export function useOfferRing({ enabled = true, offersPath = '/dispatch/offers' } = {}) {
  const [offers, setOffers] = useState([]);
  const [silenced, setSilenced] = useState(() => new Set());
  const [unlocked, setUnlocked] = useState(false);
  const live = useRef(true);

  const refresh = useCallback(() => {
    if (!enabled) return;
    api(offersPath).then((d) => live.current && setOffers(d.items || [])).catch(() => {});
  }, [enabled, offersPath]);

  // unlock audio on the first touch / click / key
  useEffect(() => {
    const unlock = () => { const ac = audio(); ac?.resume?.().then(() => setUnlocked(ac.state === 'running')); };
    ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, unlock, { once: false, passive: true }));
    return () => ['pointerdown', 'keydown'].forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  // live notifications + polling fallback
  useEffect(() => {
    live.current = true;
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const role = roleFromPath();
    const socket = io('/', { auth: { token: getSession(role).token } });
    socket.on('notification', (n) => {
      if (n?.type === 'offer') refresh();
      else if (['assignment', 'new_call'].includes(n?.type)) { chime(); window.dispatchEvent(new CustomEvent('sf:jobs-changed')); }
    });
    return () => { live.current = false; clearInterval(t); socket.disconnect(); };
  }, [enabled, refresh]);

  // ring every 3 s while an offer nobody silenced is waiting
  const waiting = offers.filter((o) => !silenced.has(String(o._id)));
  useEffect(() => {
    if (!waiting.length) return undefined;
    ringOnce();
    const t = setInterval(ringOnce, 3000);
    window.dispatchEvent(new CustomEvent('sf:jobs-changed'));
    return () => clearInterval(t);
  }, [waiting.length, unlocked]);

  const silence = () => setSilenced(new Set(offers.map((o) => String(o._id))));
  return { offers, waiting, silence, refresh, unlocked };
}
