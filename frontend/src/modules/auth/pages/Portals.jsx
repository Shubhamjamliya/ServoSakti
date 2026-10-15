import { Link } from 'react-router-dom';
import BrandMark, { useBrand } from '@/shared/components/BrandMark';
import { AUTH_ROLES } from '@/shared/constants/authRoles';

/** Landing page at /login and /register: pick which portal to enter. */
export default function Portals({ mode = 'login' }) {
  const brand = useBrand('admin');
  const entries = Object.values(AUTH_ROLES).filter((r) => mode === 'login' || r.register);
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-100 px-4">
      <div className="sf-rise w-full max-w-sm space-y-6 rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-3">
          <BrandMark role="admin" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">{mode === 'login' ? 'Choose your portal' : 'Create an account as'}</h1>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">{brand.name} FieldForce</p>
          </div>
        </div>
        <div className="space-y-2">
          {entries.map((r) => (
            <Link key={r.role} to={`${r.base}/${mode}`} className="block rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium hover:border-primary hover:bg-neutral-50">{r.label}</Link>
          ))}
        </div>
        <p className="text-center text-sm text-neutral-500">
          {mode === 'login' ? <>New here? <Link to="/register" className="text-primary underline">Create an account</Link></> : <>Already registered? <Link to="/login" className="text-primary underline">Log in</Link></>}
        </p>
      </div>
    </div>
  );
}
