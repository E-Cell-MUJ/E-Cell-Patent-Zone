/**
 * Application Environment Configuration
 * Centralized access to Vite environment variables with type safety, fallback defaults,
 * and fail-fast production startup validation.
 */

const isLiveSupabase = Boolean(
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_SUPABASE_URL &&
  !String(import.meta.env.VITE_SUPABASE_URL).includes('mock-instance') &&
  !String(import.meta.env.VITE_SUPABASE_URL).includes('placeholder') &&
  import.meta.env?.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_ANON_KEY !== 'mock-key' &&
  !String(import.meta.env.VITE_SUPABASE_ANON_KEY).includes('placeholder')
);

export const ENV = {
  SUPABASE_URL: (import.meta.env.VITE_SUPABASE_URL as string) || 'https://mock-instance.supabase.co',
  SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'mock-key',
  PORTAL_BASE_URL: (import.meta.env.VITE_PORTAL_BASE_URL as string) || 'https://patents.muj.manipal.edu',
  INSTITUTION_NAME: (import.meta.env.VITE_INSTITUTION_NAME as string) || 'Manipal University Jaipur',
  INSTITUTION_SHORT_NAME: (import.meta.env.VITE_INSTITUTION_SHORT_NAME as string) || 'MUJ',
  INSTITUTION_WEBSITE_URL: (import.meta.env.VITE_INSTITUTION_WEBSITE_URL as string) || 'https://jaipur.manipal.edu',
  IPR_CELL_URL: (import.meta.env.VITE_IPR_CELL_URL as string) || 'https://jaipur.manipal.edu/research/ipr-cell',
  CONTACT_EMAIL: (import.meta.env.VITE_CONTACT_EMAIL as string) || 'ipr.cell@muj.manipal.edu',
  COORDINATOR_NAME: (import.meta.env.VITE_COORDINATOR_NAME as string) || 'Dr. Dorelal Sharma',
  COORDINATOR_EMAIL: (import.meta.env.VITE_COORDINATOR_EMAIL as string) || 'dorelal.coordinator@muj.manipal.edu',
  ALLOWED_EMAIL_DOMAIN: (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN as string) || 'muj.manipal.edu',
  STORAGE_BUCKET_DOCS: (import.meta.env.VITE_STORAGE_BUCKET_DOCS as string) || 'patent-documents',
  STORAGE_BUCKET_DRAWINGS: (import.meta.env.VITE_STORAGE_BUCKET_DRAWINGS as string) || 'patent-drawings',
  APP_ENV: (import.meta.env.VITE_APP_ENV as string) || (isLiveSupabase ? 'production' : 'development'),
  // Public Cloudflare Turnstile site key; empty disables the widget (local dev, test mode)
  TURNSTILE_SITE_KEY: (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '',
} as const;

export type AppEnvironment = typeof ENV;

/**
 * Validate that mandatory environment configuration is present in production environments.
 * Throws a fatal configuration error to fail fast if critical production configuration is missing.
 */
export function validateEnvironment(env: typeof ENV = ENV): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (env.APP_ENV === 'production') {
    if (!env.SUPABASE_URL || env.SUPABASE_URL.includes('mock-instance') || env.SUPABASE_URL.includes('placeholder')) {
      missing.push('VITE_SUPABASE_URL');
    }
    if (!env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY === 'mock-key' || env.SUPABASE_ANON_KEY.includes('placeholder')) {
      missing.push('VITE_SUPABASE_ANON_KEY');
    }
    if (!env.PORTAL_BASE_URL) {
      missing.push('VITE_PORTAL_BASE_URL');
    }
    if (missing.length > 0) {
      const errMessage = `[SECURITY FATAL] Production startup failure: Missing or placeholder environment variables: ${missing.join(', ')}. Populate these variables in your deployment environment.`;
      console.error(errMessage);
      throw new Error(errMessage);
    }
  }
  return { valid: true, missing };
}

// Log operational mode on initialization
if (typeof console !== 'undefined') {
  if (isLiveSupabase) {
    try {
      validateEnvironment();
      console.info('[PORTAL] Production Supabase environment verified.');
    } catch (err) {
      console.error(err);
    }
  } else {
    console.warn('[PORTAL] Live Supabase is not configured. Connect VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for live data.');
  }
}
