import React, { createContext, useContext, useState } from 'react';
import { api } from '../services/api';

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
  const logout = () => { setUser(null); setToken(null); };

  return <Ctx.Provider value={{ user, token, login, logout }}>{children}</Ctx.Provider>;
}
