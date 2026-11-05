-- =============================================================================
-- Migration: 20261031000000_student_authenticator.sql
-- Description: Students pass TOTP too. Every patent record is readable and writable
--              only from an aal2 session (password + authenticator code), for every
--              role. Profiles stay readable at aal1 so the portal can show the
--              authenticator step after the password.
--
-- Relies on is_aal2() from 20261029000200. Supabase settings:
--   [auth.mfa.totp] enroll_enabled = verify_enabled = true.
-- Self-service reset of a lost authenticator: Edge Function reset-authenticator.
-- =============================================================================

-- 1. RESTRICTIVE POLICIES: ANDed with every existing policy on these tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'applications', 'inventors', 'application_documents', 'application_versions',
        'correction_requests', 'application_comments', 'application_status_history', 'notifications'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Patent records need an authenticator session" ON %I', t);
        EXECUTE format(
            'CREATE POLICY "Patent records need an authenticator session" ON %I AS RESTRICTIVE FOR ALL TO authenticated USING (is_aal2()) WITH CHECK (is_aal2())',
            t
        );
    END LOOP;
END $$;

DROP POLICY IF EXISTS "Patent files need an authenticator session" ON storage.objects;
CREATE POLICY "Patent files need an authenticator session"
ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (bucket_id NOT IN ('patent-documents', 'patent-drawings') OR is_aal2())
WITH CHECK (bucket_id NOT IN ('patent-documents', 'patent-drawings') OR is_aal2());

-- 2. SECURITY DEFINER RPCs bypass RLS, so writes are also checked by trigger.
-- auth.uid() is NULL for the SQL editor and the service role, which stay allowed.
CREATE OR REPLACE FUNCTION require_authenticator_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT is_aal2() THEN
        RAISE EXCEPTION 'Enter the code from your authenticator app first.'
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['applications', 'inventors', 'application_documents'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_require_authenticator_session ON %I', t);
        EXECUTE format(
            'CREATE TRIGGER trigger_require_authenticator_session BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION require_authenticator_session()',
            t
        );
    END LOOP;
END $$;
