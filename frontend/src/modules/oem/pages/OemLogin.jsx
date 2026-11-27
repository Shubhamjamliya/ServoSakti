import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Factory,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Tag,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

const CAPABILITIES = [
  { icon: Package, label: 'Brand Catalog', detail: 'Models, specs & warranty terms' },
  { icon: ShieldCheck, label: 'Warranty Claims', detail: 'Automated approvals & SLAs' },
  { icon: Factory, label: 'Service Network', detail: 'Pan-India authorized partners' },
];

const inputWrap =
  'flex h-11 sm:h-12 items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 transition focus-within:border-[#0066ff] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#0066ff]/10';
const primaryBtn =
  'flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0066ff] text-[14.5px] sm:text-[15px] font-bold text-white shadow-lg shadow-[#0066ff]/25 transition hover:bg-[#0052cc] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55';

function Field({ icon: Icon, label, required, className, ...props }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className={inputWrap}>
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          required={required}
          className="w-full bg-transparent pl-2.5 text-[13.5px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
          {...props}
        />
      </div>
    </div>
  );
}

export default function OemLogin() {
  const { user, login } = useAuth();
  const nav = useNavigate();

  // step: 'phone' | 'password' | 'onboarding' | 'done'
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Onboarding fields
  const [form, setForm] = useState({
    legalName: '',
    name: '',
    email: '',
    password: '',
    city: '',
    gstin: '',
    address: '',
    brands: '',
  });
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user?.role === 'oem') {
    return <Navigate to="/oem" replace />;
  }

  const setField = (key) => (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const checkPhone = async (e) => {
    e.preventDefault();
    const clean = phone.replace(/\D/g, '');
    if (clean.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { exists } = await api('/auth/check-account', {
        method: 'POST',
        body: { role: 'oem', phone: clean },
      });
      setStep(exists ? 'password' : 'onboarding');
    } catch (err) {
      setError(err.message || 'Could not verify mobile number');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login('oem', { phone: phone.trim(), password });
      nav('/oem', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid phone or password');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.legalName.trim() || !form.name.trim() || !form.city.trim() || !list(form.brands).length) {
      setError('Company name, owner name, city, and at least one brand are required');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api('/auth/register-company', {
        method: 'POST',
        body: {
          type: 'oem',
          owner: {
            name: form.name.trim(),
            phone,
            email: form.email.trim() || undefined,
            password: form.password,
          },
          company: {
            legalName: form.legalName.trim(),
            city: form.city.trim(),
            address: form.address.trim() || undefined,
            gstin: form.gstin.trim() || undefined,
            phone,
            email: form.email.trim() || undefined,
            authorizedBrands: list(form.brands),
          },
        },
      });
      setDoneMessage(res.message || 'Registration received. You can log in after admin approval.');
      setStep('done');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const resetToPhone = () => {
    setStep('phone');
    setPassword('');
    setError('');
  };

  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] lg:grid lg:grid-cols-12 font-['Plus_Jakarta_Sans','Inter',sans-serif]">
      {/* Left Editorial Hero Panel (Desktop) */}
      <div className="relative hidden overflow-hidden bg-[#071124] lg:col-span-7 lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
        <img
          src="/images/oem-login-hero.jpg"
          alt="Industrial OEM equipment manufacturing and quality diagnostics"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-55 scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#050d1d] via-[#081734]/80 to-[#0044b8]/35" />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }}
        />

        {/* Top Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <img
            src="/images/aftenza-logo-white.png"
            alt="Aftenza"
            className="h-9 w-auto object-contain"
          />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            OEM Partner Network
          </span>
        </div>

        {/* Bottom Copy & Capability Cards */}
        <div className="relative z-10 max-w-xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            Manufacturer Console
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-white xl:text-[44px]">
            Field service for your brand,
            <span className="block text-sky-400">without the headcount.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">
            Manage product catalogs, track warranty claims, oversee authorized service partners, and monitor SLA performance in real time.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3.5">
            {CAPABILITIES.map(({ icon: Icon, label, detail }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/12 bg-white/[0.07] p-3.5 backdrop-blur-md"
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#0066ff]/25 text-sky-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-[13px] font-bold text-white">{label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-300/85">{detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="relative flex min-h-screen flex-col justify-center bg-gradient-to-b from-[#f4f8ff] via-[#f8fafc] to-[#eef4ff] px-5 py-8 sm:px-8 lg:col-span-5 lg:px-10 xl:px-12">
        <div className={cn('mx-auto w-full', step === 'onboarding' ? 'max-w-[480px]' : 'max-w-[420px]')}>
          {/* Same Aftenza logo used in Customer, Engineer & Admin login */}
          <div className="mb-6 flex flex-col items-center text-center">
            <img
              src="/images/aftenza-logo-dark.png"
              alt="Aftenza"
              className="h-auto w-[210px] object-contain sm:w-[230px]"
            />
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e8f0fe] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#0066ff]">
              <Factory className="h-3.5 w-3.5" /> OEM Portal
            </span>
          </div>

          <div className="sf-rise rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.08)] sm:p-8">
            {/* STEP 1: Mobile Number */}
            {step === 'phone' && (
              <form onSubmit={checkPhone} className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                    OEM Sign in
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter your registered mobile number. New here? We&apos;ll set up your OEM account next.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Mobile Number
                  </label>
                  <div className={inputWrap}>
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="pl-2.5 text-[14px] font-bold text-slate-600">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      autoFocus
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(e) => {
                        setError('');
                        setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                      }}
                      className="w-full bg-transparent pl-2 text-[14.5px] font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none"
                    />
                    {phone && (
                      <button
                        type="button"
                        onClick={() => setPhone('')}
                        aria-label="Clear phone"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <button type="submit" disabled={phone.length !== 10 || loading} className={primaryBtn}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking...
                    </>
                  ) : (
                    <>
                      Continue <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: Password */}
            {step === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <button
                  type="button"
                  onClick={resetToPhone}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0066ff] hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change phone number
                </button>

                <div>
                  <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                    Welcome back
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter the password for <span className="font-bold text-slate-900">+91 {phone}</span>
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Password
                  </label>
                  <div className={inputWrap}>
                    <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      autoFocus
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setError('');
                        setPassword(e.target.value);
                      }}
                      className="w-full bg-transparent pl-2.5 pr-2 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="text-slate-400 transition hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <button type="submit" disabled={loading} className={primaryBtn}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
                    </>
                  ) : (
                    <>
                      Sign in to OEM Portal <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 3: New OEM Onboarding */}
            {step === 'onboarding' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <button
                  type="button"
                  onClick={resetToPhone}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0066ff] hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Use a different number
                </button>

                <div>
                  <h2 className="text-[21px] font-extrabold tracking-tight text-slate-900">
                    OEM Onboarding
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">
                    Register your brand for +91 <span className="font-bold text-slate-800">{phone}</span>. Accounts activate after admin verification.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    className="sm:col-span-2"
                    icon={Building2}
                    label="Company / Legal Name"
                    required
                    autoFocus
                    placeholder="e.g. Aftenza Power Systems Pvt Ltd"
                    value={form.legalName}
                    onChange={setField('legalName')}
                  />
                  <Field
                    icon={User}
                    label="Owner Name"
                    required
                    placeholder="e.g. Rajesh Verma"
                    value={form.name}
                    onChange={setField('name')}
                  />
                  <Field
                    icon={Mail}
                    label="Email"
                    type="email"
                    placeholder="ops@brand.com"
                    value={form.email}
                    onChange={setField('email')}
                  />
                  <div>
                    <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className={inputWrap}>
                      <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="Min 6 chars"
                        value={form.password}
                        onChange={setField('password')}
                        className="w-full bg-transparent pl-2.5 pr-1 text-[13.5px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((v) => !v)}
                        className="text-slate-400 hover:text-slate-700"
                        aria-label="Toggle password"
                      >
                        {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Field
                    icon={MapPin}
                    label="City"
                    required
                    placeholder="e.g. Pune"
                    value={form.city}
                    onChange={setField('city')}
                  />
                  <Field
                    icon={ShieldCheck}
                    label="GSTIN"
                    placeholder="Optional"
                    value={form.gstin}
                    onChange={setField('gstin')}
                  />
                  <Field
                    icon={MapPin}
                    label="Address"
                    placeholder="Registered office address"
                    value={form.address}
                    onChange={setField('address')}
                  />
                  <Field
                    className="sm:col-span-2"
                    icon={Tag}
                    label="Your Brands (comma separated)"
                    required
                    placeholder="e.g. ServoShakti, VoltMax"
                    value={form.brands}
                    onChange={setField('brands')}
                  />
                </div>

                {error && (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <button type="submit" disabled={loading} className={primaryBtn}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating OEM account...
                    </>
                  ) : (
                    <>
                      Submit for Approval <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 4: Registration Submitted */}
            {step === 'done' && (
              <div className="space-y-4 py-3 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </span>
                <h2 className="text-[21px] font-extrabold tracking-tight text-slate-900">
                  Application Received
                </h2>
                <p className="text-[13.5px] leading-relaxed text-slate-600">{doneMessage}</p>
                <button type="button" onClick={resetToPhone} className={primaryBtn}>
                  Back to Login
                </button>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-[11.5px] text-slate-400">
            Aftenza OEM Partner Network · Verified manufacturer access
          </p>
        </div>
      </div>
    </div>
  );
}
