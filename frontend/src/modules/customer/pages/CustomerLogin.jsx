import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Headset,
  Loader2,
  Mail,
  Phone,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';
import { api } from '@/shared/lib/api';
import { setSession } from '@/shared/constants/authRoles';
import { cn } from '@/shared/lib/utils';

const OTP_LENGTH = 4;

export default function CustomerLogin() {
  const { user, verifyOtp } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'onboarding'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [agreed, setAgreed] = useState(true);
  const [signupToken, setSignupToken] = useState(null);

  // Onboarding fields for first-time customer
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);

  const otpRefs = useRef([]);

  // Auto redirect if already logged in as customer
  if (user?.role === 'customer') {
    return <Navigate to="/customer" replace />;
  }

  // Resend OTP countdown
  useEffect(() => {
    let interval = null;
    if (step === 'otp' && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((t) => t - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  const handleRequestOtp = async (e) => {
    e?.preventDefault();
    setError('');

    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue');
      return;
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      await api('/auth/send-otp', {
        method: 'POST',
        body: { role: 'customer', phone: cleanPhone },
      });
      setOtp(['', '', '', '']);
      setStep('otp');
      setResendTimer(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, val) => {
    const clean = val.replace(/\D/g, '');
    setError('');

    const next = [...otp];
    if (clean.length > 1) {
      // Pasted multi-digit code
      const pasted = clean.slice(0, OTP_LENGTH).split('');
      pasted.forEach((char, i) => {
        next[i] = char;
      });
      setOtp(next);
      const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
      otpRefs.current[focusIndex]?.focus();
      if (pasted.length === OTP_LENGTH) {
        verifyCode(next.join(''));
      }
      return;
    }

    next[index] = clean;
    setOtp(next);

    if (clean && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== '')) {
      verifyCode(next.join(''));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyCode = async (codeToVerify) => {
    const code = codeToVerify || otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError(`Please enter the complete ${OTP_LENGTH}-digit code`);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await verifyOtp('customer', phone.trim(), code);
      if (res?.isNew) {
        setSignupToken(res.signupToken);
        setStep('onboarding');
      } else {
        nav('/customer', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setOtp(['', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterCustomer = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        signupToken,
      };
      const { token, user: newUser } = await api('/auth/register-customer', {
        method: 'POST',
        body: payload,
      });
      setSession('customer', token, newUser);
      window.location.assign('/customer');
    } catch (err) {
      setError(err.message || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#e9edf4] flex items-center justify-center p-0 sm:p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Mobile container matching reference design with strictly zero scroll */}
      <div className="relative w-full max-w-[420px] h-[100dvh] sm:h-[820px] sm:max-h-[96vh] sm:rounded-[36px] bg-gradient-to-b from-[#f2f7ff] via-[#f8faff] to-[#e4effc] sm:shadow-[0_20px_60px_rgba(15,35,80,0.12)] sm:border sm:border-white/80 overflow-hidden flex flex-col justify-between">
        {/* Faint lightning bolt watermark in top right */}
        <svg
          className="absolute -right-4 top-10 w-52 h-72 text-[#0066ff]/[0.05] pointer-events-none select-none z-0"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>

        {/* Top Content Area - compact spacing so it never overflows */}
        <div className="relative z-10 px-5 sm:px-6 pt-5 sm:pt-7 flex flex-col items-center">
          {/* Brand Logo - prominent matching reference */}
          <div className="flex items-center justify-center mb-3 pt-0.5">
            <img
              src="/images/aftenza-logo-dark.png"
              alt="Aftenza"
              className="w-[215px] sm:w-[245px] h-auto object-contain"
            />
          </div>

          {/* Headline matching reference */}
          <h1 className="text-[23px] sm:text-[26px] font-extrabold tracking-tight text-[#0f172a] text-center leading-[1.2]">
            Your Equipment.
            <span className="block text-[#0066ff]">Our Priority.</span>
          </h1>

          {/* Subtitle description */}
          <p className="mt-1.5 text-center text-[11.5px] sm:text-[12.5px] leading-relaxed text-[#64748b] max-w-[280px]">
            Get reliable service, track your requests and stay updated — all in one place.
          </p>

          {/* Floating White Card */}
          <div className="mt-3.5 sm:mt-4 w-full rounded-[22px] bg-white p-4 sm:p-5 shadow-[0_10px_30px_rgba(20,86,216,0.06)] border border-white">
            {/* STEP 1: Phone number */}
            {step === 'phone' && (
              <form onSubmit={handleRequestOtp} className="space-y-3">
                <div>
                  <h2 className="text-[20px] sm:text-[22px] font-extrabold text-[#0f172a] tracking-tight">Login</h2>
                  <p className="text-[12px] text-[#64748b] mt-0.5">
                    Enter your mobile number to continue.
                  </p>
                </div>

                {/* Input with phone outline icon (matching reference) */}
                <div>
                  <div className="flex h-11 sm:h-12 items-center rounded-xl border border-[#e2e8f0] bg-white px-3.5 transition focus-within:border-[#0066ff] focus-within:ring-2 focus-within:ring-[#0066ff]/15">
                    <Phone className="h-4.5 w-4.5 text-[#8a94a6] shrink-0" strokeWidth={1.8} />
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoFocus
                      placeholder="Mobile Number"
                      value={phone}
                      onChange={(e) => {
                        setError('');
                        setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                      }}
                      className="w-full bg-transparent pl-2.5 text-[14px] sm:text-[14.5px] font-semibold text-[#0f172a] placeholder:font-normal placeholder:text-[#94a3b8] outline-none"
                    />
                    {phone && (
                      <button
                        type="button"
                        onClick={() => setPhone('')}
                        className="text-[#94a3b8] hover:text-[#475467]"
                        aria-label="Clear phone"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {error && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                    </p>
                  )}
                </div>

                {/* Get OTP Button */}
                <button
                  type="submit"
                  disabled={phone.length !== 10 || loading}
                  className="flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0066ff] hover:bg-[#0055d6] text-[14.5px] sm:text-[15px] font-bold text-white shadow-md shadow-[#0066ff]/25 transition hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending OTP...
                    </span>
                  ) : (
                    <>
                      Get OTP <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                    </>
                  )}
                </button>

                {/* Terms of Service & Privacy Policy Checkbox */}
                <div className="flex items-start gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="loginTermsCheck"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[#cbd5e1] text-[#0066ff] focus:ring-[#0066ff] cursor-pointer"
                  />
                  <label
                    htmlFor="loginTermsCheck"
                    className="text-[11px] leading-tight text-[#64748b] select-none cursor-pointer"
                  >
                    By continuing, you agree to our{' '}
                    <Link
                      to="/customer/terms"
                      className="font-semibold text-[#0066ff] hover:underline"
                    >
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link
                      to="/customer/privacy"
                      className="font-semibold text-[#0066ff] hover:underline"
                    >
                      Privacy Policy
                    </Link>.
                  </label>
                </div>
              </form>
            )}

            {/* STEP 2: OTP Verification */}
            {step === 'otp' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp(['', '', '', '']);
                    setError('');
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0066ff] hover:underline"
                >
                  <ArrowLeft className="h-3 w-3" /> Change mobile number
                </button>

                <div>
                  <h2 className="text-[20px] sm:text-[22px] font-extrabold text-[#0f172a] tracking-tight">Verify OTP</h2>
                  <p className="text-[12px] text-[#64748b] mt-0.5">
                    Enter the 4-digit code sent to{' '}
                    <strong className="text-[#0f172a]">+91 {phone}</strong>
                  </p>
                </div>

                {/* 4 Digit Boxes */}
                <div className="flex justify-between gap-2 pt-0.5">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpRefs.current[index] = el;
                      }}
                      type="tel"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      disabled={loading}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className={cn(
                        'h-12 w-12 sm:h-13 sm:w-13 rounded-xl border-2 bg-[#f8fafc] text-center text-lg sm:text-xl font-bold text-[#0f172a] outline-none transition focus:border-[#0066ff] focus:bg-white focus:ring-4 focus:ring-[#0066ff]/10',
                        digit ? 'border-[#0066ff] bg-white text-[#0066ff]' : 'border-[#d8e0ed]'
                      )}
                      aria-label={`OTP Digit ${index + 1}`}
                    />
                  ))}
                </div>

                {error && (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => verifyCode()}
                  disabled={otp.some((d) => !d) || loading}
                  className="flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0066ff] hover:bg-[#0055d6] text-[14.5px] sm:text-[15px] font-bold text-white shadow-md shadow-[#0066ff]/25 transition hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                    </span>
                  ) : (
                    <>
                      Verify & Continue <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className="text-[#64748b]">Didn&apos;t receive code?</span>
                  {resendTimer > 0 ? (
                    <span className="font-semibold text-[#8a94a6]">Resend in {resendTimer}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={loading}
                      className="font-bold text-[#0066ff] hover:underline"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: First-time customer profile onboarding */}
            {step === 'onboarding' && (
              <form onSubmit={handleRegisterCustomer} className="space-y-3">
                <div>
                  <h2 className="text-[20px] sm:text-[22px] font-extrabold text-[#0f172a] tracking-tight">Complete Profile</h2>
                  <p className="text-[12px] text-[#64748b] mt-0.5">
                    Welcome! Enter your details to create your warranty passport account.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-[#475467]">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a94a6]" />
                    <input
                      autoFocus
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-10 sm:h-11 w-full rounded-xl border border-[#d8e0ed] bg-[#fafbfd] pl-9 pr-3 text-[14px] font-medium text-[#0f172a] outline-none focus:border-[#0066ff] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-[#475467]">
                    Email Address (Optional)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a94a6]" />
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 sm:h-11 w-full rounded-xl border border-[#d8e0ed] bg-[#fafbfd] pl-9 pr-3 text-[14px] font-medium text-[#0f172a] outline-none focus:border-[#0066ff] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-[#475467]">
                    Mobile Number
                  </label>
                  <div className="flex h-10 sm:h-11 items-center justify-between rounded-xl border border-[#e2e8f0] bg-neutral-100 px-3 text-xs font-semibold text-[#475467]">
                    <span>+91 {phone}</span>
                    <span className="flex items-center gap-1 text-[10.5px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                    </span>
                  </div>
                </div>

                {error && (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!fullName.trim() || loading}
                  className="mt-1 flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0066ff] hover:bg-[#0055d6] text-[14.5px] sm:text-[15px] font-bold text-white shadow-md shadow-[#0066ff]/25 transition hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating Profile...
                    </span>
                  ) : (
                    <>
                      Complete & Get Started <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Need Help? | Support Link matching reference */}
          <div className="mt-3.5 sm:mt-4 flex items-center justify-center gap-2 text-[12.5px] sm:text-[13px]">
            <div className="flex items-center gap-1.5 text-[#0f172a] font-semibold">
              <Headset className="h-4 w-4 text-[#0066ff]" />
              <span>Need Help?</span>
            </div>
            <span className="text-[#cbd5e1] font-light">|</span>
            <Link
              to="/customer/support"
              className="inline-flex items-center gap-1 font-bold text-[#0066ff] hover:underline"
            >
              Support <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        {/* Bottom Equipment Image Banner matching reference - compact height */}
        <div className="relative z-10 w-full mt-auto select-none pointer-events-none shrink-0">
          <img
            src="/images/customer/login-equipment-banner.webp"
            alt="Aftenza Supported Equipment (Generators, Transformers, UPS, Control Panels)"
            className="w-full max-h-[140px] sm:max-h-[170px] object-cover object-top block"
          />
        </div>
      </div>
    </div>
  );
}
