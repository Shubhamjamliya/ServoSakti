// One entry per account type. Each gets its own /<base>/login (and /<base>/register where self sign-up exists).
export const AUTH_ROLES = {
  admin: { role: 'admin', base: '/admin', label: 'Admin', identifier: 'email', register: false },
  oem: { role: 'oem', base: '/oem', label: 'OEM', identifier: 'phone', register: true },
  vendor: { role: 'vendor_owner', base: '/vendor', label: 'Service Company', identifier: 'phone', register: true, otp: true },
  engineer: { role: 'engineer', base: '/engineer', label: 'Engineer', identifier: 'phone', register: true, otp: true },
  customer: { role: 'customer', base: '/customer', label: 'Customer', identifier: 'phone', register: true, otp: true },
};

const byRole = Object.values(AUTH_ROLES).reduce((m, r) => ({ ...m, [r.role]: r }), {});

export const homePath = (role) => byRole[role]?.base || '/login';
export const loginPath = (role) => (byRole[role] ? `${byRole[role].base}/login` : '/login');

// ---- Sessions: one per role, so logging into another portal (e.g. in a second tab) never logs this one out. ----
/** The role whose portal the URL belongs to (/oem/... -> 'oem'), or null on /login, /register. */
export const roleFromPath = (pathname = window.location.pathname) =>
  Object.values(AUTH_ROLES).find((r) => pathname === r.base || pathname.startsWith(`${r.base}/`))?.role || null;

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
export const getSession = (role) => {
  if (!role) return { token: null, user: null };
  let user = null;
  try { user = JSON.parse(read(`sf_user_${role}`) || 'null'); } catch { /* corrupt entry */ }
  return { token: read(`sf_token_${role}`), user };
};
export const setSession = (role, token, user) => {
  localStorage.setItem(`sf_token_${role}`, token);
  localStorage.setItem(`sf_user_${role}`, JSON.stringify(user));
};
export const clearSession = (role) => {
  if (!role) return;
  localStorage.removeItem(`sf_token_${role}`);
  localStorage.removeItem(`sf_user_${role}`);
};
