import { createContext, useContext, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('sf_user') || 'null'));

  const login = async (phone, password) => {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { phone, password } });
    localStorage.setItem('sf_token', token);
    localStorage.setItem('sf_user', JSON.stringify(user));
    setUser(user);
    return user;
  };
  const logout = () => {
    localStorage.removeItem('sf_token');
    localStorage.removeItem('sf_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}
