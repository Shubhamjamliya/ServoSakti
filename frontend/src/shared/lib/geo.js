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
