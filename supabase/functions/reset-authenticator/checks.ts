// Rules for a self-service authenticator reset: one session signed in with the password and a
// second, fresh one from the emailed code, both for the same account. Pure so it runs in tests.

export interface JwtClaims {
  sub?: string;
  session_id?: string;
  amr?: { method: string; timestamp: number }[];
}

export const EMAIL_CODE_MAX_AGE_SECONDS = 600;

export function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

/** Returns why the reset is refused, or null when both factors are proven. */
export function checkResetTokens(password: JwtClaims | null, emailCode: JwtClaims | null, nowSeconds: number): string | null {
  if (!password?.sub || password.sub !== emailCode?.sub) return 'Both sign-ins must belong to the same account.';
  if (password.session_id && password.session_id === emailCode.session_id) return 'Enter the code from the email first.';
  if (!password.amr?.some((m) => m.method === 'password')) return 'Sign in with your password first.';
  // verifyOtp records "otp"; older GoTrue versions record "magiclink" for the same email code
  const viaEmail = emailCode.amr?.find((m) => m.method === 'otp' || m.method === 'magiclink');
  if (!viaEmail || nowSeconds - viaEmail.timestamp > EMAIL_CODE_MAX_AGE_SECONDS) return 'Enter a fresh code from the email.';
  return null;
}
