/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PORTAL_BASE_URL?: string;
  readonly VITE_INSTITUTION_NAME?: string;
  readonly VITE_INSTITUTION_SHORT_NAME?: string;
  readonly VITE_INSTITUTION_WEBSITE_URL?: string;
  readonly VITE_IPR_CELL_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_COORDINATOR_NAME?: string;
  readonly VITE_COORDINATOR_EMAIL?: string;
  readonly VITE_ALLOWED_EMAIL_DOMAIN?: string;
  readonly VITE_STORAGE_BUCKET_DOCS?: string;
  readonly VITE_STORAGE_BUCKET_DRAWINGS?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
