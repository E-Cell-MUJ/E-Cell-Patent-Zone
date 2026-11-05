-- Rollback for 20261031000000_student_authenticator.sql
-- Students work again without the authenticator step (coordinator / super admin TOTP stays).
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'applications', 'inventors', 'application_documents', 'application_versions',
        'correction_requests', 'application_comments', 'application_status_history', 'notifications'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Patent records need an authenticator session" ON %I', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['applications', 'inventors', 'application_documents'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_require_authenticator_session ON %I', t);
    END LOOP;
END $$;

DROP POLICY IF EXISTS "Patent files need an authenticator session" ON storage.objects;
DROP FUNCTION IF EXISTS require_authenticator_session();
