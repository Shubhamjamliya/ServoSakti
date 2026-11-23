import { clearSession, getSession, loginPath, roleFromPath } from '../constants/authRoles.js';

const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const role = roleFromPath();
  const { token } = getSession(role);
  const res = await fetch(BASE + path, {
    method,
    // FormData sets its own multipart boundary header
    headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    // session expired or account deactivated
    clearSession(role);
    window.location.assign(loginPath(role));
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/** Downloads a protected file (e.g. a CSV export) with the logged-in session's token. */
export async function downloadFile(path, filename) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getSession(roleFromPath()).token}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

export const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && v !== 'all' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Uploads images/PDFs and resolves to their URLs. */
export async function uploadFiles(files) {
  const form = new FormData();
  [...files].forEach((f) => form.append('files', f));
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${getSession(roleFromPath()).token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data.urls;
}
