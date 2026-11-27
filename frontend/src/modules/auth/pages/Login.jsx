import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useAuth } from '@/shared/context/AuthContext';
import BrandMark, { useBrand } from '@/shared/components/BrandMark';
import { AUTH_ROLES } from '@/shared/constants/authRoles';
import Register from './Register';
import AdminLogin from '@/modules/admin/pages/AdminLogin';
import OemLogin from '@/modules/oem/pages/OemLogin';
import CustomerLogin from '@/modules/customer/pages/CustomerLogin';
import EngineerLogin from '@/modules/engineer/pages/EngineerLogin';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';

const OTP_LENGTH = 4;
const TAGLINE = {
  admin: 'Control tower for the whole service network',
  oem: 'Field service for your brand, without the headcount',
  vendor_owner: 'Calls, engineers and earnings in one place',
  engineer: 'Your day, your calls, your earnings',
  customer: 'Book and track equipment service in minutes',
};

function OtpBoxes({ value, onChange, autoFocus, disabled }) {
  const inputs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || '');

  const setDigit = (index, text) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) { onChange(value.slice(0, index) + value.slice(index + 1)); return; }
    const next = value.split('');
    clean.split('').forEach((c, i) => { next[index + i] = c; });
    onChange(next.join('').slice(0, OTP_LENGTH));
    inputs.current[Math.min(index + clean.length, OTP_LENGTH - 1)]?.focus();
  };

  const onKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1) + value.slice(index));
    }
  };

  return (
    <div className="flex justify-between">
      {digits.map((digit, index) => (
        <input
          key={index} ref={(el) => { inputs.current[index] = el; }} value={digit} disabled={disabled}
          onChange={(e) => setDigit(index, e.target.value)} onKeyDown={(e) => onKeyDown(index, e)}
          inputMode="numeric" maxLength={2} autoFocus={autoFocus && index === 0}
          autoComplete={index === 0 ? 'one-time-code' : 'off'} onFocus={(e) => e.target.select()} aria-label={`OTP digit ${index + 1}`}
          className={cn('h-14 w-14 rounded-xl border-[1.5px] bg-white text-center text-xl font-bold text-neutral-900 outline-none transition focus:ring-4 focus:ring-primary/15 disabled:opacity-60', digit ? 'border-primary' : 'border-neutral-300')}
        />
      ))}
    </div>
  );
}

