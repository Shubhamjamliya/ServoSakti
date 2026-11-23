/** Resolves to { lat, lng } from the browser's GPS, or rejects with a readable message. */
export const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Allow location access to continue')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

/** Great-circle distance in km between two { lat, lng } points (null if either is missing). */
export const haversineKm = (a, b) => {
  if (a?.lat == null || b?.lat == null) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
