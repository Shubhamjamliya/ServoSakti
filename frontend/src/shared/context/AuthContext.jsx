import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { clearSession, getSession, roleFromPath, setSession } from '../constants/authRoles.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

/** `user` is the signed-in account for the portal in the URL; other portals' sessions are left alone. */
export function AuthProvider({ children }) {
  const { pathname } = useLocation();
  const role = roleFromPath(pathname);
  const [, bump] = useState(0);
  const user = getSession(role).user;

  // Another tab logging in/out of this same portal changes storage; re-render to match.
  useEffect(() => {
    const onStorage = (e) => { if (e.key?.endsWith(`_${role}`)) bump((n) => n + 1); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [role]);

  const login = useCallback(async (loginRole, credentials) => {
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { role: loginRole, ...credentials } });
    setSession(loginRole, token, u);
    bump((n) => n + 1);
    return u;
  }, []);

  const verifyOtp = useCallback(async (loginRole, phone, otp) => {
    const res = await api('/auth/verify-otp', { method: 'POST', body: { role: loginRole, phone, otp } });
    if (res.isNew) return { isNew: true, signupToken: res.signupToken }; // verified number with no account yet: onboarding
    setSession(loginRole, res.token, res.user);
    bump((n) => n + 1);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearSession(role);
    bump((n) => n + 1);
  }, [role]);

  return <AuthContext.Provider value={{ user, login, verifyOtp, logout }}>{children}</AuthContext.Provider>;
}
