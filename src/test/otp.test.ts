import { describe, it, expect } from 'vitest';
import { isOtpCode, maskEmail, normalizeOtpInput } from '../features/auth/otp';

describe('email verification code helpers', () => {
  it('accepts exactly six digits', () => {
    expect(isOtpCode('012345')).toBe(true);
    expect(isOtpCode('12345')).toBe(false);
    expect(isOtpCode('1234567')).toBe(false);
    expect(isOtpCode('12a456')).toBe(false);
    expect(isOtpCode(' 123456')).toBe(false);
  });

  it('keeps digits from pasted codes and caps the length', () => {
    expect(normalizeOtpInput('123 456')).toBe('123456');
    expect(normalizeOtpInput('Code: 98-76-54-3')).toBe('987654');
    expect(normalizeOtpInput('abc')).toBe('');
  });

  it('masks the mailbox name but keeps the domain', () => {
    expect(maskEmail('Aditya.Sharma@MUJ.manipal.edu')).toBe('a***@muj.manipal.edu');
    expect(maskEmail('x@muj.manipal.edu')).toBe('x***@muj.manipal.edu');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
