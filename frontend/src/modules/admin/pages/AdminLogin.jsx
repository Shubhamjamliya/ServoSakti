import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';

const RESET_OTP_LENGTH = 6;

const CAPABILITIES = [
  { icon: Activity, label: 'Live Dispatch', detail: 'Real-time SLA & engineer tracking' },
  { icon: ShieldCheck, label: 'Warranty Control', detail: 'AMC plans & claim approvals' },
  { icon: Layers, label: 'Network Ledger', detail: 'OEMs, vendors & settlements' },
];

function SixDigitOtp({ value, onChange, disabled, onComplete }) {
  const inputs = useRef([]);
  const digits = Array.from({ length: RESET_OTP_LENGTH }, (_, i) => value[i] || '');

  const setDigit = (index, raw) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      onChange(next.join(''));
      return;
    }
    const next = [...digits];
    if (clean.length > 1) {
      clean
        .slice(0, RESET_OTP_LENGTH)
        .split('')
        .forEach((char, offset) => {
          if (index + offset < RESET_OTP_LENGTH) next[index + offset] = char;
        });
      const joined = next.join('');
      onChange(joined);
      const focusIdx = Math.min(index + clean.length, RESET_OTP_LENGTH - 1);
      inputs.current[focusIdx]?.focus();
      if (joined.length === RESET_OTP_LENGTH) onComplete?.(joined);
      return;
    }
    next[index] = clean;
    const joined = next.join('');
    onChange(joined);
    if (index < RESET_OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (joined.length === RESET_OTP_LENGTH) onComplete?.(joined);
  };

  const onKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = '';
      onChange(next.join(''));
    }
  };

  return (
    <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          type="tel"
          inputMode="numeric"
          maxLength={RESET_OTP_LENGTH}
          value={digit}
          disabled={disabled}
          autoFocus={index === 0}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Verification digit ${index + 1}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDigit(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          className={cn(
            'h-12 w-full rounded-xl border-2 bg-slate-50 text-center text-lg font-bold text-slate-900 outline-none transition',
            'focus:border-[#0066ff] focus:bg-white focus:ring-4 focus:ring-[#0066ff]/10 disabled:opacity-60',
            digit ? 'border-[#0066ff] bg-white text-[#0066ff]' : 'border-slate-200'
          )}
        />
      ))}
    </div>
  );
}

