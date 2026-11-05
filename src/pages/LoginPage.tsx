import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  User,
  Building,
  Phone,
  Hash,
  Sparkles,
} from 'lucide-react';
import { INSTITUTION } from '../config/constants';
import { ENV } from '../config/env';
import { Turnstile } from '../components/Turnstile';
import { RESEND_COOLDOWN_SECONDS, isOtpCode, maskEmail, normalizeOtpInput } from '../features/auth/otp';
import mujLogo from '../assets/muj-logo.png';
import ecellLogo from '../assets/ecell-logo.png';

const DOMAIN = 'muj.manipal.edu';
const fullEmail = (u: string) => {
  const v = u.trim();
  return v.includes('@') ? v : `${v}@${DOMAIN}`;
};

export const LoginPage: React.FC = () => {
  const {
    signInWithEmail,
    registerUniversityAccount,
    verifyEmailCode,
    resendEmailCode,
    currentUser,
    passwordRecovery,
    requestPasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
    cancelPasswordReset,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [showPwd, setShowPwd] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [regUser, setRegUser] = useState('');
  const [regName, setRegName] = useState('');
  const [regDept, setRegDept] = useState('');
  const [regNo, setRegNo] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPwd, setRegPwd] = useState('');
  const [regPwd2, setRegPwd2] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forgot password: username -> emailed code -> new password (+ authenticator code if the account has one)
  const [resetStep, setResetStep] = useState<null | 'email' | 'code' | 'password'>(null);
  const [resetUser, setResetUser] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [resetTotp, setResetTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);

  // Email verification step: after sign-up, or a sign-in with an unverified address
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Rate limited by Supabase: keep the main button off until the wait is over, so repeat clicks do not extend it
  const [wait, setWait] = useState(0);
  React.useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  const showError = (r: { error?: string; retryAfter?: number }) => {
    setErr(r.error ?? null);
    if (r.retryAfter) setWait(r.retryAfter);
  };

  const captchaMissing = () => {
    if (ENV.TURNSTILE_SITE_KEY && !captchaToken) {
      setErr('Please complete the security check.');
      return true;
    }
    return false;
  };

  // Turnstile tokens work once, so every request takes the token and re-arms the widget
  const spendCaptcha = () => {
    const token = captchaToken ?? undefined;
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    return token;
  };

  const startVerification = (email: string, codeSent: boolean, message: string) => {
    setVerifyFor(email);
    setCode('');
    setCooldown(codeSent ? RESEND_COOLDOWN_SECONDS : 0);
    setErr(null);
    setOk(message);
  };

  React.useEffect(() => {
    // A forgot-password reset holds a recovery session until the new password is set
    if (currentUser && !passwordRecovery) {
      const from = (location.state as any)?.from?.pathname;
      const isStaffRoute = typeof from === 'string' && (from.startsWith('/admin') || from.startsWith('/superadmin'));
      const isSuperAdminRoute = typeof from === 'string' && from.startsWith('/superadmin');

      let dest = '/dashboard';
      if (currentUser.role === 'super_admin') {
        dest = from && from !== '/' && !from.startsWith('/login') && !from.startsWith('/auth') ? from : '/superadmin/dashboard';
      } else if (currentUser.role === 'admin') {
        dest = from && !isSuperAdminRoute && from !== '/' && !from.startsWith('/login') && !from.startsWith('/auth') ? from : '/admin/dashboard';
      } else {
        // Students are strictly barred from staff/admin destination routes
        dest = from && !isStaffRoute && from !== '/' && !from.startsWith('/login') && !from.startsWith('/auth') ? from : '/dashboard';
      }
      navigate(dest, { replace: true });
    }
  }, [currentUser, passwordRecovery, navigate, location]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!username.trim()) {
      setErr('Please enter your username.');
      return;
    }
    if (captchaMissing()) return;
    const email = fullEmail(username);
    setBusy(true);
    const r = await signInWithEmail(email, password, spendCaptcha());
    setBusy(false);
    if (r.needsVerification) {
      startVerification(email, false, `${maskEmail(email)} is not verified yet. Send yourself a code and enter it below.`);
      return;
    }
    if (r.error) {
      showError(r);
      return;
    }
    // The currentUser effect above redirects by the role stored in the database
    setOk('Identity verified. Redirecting…');
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (regPwd !== regPwd2) {
      setErr('Passwords do not match.');
      return;
    }
    if (regPwd.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(regPwd) || !/[0-9]/.test(regPwd)) {
      setErr('Password must include both letters and numbers.');
      return;
    }
    if (regName.trim().length > 0 && regName.trim().length < 2) {
      setErr('Full name must be at least 2 characters.');
      return;
    }
    if (captchaMissing()) return;
    const email = fullEmail(regUser);
    setBusy(true);
    const r = await registerUniversityAccount({
      email,
      password: regPwd,
      fullName: regName,
      department: regDept,
      registrationNumber: regNo,
      phone: regPhone,
      captchaToken: spendCaptcha(),
    });
    setBusy(false);
    if (r.error) {
      showError(r);
      return;
    }
    if (r.needsVerification) {
      // Same wording whether or not the address was already registered (no account enumeration)
      startVerification(email, true, `If ${maskEmail(email)} can register, a 6-digit code is on its way.`);
      return;
    }
    setOk('Registered successfully! Redirecting…');
    setTimeout(() => navigate('/dashboard', { replace: true }), 400);
  };

  const onVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyFor) return;
    setErr(null);
    if (!isOtpCode(code)) {
      setErr('Enter the 6-digit code from the email.');
      return;
    }
    if (captchaMissing()) return;
    setBusy(true);
    const r = await verifyEmailCode(verifyFor, code, spendCaptcha());
    setBusy(false);
    if (r.error) {
      setCode('');
      showError(r);
      return;
    }
    setOk('Email verified. Signing you in…');
  };

  const onResendCode = async () => {
    if (!verifyFor || cooldown > 0) return;
    setErr(null);
    if (captchaMissing()) return;
    setBusy(true);
    const r = await resendEmailCode(verifyFor, spendCaptcha());
    setBusy(false);
    if (r.error) {
      setErr(r.error);
      if (r.retryAfter) setCooldown(r.retryAfter);
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setOk(`If ${maskEmail(verifyFor)} has an account awaiting verification, a new code is on its way. Earlier codes stop working.`);
  };

  const startReset = () => {
    setResetStep('email');
    setResetUser(username);
    setErr(null);
    setOk(null);
  };

  const leaveReset = async () => {
    await cancelPasswordReset();
    setResetStep(null);
    setResetCode('');
    setNewPwd('');
    setNewPwd2('');
    setResetTotp('');
    setNeedsTotp(false);
    setErr(null);
    setOk(null);
  };

  const sendResetCode = async () => {
    const email = fullEmail(resetUser);
    setBusy(true);
    const r = await requestPasswordReset(email, spendCaptcha());
    setBusy(false);
    if (r.error) {
      showError(r);
      return;
    }
    setResetStep('code');
    setResetCode('');
    setCooldown(RESEND_COOLDOWN_SECONDS);
    // Same wording whether or not the account exists (no account enumeration)
    setOk(`If ${maskEmail(email)} has an account, a 6-digit code is on its way. Earlier codes stop working.`);
  };

  const onResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (resetStep === 'email') {
      if (!resetUser.trim()) {
        setErr('Please enter your username.');
        return;
      }
      if (captchaMissing()) return;
      await sendResetCode();
    } else if (resetStep === 'code') {
      if (!isOtpCode(resetCode)) {
        setErr('Enter the 6-digit code from the email.');
        return;
      }
      if (captchaMissing()) return;
      setBusy(true);
      const r = await verifyPasswordResetCode(fullEmail(resetUser), resetCode, spendCaptcha());
      setBusy(false);
      if (r.error) {
        setResetCode('');
        showError(r);
        return;
      }
      setNeedsTotp(Boolean(r.needsTotp));
      setResetStep('password');
      setOk('Code accepted. Choose a new password.');
    } else {
      if (newPwd !== newPwd2) {
        setErr('Passwords do not match.');
        return;
      }
      if (needsTotp && !isOtpCode(resetTotp)) {
        setErr('Enter the 6-digit code from your authenticator app.');
        return;
      }
      setBusy(true);
      const r = await completePasswordReset(newPwd, needsTotp ? resetTotp : undefined);
      setBusy(false);
      if (r.error) {
        if (r.needsTotp) setNeedsTotp(true);
        setResetTotp('');
        setErr(r.error);
        return;
      }
      setResetStep(null);
      setTab('signin');
      setUsername(resetUser);
      setPassword('');
      setNewPwd('');
      setNewPwd2('');
      setResetTotp('');
      setOk('Password changed. Sign in with your new password.');
    }
  };

  const onResetResend = async () => {
    if (cooldown > 0) return;
    setErr(null);
    if (captchaMissing()) return;
    await sendResetCode();
  };

  const leaveVerification = () => {
    setVerifyFor(null);
    setCode('');
    setErr(null);
    setOk(null);
  };

  return (
    <div style={S.page}>
      <div style={S.cardWrap}>
        <div className="editorial-card" style={{ padding: 'clamp(24px, 6vw, 40px) clamp(18px, 6vw, 38px)', borderRadius: 28 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <img
                src={ecellLogo}
                alt="E-CELL MUJ"
                style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: '50%', backgroundColor: '#fff' }}
              />
              <span style={S.welcomeTag}>
                <Sparkles size={11} /> E-CELL MUJ &bull; IPR CELL
              </span>
            </div>

            <img
              src={mujLogo}
              alt="Manipal University Jaipur"
              style={{ display: 'block', margin: '0 auto 14px', maxWidth: 260, width: '100%', height: 'auto' }}
            />

            <h1 style={S.portalTitle}>Patent Application &amp; Invention Portal</h1>
            <p style={S.subtext}>Sign in with your official university credentials</p>
          </div>

          {/* Pill Tab Switcher */}
          <div style={{ ...S.tabRow, ...(verifyFor || resetStep ? { display: 'none' } : null) }}>
            {(['signin', 'register'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setErr(null);
                  setOk(null);
                }}
                style={{ ...S.tabBtn, ...(tab === t ? S.tabActive : S.tabInactive) }}
              >
                {t === 'signin' ? 'Sign In' : 'Register Account'}
              </button>
            ))}
          </div>

          {/* Alerts */}
          {err && (
            <div role="alert" style={S.alertErr}>
              <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{err}</span>
            </div>
          )}
          {ok && (
            <div role="status" style={S.alertOk}>
              <CheckCircle2 size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{ok}</span>
            </div>
          )}

          {resetStep ? (
            <form onSubmit={onResetSubmit} noValidate>
              <h2 style={S.resetTitle}>Reset your password</h2>
              {resetStep === 'email' && (
                <>
                  <p style={S.helpText}>Enter your university username. We will email you a 6-digit code.</p>
                  <label htmlFor="reset-username" style={S.label}>
                    Institutional Username
                  </label>
                  <div style={{ ...S.usernameRow, marginBottom: 20 }}>
                    <input
                      id="reset-username"
                      type="text"
                      value={resetUser}
                      onChange={(e) => setResetUser(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      style={{ ...S.input, ...S.usernameInput }}
                    />
                    <span style={S.domainTag}>@{INSTITUTION.DOMAIN}</span>
                  </div>
                </>
              )}

              {resetStep === 'code' && (
                <>
                  <label htmlFor="reset-code" style={S.label}>
                    6-digit code sent to {maskEmail(fullEmail(resetUser))}
                  </label>
                  <input
                    id="reset-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(normalizeOtpInput(e.target.value))}
                    aria-describedby="reset-code-help"
                    autoFocus
                    style={{ ...S.input, ...S.codeInput }}
                  />
                  <p id="reset-code-help" style={S.helpText}>
                    Codes expire 10 minutes after they are sent and work once. Check your spam folder if nothing arrives.
                  </p>
                </>
              )}

              {resetStep === 'password' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="new-password" style={S.label}>
                      New password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      autoComplete="new-password"
                      autoFocus
                      style={S.input}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="new-password-2" style={S.label}>
                      Confirm new password
                    </label>
                    <input
                      id="new-password-2"
                      type="password"
                      value={newPwd2}
                      onChange={(e) => setNewPwd2(e.target.value)}
                      autoComplete="new-password"
                      style={S.input}
                    />
                  </div>
                  {needsTotp && (
                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="reset-totp" style={S.label}>
                        Code from your authenticator app
                      </label>
                      <input
                        id="reset-totp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={resetTotp}
                        onChange={(e) => setResetTotp(normalizeOtpInput(e.target.value))}
                        style={{ ...S.input, ...S.codeInput }}
                      />
                      <p style={S.helpText}>
                        Lost your authenticator too? Contact the IPR cell at {INSTITUTION.CONTACT_EMAIL}.
                      </p>
                    </div>
                  )}
                </>
              )}

              <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

              <div style={S.codeActions}>
                <button type="submit" disabled={busy || wait > 0} className="btn btn-primary" style={{ padding: '11px 32px' }}>
                  <span />
                  {busy
                    ? 'Please wait…'
                    : wait > 0
                    ? `Try again in ${wait}s`
                    : resetStep === 'email'
                    ? 'Send code'
                    : resetStep === 'code'
                    ? 'Verify code'
                    : 'Set new password'}{' '}
                  <ArrowRight size={15} />
                </button>
                {resetStep === 'code' && (
                  <button
                    type="button"
                    onClick={onResetResend}
                    disabled={busy || cooldown > 0}
                    style={{ ...S.forgotBtn, ...(cooldown > 0 ? { color: '#354F77', cursor: 'not-allowed' } : null) }}
                  >
                    {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                  </button>
                )}
              </div>

              <button type="button" onClick={leaveReset} style={{ ...S.forgotBtn, marginTop: 18 }}>
                Back to sign in
              </button>
            </form>
          ) : verifyFor ? (
            <form onSubmit={onVerifyCode} noValidate>
              <label htmlFor="email-code" style={S.label}>
                6-digit code sent to {maskEmail(verifyFor)}
              </label>
              <input
                id="email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(normalizeOtpInput(e.target.value))}
                aria-describedby="email-code-help"
                autoFocus
                style={{ ...S.input, ...S.codeInput }}
              />
              <p id="email-code-help" style={S.helpText}>
                Codes expire 10 minutes after they are sent and work once. Check your spam folder if nothing arrives.
              </p>

              <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

              <div style={S.codeActions}>
                <button type="submit" disabled={busy || wait > 0} className="btn btn-primary" style={{ padding: '11px 32px' }}>
                  <span />
                  {busy ? 'Verifying…' : wait > 0 ? `Try again in ${wait}s` : 'Verify email'} <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={onResendCode}
                  disabled={busy || cooldown > 0}
                  style={{ ...S.forgotBtn, ...(cooldown > 0 ? { color: '#354F77', cursor: 'not-allowed' } : null) }}
                >
                  {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                </button>
              </div>
              {/* Announces only the start and end of the wait, not every second */}
              <p aria-live="polite" style={S.srOnly}>
                {cooldown > 0 ? 'You can request a new code in one minute.' : 'You can request a new code now.'}
              </p>

              <button type="button" onClick={leaveVerification} style={{ ...S.forgotBtn, marginTop: 18 }}>
                Wrong email? Go back
              </button>
            </form>
          ) : tab === 'signin' ? (
            <form onSubmit={onSignIn}>
              {/* Username Input */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Institutional Username</label>
                <div style={S.usernameRow}>
                  <input
                    type="text"
                    placeholder=""
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                    autoComplete="username"
                    style={{ ...S.input, ...S.usernameInput }}
                  />
                  <span style={S.domainTag}>@{INSTITUTION.DOMAIN}</span>
                </div>
              </div>

              {/* Password Input */}
              <div style={{ marginBottom: 24, position: 'relative' }}>
                <label style={S.label}>Password</label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Enter your university password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ ...S.input, paddingRight: 44 }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd((p) => !p)}
                  style={S.eyeBtn}
                >
                  {showPwd ? <EyeOff size={17} color="#6385B2" /> : <Eye size={17} color="#6385B2" />}
                </button>
              </div>

              <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <button
                  type="submit"
                  disabled={busy || wait > 0}
                  className="btn btn-primary"
                  style={{ padding: '11px 32px', opacity: busy || wait > 0 ? 0.6 : 1, cursor: busy || wait > 0 ? 'not-allowed' : 'pointer' }}
                >
                  <span />
                  {busy ? 'Authenticating…' : wait > 0 ? `Try again in ${wait}s` : 'Sign In'} <ArrowRight size={15} />
                </button>

                <button
                  type="button"
                  style={S.forgotBtn}
                  onClick={startReset}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#204E96')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6385B2')}
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={onRegister}>
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>
                  University Username <span style={S.req}>*</span>
                </label>
                <div style={S.usernameRow}>
                  <input
                    type="text"
                    placeholder="username"
                    value={regUser}
                    onChange={(e) => setRegUser(e.target.value)}
                    required
                    style={{ ...S.input, ...S.usernameInput }}
                  />
                  <span style={S.domainTag}>@{INSTITUTION.DOMAIN}</span>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>
                  Full Name <span style={S.req}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={S.ico}>
                    <User size={15} color="#6385B2" />
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. Aditya Sharma"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    style={S.inputIco}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={S.label}>Department</label>
                  <div style={{ position: 'relative' }}>
                    <span style={S.ico}>
                      <Building size={15} color="#6385B2" />
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. CSE"
                      value={regDept}
                      onChange={(e) => setRegDept(e.target.value)}
                      style={S.inputIco}
                    />
                  </div>
                </div>
                <div>
                  <label style={S.label}>Registration No.</label>
                  <div style={{ position: 'relative' }}>
                    <span style={S.ico}>
                      <Hash size={15} color="#6385B2" />
                    </span>
                    <input
                      type="text"
                      placeholder="229301045"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      style={S.inputIco}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <span style={S.ico}>
                    <Phone size={15} color="#6385B2" />
                  </span>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    style={S.inputIco}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
                <div>
                  <label style={S.label}>
                    Password <span style={S.req}>*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Min 6 characters"
                    value={regPwd}
                    onChange={(e) => setRegPwd(e.target.value)}
                    required
                    style={S.input}
                  />
                </div>
                <div>
                  <label style={S.label}>
                    Confirm Password <span style={S.req}>*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Re-enter password"
                    value={regPwd2}
                    onChange={(e) => setRegPwd2(e.target.value)}
                    required
                    style={S.input}
                  />
                </div>
              </div>

              <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

              <button
                type="submit"
                disabled={busy || wait > 0}
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px 24px', opacity: busy || wait > 0 ? 0.6 : 1 }}
              >
                <span />
                {busy ? 'Registering…' : wait > 0 ? `Try again in ${wait}s` : 'Complete Registration'} <ArrowRight size={15} />
              </button>
            </form>
          )}

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.8125rem', color: '#6385B2' }}>
            Institutional Access Strictly Restricted to{' '}
            <strong style={{ color: '#152E5A' }}>@{INSTITUTION.DOMAIN}</strong>
          </div>
        </div>
      </div>

    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════ */
/*  Styles - Matching Reference Warm Cream & Royal Navy               */
/* ═══════════════════════════════════════════════════════════════════ */
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF7EE',
    padding: '40px 16px',
  },
  cardWrap: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 500,
    margin: '0 auto',
  },
  welcomeTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8EEF6',
    color: '#204E96',
    fontSize: '0.72rem',
    fontWeight: 700,
    padding: '3px 12px',
    borderRadius: 6,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  portalTitle: {
    textAlign: 'center',
    fontSize: '1.45rem',
    fontWeight: 800,
    color: '#152E5A',
    margin: '0 0 6px',
    letterSpacing: '-0.02em',
  },
  subtext: {
    textAlign: 'center',
    fontSize: '0.875rem',
    color: '#354F77',
    margin: 0,
    lineHeight: 1.5,
  },
  tabRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
    backgroundColor: '#F4EFE0',
    padding: 4,
    borderRadius: 6,
    border: '1px solid #EBE5D5',
  },
  tabBtn: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    fontWeight: 600,
    fontSize: '0.8125rem',
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all .2s ease',
  },
  tabActive: {
    backgroundColor: '#204E96',
    color: '#FFFFFF',
    boxShadow: '0 2px 6px rgba(32, 78, 150, 0.25)',
  },
  tabInactive: {
    backgroundColor: 'transparent',
    color: '#354F77',
  },
  alertErr: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#FEF2F2',
    border: '1px solid #FCA5A5',
    borderRadius: 14,
    marginBottom: 16,
    fontSize: '0.8125rem',
    color: '#B91C1C',
  },
  alertOk: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#F0FDF4',
    border: '1px solid #86EFAC',
    borderRadius: 14,
    marginBottom: 16,
    fontSize: '0.8125rem',
    color: '#15803D',
  },
  resetTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#152E5A',
    margin: '0 0 12px',
  },
  label: {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#152E5A',
    marginBottom: 6,
  },
  req: {
    color: '#DC2626',
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    border: '1.5px solid #E0D9C8',
    borderRadius: 12,
    fontSize: '0.875rem',
    color: '#152E5A',
    background: '#FFFFFF',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color .15s ease, box-shadow .15s ease',
  },
  inputIco: {
    width: '100%',
    padding: '11px 14px 11px 38px',
    border: '1.5px solid #E0D9C8',
    borderRadius: 12,
    fontSize: '0.875rem',
    color: '#152E5A',
    background: '#FFFFFF',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color .15s ease, box-shadow .15s ease',
  },
  ico: {
    position: 'absolute' as const,
    left: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
  },
  domainTag: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#204E96',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  codeInput: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.25rem',
    letterSpacing: '0.35em',
    textAlign: 'center' as const,
    maxWidth: 220,
  },
  helpText: {
    fontSize: '0.75rem',
    color: '#354F77',
    margin: '6px 0 14px',
  },
  codeActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  srOnly: {
    position: 'absolute' as const,
    width: 1,
    height: 1,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap' as const,
    border: 0,
  },
  // On narrow phones the domain tag wraps below the input instead of crushing it
  usernameRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  usernameInput: {
    flex: '1 1 180px',
    minWidth: 0,
  },
  eyeBtn: {
    position: 'absolute' as const,
    right: 12,
    // Anchored to the input; top: 50% centred it on label + input and pushed it up
    bottom: 12,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
  },
  forgotBtn: {
    background: 'none',
    border: 'none',
    color: '#6385B2',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    padding: 0,
    fontWeight: 500,
    transition: 'color .15s',
  },
};

export default LoginPage;