/** Login for one account type, mounted at /<portal>/login. Customer, engineer and service company use a mobile OTP; admin and OEM a password. */
export default function Login({ portal }) {
  if (portal === 'admin') {
    return <AdminLogin />;
  }
  if (portal === 'oem') {
    return <OemLogin />;
  }
  if (portal === 'customer') {
    return <CustomerLogin />;
  }
  if (portal === 'engineer') return <EngineerLogin />;

  const cfg = AUTH_ROLES[portal];
  const { user, login, verifyOtp } = useAuth();
  const nav = useNavigate();
  const brand = useBrand(cfg.role);
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [onboarding, setOnboarding] = useState(null); // { phone, signupToken? } once we know the number is new
  const [pwStep, setPwStep] = useState('phone'); // OEM only: 'phone' | 'password'
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const byEmail = cfg.identifier === 'email';
  const phonePassword = !cfg.otp && !byEmail; // OEM: phone first, then password (existing) or onboarding (new)

  if (user?.role === cfg.role) return <Navigate to={cfg.base} replace />;
  if (onboarding) return <Register portal={portal} phone={onboarding.phone} signupToken={onboarding.signupToken} onBack={() => { setOnboarding(null); setStep('phone'); setPwStep('phone'); setOtp(''); setError(''); }} />;

  const run = async (fn) => {
    setError('');
    setLoading(true);
    try { await fn(); return true; } catch (err) { setError(err.message); return false; } finally { setLoading(false); }
  };

  const requestOtp = (e) => {
    e?.preventDefault();
    if (!/^\d{10}$/.test(id)) { setError('Enter a valid 10-digit mobile number'); return; }
    return run(async () => {
      const res = await api('/auth/send-otp', { method: 'POST', body: { role: cfg.role, phone: id } });
      setOtp('');
      setStep('otp');
    });
  };

  const verify = async (code) => {
    if (code.length !== OTP_LENGTH) { setError(`Enter the ${OTP_LENGTH}-digit OTP`); return; }
    const ok = await run(async () => {
      const res = await verifyOtp(cfg.role, id, code);
      if (res.isNew) setOnboarding({ phone: id, signupToken: res.signupToken });
      else nav(cfg.base, { replace: true });
    });
    if (!ok) setOtp('');
  };

  const checkPhone = (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(id)) { setError('Enter a valid 10-digit mobile number'); return; }
    return run(async () => {
      const { exists } = await api('/auth/check-account', { method: 'POST', body: { role: cfg.role, phone: id } });
      if (exists) setPwStep('password'); else setOnboarding({ phone: id });
    });
  };

  const passwordLogin = (e) => {
    e.preventDefault();
    return run(async () => { await login(cfg.role, { [cfg.identifier]: id.trim(), password }); nav(cfg.base, { replace: true }); });
  };

  const resetToPhone = () => { setStep('phone'); setOtp(''); setError(''); };

  const submitBtn = 'mt-6 h-12 w-full rounded-xl text-base font-bold';

  return (
    <div className="flex min-h-screen flex-col bg-sidebar">
      {/* Hero */}
      <div className="flex flex-col items-center px-6 pb-14 pt-10 sm:pt-16">
        {step === 'otp' && (
          <button type="button" onClick={resetToPhone} aria-label="Back" className="mb-4 flex h-9 w-9 items-center justify-center self-start rounded-full bg-white/10 sm:self-center sm:hidden">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
        )}
        <BrandMark role={cfg.role} className={cn('rounded-2xl text-3xl', step === 'otp' ? 'h-16 w-16' : 'h-20 w-20')} />
        {step !== 'otp' && (
          <>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">{brand.name}</h1>
            <p className="mt-1.5 text-center text-[13px] text-white/60">{TAGLINE[cfg.role]}</p>
          </>
        )}
      </div>

      {/* Sheet */}
      <div className="flex flex-1 flex-col rounded-t-3xl bg-background px-6 pb-10 pt-6">
        <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-neutral-300" />

        <div className="mx-auto w-full max-w-sm">
          {/* Password login (admin, OEM) */}
          {phonePassword && pwStep === 'phone' && (
            <form onSubmit={checkPhone}>
              <h2 className="text-[22px] font-extrabold text-neutral-900">{cfg.label} login</h2>
              <p className="mb-5 mt-1.5 text-sm text-neutral-500">Enter your mobile number. New here? We&apos;ll set up your account next.</p>
              <div className="flex gap-2">
                <div className="flex h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3.5">
                  <span className="text-[15px] font-bold text-neutral-900">🇮🇳 +91</span>
                </div>
                <Input type="tel" inputMode="numeric" placeholder="10-digit mobile number" maxLength={10} autoFocus autoComplete="tel-national"
                  value={id} onChange={(e) => { setError(''); setId(e.target.value.replace(/\D/g, '').slice(0, 10)); }} className="h-12 flex-1 rounded-xl bg-white" />
              </div>
              {error && <p className="mt-2.5 text-[13px] text-destructive">{error}</p>}
              <Button type="submit" className={submitBtn} disabled={id.length !== 10 || loading}>{loading ? 'Checking...' : 'Continue'}</Button>
            </form>
          )}

          {/* Password login (admin by email; OEM after its phone is found) */}
          {!cfg.otp && (!phonePassword || pwStep === 'password') && (
            <form onSubmit={passwordLogin}>
              <h2 className="text-[22px] font-extrabold text-neutral-900">{cfg.label} login</h2>
              <p className="mb-5 mt-1.5 text-sm text-neutral-500">{byEmail ? 'Sign in with your email and password' : <>Enter the password for <span className="font-bold text-neutral-900">+91 {id}</span></>}</p>
              {byEmail && <div className="relative mb-3">
                {byEmail && <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />}
                <Input
                  type={byEmail ? 'email' : 'tel'} inputMode={byEmail ? 'email' : 'numeric'} autoComplete="username" required
                  placeholder={byEmail ? 'Email address' : 'Phone number'} value={id} onChange={(e) => { setError(''); setId(e.target.value); }}
                  className={cn('h-12 rounded-xl bg-white', byEmail && 'pl-9')}
                />
              </div>}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Password" value={password} onChange={(e) => { setError(''); setPassword(e.target.value); }} className="h-12 rounded-xl bg-white pl-9 pr-11" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <p className="mt-2.5 text-[13px] text-destructive">{error}</p>}
              <Button type="submit" className={submitBtn} disabled={loading}>{loading ? 'Signing in...' : 'Login'}</Button>
              {phonePassword && <button type="button" onClick={() => { setPwStep('phone'); setPassword(''); setError(''); }} className="mt-3 w-full text-center text-sm font-semibold text-primary hover:underline">Change phone number</button>}
            </form>
          )}

          {/* Mobile OTP login: phone step */}
          {cfg.otp && step === 'phone' && (
            <form onSubmit={requestOtp}>
              <h2 className="text-[22px] font-extrabold text-neutral-900">Welcome</h2>
              <p className="mb-5 mt-1.5 text-sm text-neutral-500">Sign in with your mobile number. New here? We&apos;ll set up your account after verifying it.</p>
              <div className="flex gap-2">
                <div className="flex h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3.5">
                  <span className="text-[15px] font-bold text-neutral-900">🇮🇳 +91</span>
                </div>
                <Input
                  type="tel" inputMode="numeric" placeholder="10-digit mobile number" maxLength={10} autoFocus autoComplete="tel-national"
                  value={id} onChange={(e) => { setError(''); setId(e.target.value.replace(/\D/g, '').slice(0, 10)); }}
                  className="h-12 flex-1 rounded-xl bg-white"
                />
              </div>
              {error && <p className="mt-2.5 text-[13px] text-destructive">{error}</p>}
              <Button type="submit" className={submitBtn} disabled={id.length !== 10 || loading}>{loading ? 'Sending OTP...' : 'Send OTP'}</Button>
              <div className="mt-4 flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-[11px] text-neutral-500">We&apos;ll send a one-time password to verify it&apos;s you</span>
              </div>
            </form>
          )}

          {/* Mobile OTP login: verify step */}
          {cfg.otp && step === 'otp' && (
            <div>
              <h2 className="text-[22px] font-extrabold text-neutral-900">Verify OTP</h2>
              <p className="mt-1.5 text-sm text-neutral-500">
                Enter the {OTP_LENGTH}-digit code sent to <span className="font-bold text-neutral-900">+91 {id}</span>
              </p>
              <div className="mt-8">
                <OtpBoxes value={otp} disabled={loading} autoFocus onChange={(v) => { setOtp(v); setError(''); if (v.length === OTP_LENGTH) verify(v); }} />
              </div>
              {error && <p className="mt-4 text-[13px] text-destructive">{error}</p>}
              <Button type="button" onClick={() => verify(otp)} className="mt-8 h-12 w-full rounded-xl text-base font-bold" disabled={otp.length !== OTP_LENGTH || loading}>
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </Button>
              <Button type="button" variant="outline" onClick={resetToPhone} className="mt-2 h-12 w-full rounded-xl">Change phone number</Button>
              <button type="button" disabled={loading} onClick={requestOtp} className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline">Resend OTP</button>
            </div>
          )}

          <div className="mt-8 space-y-1.5 text-center text-[11px] leading-4 text-neutral-500">
          </div>
        </div>
      </div>
    </div>
  );
}
