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
