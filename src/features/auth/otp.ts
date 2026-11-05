// Email verification code rules; the server (Supabase Auth) enforces the same values.
export const OTP_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 60;

export const isOtpCode = (value: string): boolean => /^\d{6}$/.test(value);

/** CSPRNG with rejection sampling, so every 6-digit code is equally likely. */
export function generateOtpCode(): string {
  const space = 1_000_000;
  const limit = Math.floor(2 ** 32 / space) * space; // 4_294_000_000
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % space).padStart(OTP_LENGTH, '0');
}

// Keeps digits only, so a pasted "123 456" still works.
export const normalizeOtpInput = (value: string): string => value.replace(/\D/g, '').slice(0, OTP_LENGTH);

/** "aditya.sharma@muj.manipal.edu" -> "a***@muj.manipal.edu" */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}
