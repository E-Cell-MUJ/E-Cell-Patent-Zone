import { validateMujEmail } from '../../lib/supabase';
import { INSTITUTION } from '../../config/constants';

export const ALLOWED_EMAIL_DOMAIN = INSTITUTION.EMAIL_AT_DOMAIN;

export function isAllowedUniversityEmail(email: string): boolean {
  if (!email) return false;
  return validateMujEmail(email);
}