export default function AdminLogin() {
  const { user, login } = useAuth();
  const nav = useNavigate();

  // mode: 'login' | 'forgot-email' | 'forgot-otp' | 'forgot-reset'
  const [mode, setMode] = useState('login');

  // Sign-in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot-password state
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (mode !== 'forgot-otp' || resendTimer <= 0) return undefined;
    const timer = setInterval(() => setResendTimer((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [mode, resendTimer]);

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      await login('admin', { email: email.trim(), password });
      nav('/admin', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setError('');
    setNotice('');
    setResetEmail(email.trim());
    setOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setMode('forgot-email');
  };

  const sendResetCode = async (e) => {
    e?.preventDefault();
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setError('Please enter a valid admin email address');
      return;
    }
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await api('/auth/admin/forgot-password', {
        method: 'POST',
        body: { email: targetEmail },
      });
      setOtp('');
      setResendTimer(30);
      setNotice(res.message || 'Verification code sent to your email.');
      setMode('forgot-otp');
    } catch (err) {
      setError(err.message || 'Could not send verification email');
    } finally {
      setLoading(false);
    }
  };

  const verifyResetCode = async (codeOverride) => {
    const code = (codeOverride || otp).trim();
    if (code.length !== RESET_OTP_LENGTH) {
      setError('Enter the 6-digit verification code from your email');
      return;
    }
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await api('/auth/admin/verify-reset-otp', {
        method: 'POST',
        body: { email: resetEmail.trim().toLowerCase(), otp: code },
      });
      setResetToken(res.resetToken);
      setMode('forgot-reset');
    } catch (err) {
      setError(err.message || 'Invalid verification code');
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await api('/auth/admin/reset-password', {
        method: 'POST',
        body: { resetToken, newPassword },
      });
      setEmail(resetEmail.trim());
      setPassword('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice(res.message || 'Password updated successfully. You can now sign in.');
      setMode('login');
    } catch (err) {
      setError(err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const inputWrap =
    'flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 transition focus-within:border-[#0066ff] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#0066ff]/10';
  const primaryBtn =
    'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0066ff] text-[15px] font-bold text-white shadow-lg shadow-[#0066ff]/25 transition hover:bg-[#0052cc] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55';

  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] lg:grid lg:grid-cols-12 font-['Plus_Jakarta_Sans','Inter',sans-serif]">
      {/* Left Editorial Hero Panel (Desktop) */}
      <div className="relative hidden overflow-hidden bg-[#071124] lg:col-span-7 lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
        {/* Real-world field service & diagnostics photo */}
        <img
          src="/images/admin-login-hero.jpg"
          alt="Aftenza field service technician inspecting industrial control systems"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-55 scale-[1.02]"
        />
        {/* Layered editorial gradient */}
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Control Tower
          </span>
        </div>

        {/* Bottom Copy & Capability Cards */}
        <div className="relative z-10 max-w-xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            Operations &amp; Governance
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-white xl:text-[44px]">
            Command the entire
            <span className="block text-sky-400">service network.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">
            Oversee live field dispatches, partner approvals, warranty coverage, and automated settlements from one unified console.
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
      <div className="relative flex min-h-screen flex-col justify-between bg-gradient-to-b from-[#f4f8ff] via-[#f8fafc] to-[#eef4ff] px-5 py-8 sm:px-8 lg:col-span-5 lg:px-10 xl:px-14">
        {/* Subtle mobile hero strip */}
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
          {/* Same Aftenza logo used in Customer & Engineer login */}
          <div className="mb-6 flex flex-col items-center text-center">
            <img
              src="/images/aftenza-logo-dark.png"
              alt="Aftenza"
              className="h-auto w-[210px] object-contain sm:w-[230px]"
            />
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e8f0fe] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#0066ff]">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin Console
            </span>
          </div>

          {/* Auth Card */}
          <div className="sf-rise rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.08)] sm:p-8">
            {notice && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12.5px] font-medium text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{notice}</span>
              </div>
            )}

            {/* MODE 1: Email & Password Login */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                    Sign in
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter your administrator email and password to continue.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Email Address
                  </label>
                  <div className={inputWrap}>
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoFocus
                      required
                      placeholder="admin@aftenza.com"
                      value={email}
                      onChange={(e) => {
                        setError('');
                        setEmail(e.target.value);
                      }}
                      className="w-full bg-transparent pl-2.5 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={openForgotPassword}
                      className="text-[12px] font-semibold text-[#0066ff] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className={inputWrap}>
                    <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
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
                      Sign in to Console <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* MODE 2: Forgot Password — Enter Email */}
            {mode === 'forgot-email' && (
              <form onSubmit={sendResetCode} className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setMode('login');
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0066ff] hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </button>

                <div>
                  <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                    Reset password
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter your registered admin email. We&apos;ll send a 6-digit verification code.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Admin Email
                  </label>
                  <div className={inputWrap}>
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="email"
                      inputMode="email"
                      autoFocus
                      required
                      placeholder="admin@aftenza.com"
                      value={resetEmail}
                      onChange={(e) => {
                        setError('');
                        setResetEmail(e.target.value);
                      }}
                      className="w-full bg-transparent pl-2.5 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>
                </div>

                {error && (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <button type="submit" disabled={loading || !resetEmail.trim()} className={primaryBtn}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending code...
                    </>
                  ) : (
                    <>
                      Send Verification Code <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* MODE 3: Forgot Password — Verify 6-digit SMTP OTP */}
            {mode === 'forgot-otp' && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setMode('forgot-email');
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0066ff] hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change email
                </button>

                <div>
                  <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                    Verify code
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter the 6-digit code sent to{' '}
                    <span className="font-semibold text-slate-900">{resetEmail}</span>
                  </p>
                </div>

                <div className="pt-1">
                  <SixDigitOtp
                    value={otp}
                    disabled={loading}
                    onChange={(val) => {
                      setError('');
                      setOtp(val);
                    }}
                    onComplete={(code) => verifyResetCode(code)}
                  />
                </div>

                {error && (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => verifyResetCode()}
                  disabled={loading || otp.length !== RESET_OTP_LENGTH}
                  className={primaryBtn}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      Verify &amp; Continue <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-1 text-[12px]">
                  <span className="text-slate-500">Didn&apos;t receive the email?</span>
                  {resendTimer > 0 ? (
                    <span className="font-semibold text-slate-400">Resend in {resendTimer}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendResetCode}
                      disabled={loading}
                      className="font-bold text-[#0066ff] hover:underline"
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* MODE 4: Forgot Password — Set New Password */}
            {mode === 'forgot-reset' && (
              <form onSubmit={submitNewPassword} className="space-y-4">
                <div>
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f0fe] text-[#0066ff]">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                    Set new password
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Choose a new password for <span className="font-semibold text-slate-900">{resetEmail}</span>.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    New Password
                  </label>
                  <div className={inputWrap}>
                    <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoFocus
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                      value={newPassword}
                      onChange={(e) => {
                        setError('');
                        setNewPassword(e.target.value);
                      }}
                      className="w-full bg-transparent pl-2.5 pr-2 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      className="text-slate-400 transition hover:text-slate-700"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Confirm Password
                  </label>
                  <div className={inputWrap}>
                    <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setError('');
                        setConfirmPassword(e.target.value);
                      }}
                      className="w-full bg-transparent pl-2.5 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
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
                      <Loader2 className="h-4 w-4 animate-spin" /> Updating password...
                    </>
                  ) : (
                    <>
                      Update Password <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-[11.5px] text-slate-400">
            Protected by role-based access control &amp; encrypted sessions.
          </p>
        </div>
      </div>
    </div>
  );
}
