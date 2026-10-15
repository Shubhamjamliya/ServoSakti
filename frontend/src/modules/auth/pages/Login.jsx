import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/context/AuthContext.jsx';

const HOME = { admin: '/admin', oem: '/oem', vendor_owner: '/vendor', engineer: '/engineer', customer: '/customer' };

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      const user = await login(phone, password);
      nav(HOME[user.role] || '/login');
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow w-80 space-y-4">
        <h1 className="text-xl font-semibold">Servoshakti FieldForce</h1>
        <input className="w-full border rounded px-3 py-2" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full bg-slate-900 text-white rounded py-2">Login</button>
      </form>
    </div>
  );
}
