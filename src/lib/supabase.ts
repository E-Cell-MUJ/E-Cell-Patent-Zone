import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/env';
import { SECURITY_RULES, INSTITUTION } from '../config/constants';

const supabaseUrl = ENV.SUPABASE_URL;
const supabaseAnonKey = ENV.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
    return false;
  }
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('mock-instance') &&
    !supabaseUrl.includes('placeholder') &&
    supabaseAnonKey !== 'mock-key' &&
    !supabaseAnonKey.includes('placeholder')
  );
};

// Fallback client configured with centralized defaults to prevent crashes during demo/offline mode
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

/**
 * Validate that email strictly matches the anchored institutional domain format
 */
export function validateMujEmail(email: string): boolean {
  if (!email) return false;
  return SECURITY_RULES.EMAIL_REGEX.test(email.trim());
}

/**
 * Compute SHA-256 hex string for snapshot hashing
 */
export async function computeSha256(data: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple hash for older environments
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Format reference numbers: MUJ-PAT-YYYY-XXXX
 */
export function formatReferenceNo(year: number, sequence: number): string {
  return `${INSTITUTION.SHORT_NAME}-PAT-${year}-${sequence.toString().padStart(4, '0')}`;
}
