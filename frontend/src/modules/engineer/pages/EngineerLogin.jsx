import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Headset, Loader2, Mail, MapPin, Phone, User, Wrench, X } from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { MOBILE_THEME } from '@/shared/layout/mobileTheme';

const OTP_LENGTH = 4;
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

const btn = 'flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1456d8] hover:bg-[#1149b8] text-[14.5px] sm:text-[15px] font-bold text-white shadow-md shadow-[#1456d8]/25 transition active:scale-[0.98] disabled:opacity-50';
const inputCls = 'h-10 sm:h-11 w-full rounded-xl border border-[#d8e0ed] bg-[#fafbfd] pl-9 pr-3 text-[14px] font-medium text-[#0f172a] outline-none focus:border-[#1456d8] focus:bg-white';

const ErrorLine = ({ children }) => (children ? (
  <p className="flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {children}</p>
) : null);

function IconInput({ icon: Icon, label, ...props }) {
  return (
    <div>
      <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-[#475467]">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a94a6]" />
        <input className={inputCls} {...props} />
      </div>
    </div>
  );
}

/**
 * Engineer sign-in, in the customer app's design: mobile number → 4-digit OTP → (new number) onboarding form.
 * New engineers wait for admin approval before they can sign in.
 */
export default function EngineerLogin() {
  const { user, verifyOtp } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState('phone'); // phone | otp | onboarding | done
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [devOtp, setDevOtp] = useState(false);
  const [signupToken, setSignupToken] = useState(null);
  const [f, setF] = useState({ name: '', email: '', city: '', brands: '', areas: '', skills: '' });
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (step !== 'otp' || resendTimer <= 0) return undefined;
    const t = setInterval(() => setResendTimer((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [step, resendTimer]);

  if (user?.role === 'engineer') return <Navigate to="/engineer/home" replace />;

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const requestOtp = async (e) => {
    e?.preventDefault();
    if (phone.length !== 10) { setError('Please enter a valid 10-digit mobile number'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api('/auth/send-otp', { method: 'POST', body: { role: 'engineer', phone } });
      setDevOtp(!!res.defaultOtp);
      setOtp(Array(OTP_LENGTH).fill(''));
      setStep('otp');
      setResendTimer(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (err) { setError(err.message || 'Failed to send OTP. Please try again.'); } finally { setLoading(false); }
  };

  const verify = async (code) => {
    if (code.length !== OTP_LENGTH) { setError(`Please enter the complete ${OTP_LENGTH}-digit code`); return; }
    setLoading(true);
    setError('');
    try {
      const res = await verifyOtp('engineer', phone, code);
      if (res?.isNew) { setSignupToken(res.signupToken); setStep('onboarding'); } else nav('/engineer/home', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid code. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } finally { setLoading(false); }
  };

  const onOtpChange = (index, val) => {
    const clean = val.replace(/\D/g, '');
    setError('');
    const next = [...otp];
    if (clean.length > 1) { // pasted code
      clean.slice(0, OTP_LENGTH).split('').forEach((c, i) => { next[i] = c; });
      setOtp(next);
      otpRefs.current[Math.min(clean.length, OTP_LENGTH - 1)]?.focus();
      if (next.every(Boolean)) verify(next.join(''));
      return;
    }
    next[index] = clean;
    setOtp(next);
    if (clean && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  };

  const register = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.city.trim() || !list(f.brands).length) { setError('Name, city and at least one brand are required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api('/auth/register-engineer', {
        method: 'POST',
        body: {
          name: f.name.trim(), phone, email: f.email.trim() || undefined, signupToken, city: f.city.trim(),
          skills: list(f.skills), certifications: list(f.brands).map((brand) => ({ brand })), serviceTerritories: list(f.areas),
        },
      });
      setDone(res.message || 'Registration received. You can sign in after admin approval.');
      setStep('done');
    } catch (err) { setError(err.message || 'Registration failed'); } finally { setLoading(false); }
  };

  const restart = () => { setStep('phone'); setOtp(Array(OTP_LENGTH).fill('')); setError(''); };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#e9edf4] p-0 sm:p-4" style={MOBILE_THEME}>
      <div className="relative flex min-h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-gradient-to-b from-[#f2f7ff] via-[#f8faff] to-[#e4effc] sm:min-h-[820px] sm:rounded-[36px] sm:border sm:border-white/80 sm:shadow-[0_20px_60px_rgba(15,35,80,0.12)]">
        <Wrench className="pointer-events-none absolute -right-6 top-10 h-64 w-64 rotate-12 select-none text-[#1456d8]/[0.05]" strokeWidth={1.2} />

        <div className="relative z-10 flex flex-col items-center px-5 pt-6 sm:px-6 sm:pt-8">
          <img src="/images/aftenza-logo-dark.png" alt="Aftenza" className="mb-3 h-auto w-[205px] object-contain sm:w-[235px]" />
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#e9f0fe] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#1456d8]">
            <Wrench className="h-3.5 w-3.5" /> Engineer App
          </span>
          <h1 className="text-center text-[23px] font-extrabold leading-[1.2] tracking-tight text-[#0f172a] sm:text-[26px]">
            Your Calls.
            <span className="block text-[#1456d8]">Your Earnings.</span>
          </h1>
          <p className="mt-1.5 max-w-[290px] text-center text-[11.5px] leading-relaxed text-[#64748b] sm:text-[12.5px]">
            Accept jobs near you, guide each visit step by step and track every payout.
          </p>

          <div className="mt-4 w-full rounded-[22px] border border-white bg-white p-4 shadow-[0_10px_30px_rgba(20,86,216,0.06)] sm:p-5">
            {step === 'phone' && (
              <form onSubmit={requestOtp} className="space-y-3">
                <div>
                  <h2 className="text-[20px] font-extrabold tracking-tight text-[#0f172a] sm:text-[22px]">Login</h2>
                  <p className="mt-0.5 text-[12px] text-[#64748b]">Enter your registered mobile number.</p>
                </div>
                <div className="flex h-11 items-center rounded-xl border border-[#e2e8f0] bg-white px-3.5 transition focus-within:border-[#1456d8] focus-within:ring-2 focus-within:ring-[#1456d8]/15 sm:h-12">
                  <Phone className="h-4 w-4 shrink-0 text-[#8a94a6]" strokeWidth={1.8} />
                  <span className="pl-2.5 text-[14px] font-semibold text-[#475467]">+91</span>
                  <input
                    type="tel" inputMode="numeric" maxLength={10} autoFocus placeholder="Mobile Number" value={phone}
                    onChange={(e) => { setError(''); setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); }}
                    className="w-full bg-transparent pl-2 text-[14.5px] font-semibold text-[#0f172a] outline-none placeholder:font-normal placeholder:text-[#94a3b8]"
                  />
                  {phone && <button type="button" onClick={() => setPhone('')} aria-label="Clear phone" className="text-[#94a3b8] hover:text-[#475467]"><X className="h-4 w-4" /></button>}
                </div>
                <ErrorLine>{error}</ErrorLine>
                <button type="submit" disabled={phone.length !== 10 || loading} className={btn}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending OTP...</> : <>Get OTP <ArrowRight className="h-4 w-4" strokeWidth={2.2} /></>}
                </button>
                <p className="text-[11px] leading-tight text-[#64748b]">
                  New engineer? Verify your number and we&apos;ll set up your profile. By continuing you agree to our{' '}
                  <Link to="/customer/terms" className="font-semibold text-[#1456d8] hover:underline">Terms</Link> and{' '}
                  <Link to="/customer/privacy" className="font-semibold text-[#1456d8] hover:underline">Privacy Policy</Link>.
                </p>
              </form>
            )}

            {step === 'otp' && (
              <div className="space-y-3">
                <button type="button" onClick={restart} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1456d8] hover:underline">
                  <ArrowLeft className="h-3 w-3" /> Change mobile number
                </button>
                <div>
                  <h2 className="text-[20px] font-extrabold tracking-tight text-[#0f172a] sm:text-[22px]">Verify OTP</h2>
                  <p className="mt-0.5 text-[12px] text-[#64748b]">Enter the {OTP_LENGTH}-digit code sent to <strong className="text-[#0f172a]">+91 {phone}</strong></p>
                </div>
                {devOtp && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">Dev mode: OTP is <b>1234</b></p>}
                <div className="flex justify-between gap-2 pt-0.5">
                  {otp.map((digit, index) => (
                    <input
                      key={index} ref={(el) => { otpRefs.current[index] = el; }} type="tel" inputMode="numeric" maxLength={OTP_LENGTH} value={digit} disabled={loading}
                      onChange={(e) => onOtpChange(index, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus(); }}
                      autoComplete={index === 0 ? 'one-time-code' : 'off'} aria-label={`OTP digit ${index + 1}`}
                      className={cn('h-12 w-12 rounded-xl border-2 bg-[#f8fafc] text-center text-lg font-bold text-[#0f172a] outline-none transition focus:border-[#1456d8] focus:bg-white focus:ring-4 focus:ring-[#1456d8]/10 sm:h-13 sm:w-13 sm:text-xl', digit ? 'border-[#1456d8] bg-white text-[#1456d8]' : 'border-[#d8e0ed]')}
                    />
                  ))}
                </div>
                <ErrorLine>{error}</ErrorLine>
                <button type="button" onClick={() => verify(otp.join(''))} disabled={otp.some((d) => !d) || loading} className={btn}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : <>Verify & Continue <ArrowRight className="h-4 w-4" strokeWidth={2.2} /></>}
                </button>
                <div className="flex items-center justify-between pt-0.5 text-[11px]">
                  <span className="text-[#64748b]">Didn&apos;t receive code?</span>
                  {resendTimer > 0
                    ? <span className="font-semibold text-[#8a94a6]">Resend in {resendTimer}s</span>
                    : <button type="button" onClick={requestOtp} disabled={loading} className="font-bold text-[#1456d8] hover:underline">Resend OTP</button>}
                </div>
              </div>
            )}

            {step === 'onboarding' && (
              <form onSubmit={register} className="space-y-3">
                <div>
                  <h2 className="text-[20px] font-extrabold tracking-tight text-[#0f172a] sm:text-[22px]">Join as Engineer</h2>
                  <p className="mt-0.5 text-[12px] text-[#64748b]">Tell us about your work. We verify every profile before you get jobs.</p>
                </div>
                <IconInput icon={User} label="Full name *" autoFocus required placeholder="e.g. Rahul Sharma" value={f.name} onChange={set('name')} />
                <div className="flex h-10 items-center justify-between rounded-xl border border-[#e2e8f0] bg-neutral-100 px-3 text-xs font-semibold text-[#475467] sm:h-11">
                  <span>+91 {phone}</span>
                  <span className="flex items-center gap-1 text-[10.5px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
                </div>
                <IconInput icon={Mail} label="Email (optional)" type="email" placeholder="name@example.com" value={f.email} onChange={set('email')} />
                <IconInput icon={MapPin} label="City *" required placeholder="e.g. Indore" value={f.city} onChange={set('city')} />
                <IconInput icon={BadgeCheck} label="Brands you are certified for *" required placeholder="e.g. Voltas, LG (comma separated)" value={f.brands} onChange={set('brands')} />
                <IconInput icon={MapPin} label="Areas you can travel to" placeholder="e.g. Indore, Dewas" value={f.areas} onChange={set('areas')} />
                <IconInput icon={Wrench} label="Skills" placeholder="e.g. AC, DG sets, UPS" value={f.skills} onChange={set('skills')} />
                <ErrorLine>{error}</ErrorLine>
                <button type="submit" disabled={loading} className={btn}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating profile...</> : <>Submit for approval <ArrowRight className="h-4 w-4" strokeWidth={2.2} /></>}
                </button>
                <button type="button" onClick={restart} className="w-full text-center text-[12px] font-semibold text-[#1456d8] hover:underline">Use a different number</button>
              </form>
            )}

            {step === 'done' && (
              <div className="space-y-3 py-2 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></span>
                <h2 className="text-[20px] font-extrabold tracking-tight text-[#0f172a]">Profile submitted</h2>
                <p className="text-[12.5px] text-[#64748b]">{done} We&apos;ll notify you once it is approved.</p>
                <button type="button" onClick={restart} className={btn}>Back to login</button>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[12.5px] sm:text-[13px]">
            <span className="flex items-center gap-1.5 font-semibold text-[#0f172a]"><Headset className="h-4 w-4 text-[#1456d8]" /> Need Help?</span>
            <span className="font-light text-[#cbd5e1]">|</span>
            <Link to="/customer/support" className="inline-flex items-center gap-1 font-bold text-[#1456d8] hover:underline">Support <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} /></Link>
          </div>
        </div>

        <div className="pointer-events-none relative z-10 mt-auto w-full shrink-0 select-none pt-4">
          <img src="/images/customer/login-equipment-banner.webp" alt="" className="block max-h-[130px] w-full object-cover object-top sm:max-h-[160px]" />
        </div>
      </div>
    </div>
  );
}
