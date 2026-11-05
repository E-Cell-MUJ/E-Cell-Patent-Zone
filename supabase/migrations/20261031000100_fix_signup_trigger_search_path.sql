-- =============================================================================
-- Migration: 20261031000100_fix_signup_trigger_search_path.sql
-- Description: Sign-up failed with "Database error saving new user". Supabase Auth
--              inserts into auth.users with search_path = auth, so the unqualified
--              registration_enabled() call in this trigger was not found.
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_university_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN
    IF NEW.email IS NULL OR lower(NEW.email) !~ '^[a-z0-9._-]+@muj\.manipal\.edu$' THEN
        RAISE EXCEPTION 'Registration Rejected: Only official @muj.manipal.edu email addresses are permitted.';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.raw_app_meta_data->>'provider' = 'email' AND NOT public.registration_enabled() THEN
        RAISE EXCEPTION 'Registration is temporarily unavailable. Please try again later.';
    END IF;
    RETURN NEW;
END;
$$;
