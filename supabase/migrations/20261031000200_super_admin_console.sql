-- =============================================================================
-- Migration: 20261031000200_super_admin_console.sql
-- Description: Super admin console: account directory with sign-in security
--              status, account actions (reset authenticator, sign out everywhere,
--              suspend / reactivate), registration switch, a pipeline overview
--              without disclosure content, and an audit log of every super admin
--              action. Every function checks is_super_admin() (role + aal2).
-- =============================================================================

-- 1. AUDIT LOG (append-only: written by the functions below, readable by super admins)
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id UUID,
    actor_email TEXT,
    action TEXT NOT NULL,
    target_id UUID,
    target_email TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins read the audit log" ON admin_audit_log;
CREATE POLICY "Super admins read the audit log" ON admin_audit_log FOR SELECT USING (is_super_admin());
REVOKE INSERT, UPDATE, DELETE ON admin_audit_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION log_admin_action(p_action TEXT, p_target UUID, p_details JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO admin_audit_log (actor_id, actor_email, action, target_id, target_email, details)
    VALUES (
        auth.uid(),
        (SELECT email FROM auth.users WHERE id = auth.uid()),
        p_action,
        p_target,
        (SELECT email FROM auth.users WHERE id = p_target),
        COALESCE(p_details, '{}'::jsonb)
    );
$$;
REVOKE EXECUTE ON FUNCTION log_admin_action(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION require_super_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: super admin access required.' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- Role changes over the API (only super admins may make them) are logged by trigger
CREATE OR REPLACE FUNCTION log_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        PERFORM log_admin_action('role_changed', NEW.id, jsonb_build_object('from', OLD.role, 'to', NEW.role));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_profile_role_change ON profiles;
CREATE TRIGGER trigger_log_profile_role_change
AFTER UPDATE OF role ON profiles
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION log_profile_role_change();

-- 2. DIRECTORY: every account, including sign-ups that never verified their email
CREATE OR REPLACE FUNCTION get_user_directory()
RETURNS TABLE (
    id UUID,
    email TEXT,
    full_name TEXT,
    role TEXT,
    department TEXT,
    registration_number TEXT,
    created_at TIMESTAMPTZ,
    email_confirmed_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    has_authenticator BOOLEAN,
    suspended BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    PERFORM require_super_admin();
    RETURN QUERY
    SELECT
        u.id,
        lower(u.email)::text,
        p.full_name,
        p.role::text,
        p.department,
        p.registration_number,
        u.created_at,
        u.email_confirmed_at,
        u.last_sign_in_at,
        EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status::text = 'verified'),
        COALESCE(u.banned_until > now(), false)
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    ORDER BY u.created_at DESC;
END;
$$;

-- 3. ACCOUNT ACTIONS
-- Next sign-in asks the user to set up a new authenticator app
CREATE OR REPLACE FUNCTION admin_reset_authenticator(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_removed INTEGER;
BEGIN
    PERFORM require_super_admin();
    IF p_user = auth.uid() THEN
        RAISE EXCEPTION 'Ask another super admin to reset your own authenticator.';
    END IF;
    WITH gone AS (DELETE FROM auth.mfa_factors WHERE user_id = p_user RETURNING 1)
    SELECT count(*) INTO v_removed FROM gone;
    DELETE FROM auth.sessions WHERE user_id = p_user;
    PERFORM log_admin_action('authenticator_reset', p_user, jsonb_build_object('factors_removed', v_removed));
END;
$$;

-- Ends every session (refresh tokens); open tabs lose access when their token expires
CREATE OR REPLACE FUNCTION admin_sign_out_user(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ended INTEGER;
BEGIN
    PERFORM require_super_admin();
    WITH gone AS (DELETE FROM auth.sessions WHERE user_id = p_user RETURNING 1)
    SELECT count(*) INTO v_ended FROM gone;
    PERFORM log_admin_action('signed_out_everywhere', p_user, jsonb_build_object('sessions_ended', v_ended));
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_suspended(p_user UUID, p_suspended BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM require_super_admin();
    IF p_user = auth.uid() THEN
        RAISE EXCEPTION 'You cannot suspend your own account.';
    END IF;
    IF p_suspended AND EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND role = 'super_admin') THEN
        RAISE EXCEPTION 'Change this account''s role before suspending it: super admins cannot be suspended.';
    END IF;
    UPDATE auth.users
    SET banned_until = CASE WHEN p_suspended THEN 'infinity'::timestamptz ELSE NULL END
    WHERE id = p_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found.';
    END IF;
    IF p_suspended THEN
        DELETE FROM auth.sessions WHERE user_id = p_user;
    END IF;
    PERFORM log_admin_action(
        CASE WHEN p_suspended THEN 'account_suspended' ELSE 'account_reactivated' END,
        p_user,
        jsonb_strip_nulls(jsonb_build_object('reason', NULLIF(trim(p_reason), '')))
    );
END;
$$;

-- 4. PASSWORD RESET (same rules as 20261029000200, now logged)
CREATE OR REPLACE FUNCTION register_university_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_department TEXT DEFAULT NULL,
    p_reg_no TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
BEGIN
    IF NOT is_super_admin() THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Register with your university email; a verification code will be sent to your inbox.');
    END IF;
    IF length(COALESCE(p_password, '')) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters in length.');
    END IF;

    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(trim(p_email));
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No account exists for this email.');
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = timezone('utc'::text, now())
    WHERE id = v_uid;
    PERFORM log_admin_action('password_reset', v_uid);
    RETURN jsonb_build_object('success', true, 'user_id', v_uid);
END;
$$;

-- 5. REGISTRATION SWITCH
CREATE OR REPLACE FUNCTION set_registration_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM require_super_admin();
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('registration_enabled', to_jsonb(p_enabled), timezone('utc'::text, now()))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
    PERFORM log_admin_action(CASE WHEN p_enabled THEN 'registration_opened' ELSE 'registration_closed' END, NULL);
END;
$$;

-- 6. PIPELINE: milestones only, never disclosure content
CREATE OR REPLACE FUNCTION get_pipeline_overview()
RETURNS TABLE (
    id UUID,
    reference_number TEXT,
    status TEXT,
    current_version INTEGER,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    applicant_name TEXT,
    applicant_email TEXT,
    applicant_department TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    PERFORM require_super_admin();
    RETURN QUERY
    SELECT a.id, a.reference_number::text, a.status::text, a.current_version, a.submitted_at, a.created_at, a.updated_at,
           p.full_name, p.university_email, COALESCE(p.department, 'Not specified')
    FROM applications a
    LEFT JOIN profiles p ON p.id = a.owner_id
    ORDER BY a.updated_at DESC;
END;
$$;

-- The overview now comes from the function above, so super admins lose direct row
-- access to applications (which exposed disclosure text over the API).
DROP POLICY IF EXISTS "Super admin can view application pipeline" ON applications;

-- 7. GRANTS
DO $$
DECLARE
    f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'get_user_directory()', 'admin_reset_authenticator(uuid)', 'admin_sign_out_user(uuid)',
        'admin_set_suspended(uuid, boolean, text)', 'set_registration_enabled(boolean)',
        'get_pipeline_overview()', 'require_super_admin()'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION log_profile_role_change() FROM PUBLIC, anon, authenticated;
