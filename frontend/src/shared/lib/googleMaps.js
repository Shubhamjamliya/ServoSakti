// Single Google Maps JS loader shared by every map in the app (address picker, zone editor, live tracking).
// Key: VITE_GOOGLE_MAPS_API_KEY in frontend/.env  (enable Maps JavaScript, Places and Geocoding APIs).
export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
export const mapsEnabled = Boolean(MAPS_KEY);

let pending = null;

export function loadGoogleMaps() {
  if (!MAPS_KEY) return Promise.reject(new Error('Google Maps key is not configured (VITE_GOOGLE_MAPS_API_KEY)'));
  if (window.google?.maps?.places) return Promise.resolve(window.google.maps);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const cb = `__sfMapsReady${Date.now()}`;
    window[cb] = () => { delete window[cb]; resolve(window.google.maps); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places,geometry&callback=${cb}`;
    s.async = true;
    s.onerror = () => { pending = null; reject(new Error('Failed to load Google Maps')); };
    document.head.appendChild(s);
  });
  return pending;
}

export const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };

/** Turns a Geocoder result into the address fields the app stores. */
export function parsePlace(result, lat, lng) {
  const part = (type) => result?.address_components?.find((c) => c.types.includes(type))?.long_name || '';
  return {
    lat, lng,
    line: result?.formatted_address || '',
    city: part('locality') || part('administrative_area_level_3') || part('administrative_area_level_2'),
    state: part('administrative_area_level_1'),
    pincode: part('postal_code'),
  };
}

export const toLatLng = (c) => ({ lat: c.latitude, lng: c.longitude });
export const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const viewUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
