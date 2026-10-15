// Android emulator reaches the host at 10.0.2.2; web uses localhost
export const API_URL = 'http://10.0.2.2:5000/api';

export async function api(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}) {
  const res = await fetch(API_URL + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}
