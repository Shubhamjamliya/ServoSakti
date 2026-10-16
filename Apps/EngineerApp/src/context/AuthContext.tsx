import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { registerPushToken, unregisterPushToken, listenForTokenRefresh } from '../services/push';

type User = { id: string; name: string; role: string } | null;
const Ctx = createContext<{ user: User; token: string | null; login: (phone: string, password: string) => Promise<void>; logout: () => void }>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setToken] = useState<string | null>(null);

  const login = async (phone: string, password: string) => {
    const res = await api('/auth/login', { method: 'POST', body: { phone, password } });
    setToken(res.token);
    setUser(res.user);
  };
  const logout = () => { unregisterPushToken(token); setUser(null); setToken(null); };

  // Save this device's push token once logged in and keep it fresh.
  useEffect(() => {
    if (!token) return undefined;
    registerPushToken(token);
    return listenForTokenRefresh(token);
  }, [token]);

  return <Ctx.Provider value={{ user, token, login, logout }}>{children}</Ctx.Provider>;
}
