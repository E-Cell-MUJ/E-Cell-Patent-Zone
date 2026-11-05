import React, { useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { isOtpCode, normalizeOtpInput } from '../features/auth/otp';
import { ENV } from '../config/env';
import { Turnstile } from './Turnstile';

/** TOTP step for every role: enroll an authenticator app once, then enter its code each sign-in. */
export const MfaGate: React.FC = () => {
  const { mfaStatus, enrollTotp, verifyTotpMfa, signOut, currentUser, sendAuthenticatorResetCode, confirmAuthenticatorReset } =
    useAuth();
  const [setup, setSetup] = useState<{ qrCode: string; secret: string; otpauthUri?: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Lost authenticator (students): emailed code, then set up a new app
  const [lost, setLost] = useState<null | 'start' | 'sent'>(null);
  const [lostCode, setLostCode] = useState('');
  const [lostInfo, setLostInfo] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const isStudent = currentUser?.role === 'student';
  const enrolling = mfaStatus === 'enroll';
  const showCodeForm = !enrolling || setup !== null;

  const startSetup = async () => {
    setBusy(true);
    setError(null);
    const result = await enrollTotp();
    setBusy(false);
    if ('error' in result) setError(result.error);
    else setSetup(result);
  };

  const takeCaptcha = () => {
    if (ENV.TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Please complete the security check.');
      return null;
    }
    const token = captchaToken ?? undefined;
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    return { token };
  };

  const sendLostCode = async () => {
    setError(null);
    const captcha = takeCaptcha();
    if (!captcha) return;
    setBusy(true);
    const r = await sendAuthenticatorResetCode(captcha.token);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setLost('sent');
    setLostCode('');
    setLostInfo(`A 6-digit code is on its way to ${currentUser?.university_email}.`);
  };

  const onLostVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isOtpCode(lostCode)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    const captcha = takeCaptcha();
    if (!captcha) return;
    setBusy(true);
    const r = await confirmAuthenticatorReset(lostCode, captcha.token);
    setBusy(false);
    if (r.error) {
      setLostCode('');
      setError(r.error);
      return;
    }
    setLost(null);
    setSetup(null);
    setCode('');
    setLostInfo('Your old authenticator was removed. Set up the new one.');
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isOtpCode(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    const ok = await verifyTotpMfa(code);
    setBusy(false);
    if (!ok) {
      setError('That code did not match. Try the current code from your app.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-sunken)',
        padding: 24,
      }}
    >
      <div className="card" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={24} style={{ color: 'var(--brand-primary)' }} aria-hidden="true" />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Authenticator code</h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {enrolling ? 'Set up an authenticator app for your account' : 'Enter the code from your authenticator app'}
            </p>
          </div>
        </div>

        <div className="card-body">
          <p style={{ marginTop: 0 }}>
            {currentUser?.role === 'super_admin' ? 'Super admin' : currentUser?.role === 'admin' ? 'Coordinator' : 'Portal'} access
            needs a 6-digit code from an authenticator app such as Microsoft Authenticator, Google Authenticator or Authy.
          </p>

          {enrolling && !setup && (
            <div>
              <p style={{ marginTop: 0 }}>
                This account uses an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password)
                to protect patent records.
              </p>
              <button type="button" className="btn btn-primary" onClick={startSetup} disabled={busy}>
                Set up authenticator app
              </button>
            </div>
          )}

          {setup && (
            <div style={{ marginBottom: 16 }}>
              {setup.qrCode ? (
                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                  <img
                    src={setup.qrCode}
                    alt="Scan this QR code with your authenticator app"
                    style={{ width: 180, height: 180, display: 'inline-block' }}
                  />
                </div>
              ) : null}
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Or enter this key manually in your app:
              </p>
              <code
                style={{
                  display: 'block',
                  padding: 8,
                  background: 'var(--surface-sunken)',
                  borderRadius: 4,
                  wordBreak: 'break-all',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.875rem',
                }}
              >
                {setup.secret}
              </code>
            </div>
          )}

          {showCodeForm && !lost && (
            <form onSubmit={onVerify} noValidate>
              <div className="form-group">
                <label htmlFor="totp-code" className="form-label">
                  6-digit code
                </label>
                <input
                  id="totp-code"
                  className="form-control"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(normalizeOtpInput(e.target.value))}
                  placeholder="123456"
                  autoFocus
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', fontSize: '1.25rem', maxWidth: 200 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  <span />
                  {busy ? 'Checking…' : enrolling ? 'Confirm and sign in' : 'Verify'}
                </button>
              </div>
            </form>
          )}

          {lostInfo && (
            <div role="status" className="alert alert-success" style={{ marginTop: 16 }}>
              <span>{lostInfo}</span>
            </div>
          )}

          {isStudent && mfaStatus === 'challenge' && !lost && (
            <button
              type="button"
              onClick={() => setLost('start')}
              style={{ marginTop: 12, padding: 0, background: 'none', border: 'none', color: 'var(--accent-primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              Lost your authenticator app?
            </button>
          )}

          {lost === 'start' && (
            <div style={{ marginTop: 16 }}>
              <p style={{ marginTop: 0 }}>
                We will email a 6-digit code to <strong>{currentUser?.university_email}</strong>. With your password (already
                entered) and that code, your old authenticator is removed and you set up a new one.
              </p>
              <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={sendLostCode} disabled={busy}>
                  <span />
                  {busy ? 'Sending…' : 'Email me a code'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setLost(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {lost === 'sent' && (
            <form onSubmit={onLostVerify} noValidate style={{ marginTop: 16 }}>
              <div className="form-group">
                <label htmlFor="lost-code" className="form-label">
                  Code from the email
                </label>
                <input
                  id="lost-code"
                  className="form-control"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={lostCode}
                  onChange={(e) => setLostCode(normalizeOtpInput(e.target.value))}
                  autoFocus
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', fontSize: '1.1rem', maxWidth: 200 }}
                />
              </div>
              <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  <span />
                  {busy ? 'Checking…' : 'Reset authenticator'}
                </button>
                <button type="button" className="btn btn-outline" onClick={sendLostCode} disabled={busy}>
                  Send a new code
                </button>
              </div>
            </form>
          )}

          {error && (
            <div id="totp-error" role="alert" className="alert alert-danger" style={{ marginTop: 16 }}>
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="card-footer">
          <button type="button" className="btn btn-outline" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
