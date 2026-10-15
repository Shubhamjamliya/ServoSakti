import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { api } from '@/shared/lib/api';
import BrandMark, { useBrand } from '@/shared/components/BrandMark';
import { AUTH_ROLES, setSession } from '@/shared/constants/authRoles';

const TYPE_BY_PORTAL = { customer: 'customer', vendor: 'vendor', oem: 'oem', engineer: 'engineer' };

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function F({ id, label, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

export default function Register({ portal }) {
  const cfg = AUTH_ROLES[portal];
  const type = TYPE_BY_PORTAL[portal];
  const brand = useBrand(cfg.role);
  const nav = useNavigate();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isCompany = type === 'vendor' || type === 'oem';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const owner = { name: f.name, phone: f.phone, email: f.email, password: f.password };
    try {
      if (type === 'customer') {
        const { token, user } = await api('/auth/register-customer', { method: 'POST', body: owner });
        setSession('customer', token, user);
        window.location.assign('/customer'); // reload so AuthContext picks up the new session
        return;
      }
      if (isCompany) {
        const res = await api('/auth/register-company', {
          method: 'POST',
          body: { type, owner, company: { legalName: f.legalName, city: f.city, address: f.address, gstin: f.gstin, phone: f.phone, email: f.email, authorizedBrands: list(f.brands), serviceAreas: list(f.areas) } },
        });
        setDone(res.message);
      } else {
        const res = await api('/auth/register-engineer', {
          method: 'POST',
          body: { ...owner, city: f.city, skills: list(f.skills), certifications: list(f.brands).map((brand) => ({ brand })), serviceTerritories: list(f.areas) },
        });
        setDone(res.message);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-100 px-4 py-10">
      <div className="sf-rise w-full max-w-lg space-y-6 rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-3">
          <BrandMark role={cfg.role} />
          <div><h1 className="text-lg font-semibold leading-tight">{cfg.label} sign up</h1><p className="text-[10px] uppercase tracking-wider text-neutral-500">{brand.name} FieldForce</p></div>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <p className="text-sm text-neutral-700">{done}</p>
            <Button className="w-full" onClick={() => nav(`${cfg.base}/login`)}>Back to login</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            {isCompany && <div className="sm:col-span-2"><F id="legalName" label="Company / legal name" required value={f.legalName || ''} onChange={set('legalName')} /></div>}
            <F id="name" label={isCompany ? 'Owner name' : 'Full name'} required value={f.name || ''} onChange={set('name')} />
            <F id="phone" label="Mobile number (OTP login)" required inputMode="numeric" maxLength={10} placeholder="10 digits" value={f.phone || ''} onChange={set('phone')} />
            <F id="email" label="Email" type="email" value={f.email || ''} onChange={set('email')} />
            {!cfg.otp && <F id="password" label="Password" type="password" required minLength={6} value={f.password || ''} onChange={set('password')} />}
            {type !== 'customer' && <F id="city" label="City" required value={f.city || ''} onChange={set('city')} />}
            {isCompany && <F id="gstin" label="GSTIN" value={f.gstin || ''} onChange={set('gstin')} />}
            {isCompany && <div className="sm:col-span-2"><F id="address" label="Address" value={f.address || ''} onChange={set('address')} /></div>}
            {type !== 'customer' && <div className="sm:col-span-2"><F id="brands" label={type === 'oem' ? 'Your brands' : 'Brands you are certified for'} placeholder="Comma separated" required value={f.brands || ''} onChange={set('brands')} /></div>}
            {(type === 'vendor' || type === 'engineer') && <div className="sm:col-span-2"><F id="areas" label="Service cities / territories" placeholder="Comma separated" value={f.areas || ''} onChange={set('areas')} /></div>}
            {type === 'engineer' && <div className="sm:col-span-2"><F id="skills" label="Skills" placeholder="e.g. drives, UPS, PLC" value={f.skills || ''} onChange={set('skills')} /></div>}
            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
            {type !== 'customer' && <p className="text-xs text-neutral-500 sm:col-span-2">Accounts are activated after Servoshakti verifies your KYC and details.</p>}
            <Button className="sm:col-span-2" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</Button>
          </form>
        )}
        <p className="text-center text-sm text-neutral-500">Already registered? <Link to={`${cfg.base}/login`} className="text-primary underline">Log in</Link></p>
      </div>
    </div>
  );
}
