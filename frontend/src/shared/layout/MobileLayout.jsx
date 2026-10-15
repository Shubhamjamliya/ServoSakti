import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function MobileLayout({ title, base, role, tabs }) {
  const { user, logout } = useAuth();
  if (user?.role !== role) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen bg-slate-200 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-xl relative">
        <header className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <span className="font-semibold">{title}</span>
          <button onClick={logout} className="text-xs text-slate-300">Logout</button>
        </header>
        <main className="flex-1 p-4 pb-20"><Outlet /></main>
        <nav className="fixed bottom-0 w-full max-w-md bg-white border-t flex">
          {tabs.map(([to, label]) => (
            <NavLink key={to} to={`${base}/${to}`}
              className={({ isActive }) => `flex-1 text-center text-xs py-3 ${isActive ? 'text-slate-900 font-semibold border-t-2 border-slate-900' : 'text-slate-500'}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
