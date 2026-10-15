import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PanelLayout({ title, base, links, role }) {
  const { user, logout } = useAuth();
  if (user?.role !== role) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="w-60 bg-slate-900 text-slate-200 p-4 space-y-1">
        <h1 className="text-lg font-semibold mb-4">{title}</h1>
        {links.map(([to, label]) => (
          <NavLink key={to} to={`${base}/${to}`} className={({ isActive }) => `block rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-700' : 'hover:bg-slate-800'}`}>
            {label}
          </NavLink>
        ))}
      </aside>
      <div className="flex-1">
        <header className="flex justify-between items-center bg-white border-b px-6 py-3">
          <span className="text-sm text-slate-500">{user?.name}</span>
          <button onClick={logout} className="text-sm text-red-600">Logout</button>
        </header>
        <main className="p-6"><Outlet /></main>
      </div>
    </div>
  );
}
