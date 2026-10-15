import { useEffect, useState } from 'react';

// Company name + logos from Business Setup. One shared fetch; refreshBranding() re-reads after an edit.
let cache = null;
let inflight = null;
const listeners = new Set();
const BASE = import.meta.env.VITE_API_URL || '/api';

const apply = (b) => {
  cache = b;
  if (b?.companyName) document.title = b.companyName;
  if (b?.favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = b.favicon;
  }
  listeners.forEach((fn) => fn(b));
};

export function refreshBranding() {
  inflight = fetch(`${BASE}/branding`).then((r) => (r.ok ? r.json() : null)).then((b) => b && apply(b)).catch(() => {});
  return inflight;
}

/** Returns { companyName, logo, favicon, oemLogo, vendorLogo, engineerLogo, customerLogo } (null until loaded). */
export function useBranding() {
  const [b, setB] = useState(cache);
  useEffect(() => {
    listeners.add(setB);
    if (!cache && !inflight) refreshBranding();
    return () => listeners.delete(setB);
  }, []);
  return b;
}
