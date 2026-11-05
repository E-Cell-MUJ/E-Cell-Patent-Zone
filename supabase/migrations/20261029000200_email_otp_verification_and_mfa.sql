-- =============================================================================
-- Migration: 20261029000200_email_otp_verification_and_mfa.sql
-- Description: Self-registration moves to Supabase Auth sign-up with a 6-digit
--              emailed code (the old register_university_user path becomes
--              password reset only),
--              plus a registration kill switch, a daily draft limit, an
--              unverified sign-up purge and an audit read view. Coordinator and
--              super admin access requires TOTP (AAL2).
--
-- Auth settings this relies on (config.toml locally; same values in the dashboard):
--   [auth.email] enable_confirmations = true ("Confirm email" on), otp_length = 6,
--   otp_expiry = 600; confirmation / recovery / magic-link templates show {{ .Token }};
--   custom SMTP (the built-in sender allows only a few emails per hour); CAPTCHA.
--   [auth.mfa.totp] enroll_enabled = verify_enabled = true.
-- Existing accounts are not reset to unverified (no user data is changed).
--
-- Rollback: supabase/rollbacks/20261029000200_email_otp_verification_and_mfa.down.sql
-- (it closes self-registration; it never reopens unverified sign-up).
-- =============================================================================

-- 1. KILL SWITCH (server side; the frontend only shows the error it returns)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public settings are readable" ON app_settings;
CREATE POLICY "Public settings are readable"
ON app_settings FOR SELECT
USING (key IN ('registration_enabled'));
-- Named registration_enabled, not registration_otp_required: "off" must mean
-- "registration closed", never "registration without a code".
INSERT INTO app_settings (key, value) VALUES ('registration_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION registration_enabled()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT COALESCE((SELECT value = 'true'::jsonb FROM app_settings WHERE key = 'registration_enabled'), false);
$$;

-- 2. SIGN-UP GATE ON auth.users
-- Email sign-ups now come from GoTrue (unconfirmed until the OTP is entered).
-- The app.trusted_registration bypass is gone.
CREATE OR REPLACE FUNCTION enforce_university_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN
    IF NEW.email IS NULL OR lower(NEW.email) !~ '^[a-z0-9._-]+@muj\.manipal\.edu$' THEN
        RAISE EXCEPTION 'Registration Rejected: Only official @muj.manipal.edu email addresses are permitted.';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.raw_app_meta_data->>'provider' = 'email' AND NOT registration_enabled() THEN
        RAISE EXCEPTION 'Registration is temporarily unavailable. Please try again later.';
    END IF;
    RETURN NEW;
END;
$$;

-- 3. PROFILE ONLY AFTER THE MAILBOX IS PROVEN
-- Microsoft (Azure) users arrive confirmed; email users get confirmed by verifyOtp.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email_confirmed_at IS NULL THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.profiles (id, university_email, full_name, role, department, registration_number, phone)
    VALUES (
        NEW.id,
        lower(NEW.email),
        COALESCE(
            NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
            split_part(NEW.email, '@', 1)
        ),
        'student',
        NULLIF(trim(NEW.raw_user_meta_data->>'department'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'registration_number'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION is_mailbox_verified()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
    );
$$;

-- 4. PASSWORD RESET ONLY (self-registration moved to Supabase Auth sign-up)
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
    RETURN jsonb_build_object('success', true, 'user_id', v_uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION register_university_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_university_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 5. COORDINATOR AND SUPER ADMIN POWERS REQUIRE TOTP (AAL2)
-- Every admin policy, trigger and RPC goes through these two helpers, so an admin
-- signed in with a password only is treated as a student until the TOTP step.
CREATE OR REPLACE FUNCTION is_aal2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT is_aal2() AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT is_aal2() AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$;

-- 6. FAKE-APPLICATION DEFENCE
DROP POLICY IF EXISTS "Students can create draft applications" ON applications;
CREATE POLICY "Students can create draft applications"
ON applications FOR INSERT
WITH CHECK (auth.uid() = owner_id AND status = 'draft' AND is_mailbox_verified());

-- Counts rows RLS would hide from the caller, so it runs as the owner.
CREATE OR REPLACE FUNCTION count_recent_applications(p_owner UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT count(*)::int FROM applications
    WHERE owner_id = p_owner
    AND created_at > timezone('utc'::text, now()) - interval '1 day';
$$;

-- SECURITY INVOKER so is_api_request() sees the real caller.
CREATE OR REPLACE FUNCTION limit_daily_drafts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    IF is_api_request() AND count_recent_applications(NEW.owner_id) >= 10 THEN
        RAISE EXCEPTION 'Daily limit reached: at most 10 new disclosures per day. Contact the IPR cell if you need more.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_limit_daily_drafts ON applications;
CREATE TRIGGER trigger_limit_daily_drafts
BEFORE INSERT ON applications
FOR EACH ROW
EXECUTE FUNCTION limit_daily_drafts();

-- 7. UNVERIFIED SIGN-UP PURGE (24 h); accounts awaiting re-verification keep their data
CREATE OR REPLACE FUNCTION purge_unverified_signups()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH gone AS (
        DELETE FROM auth.users u
        WHERE u.email_confirmed_at IS NULL
        AND u.created_at < timezone('utc'::text, now()) - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
        RETURNING 1
    )
    SELECT count(*)::int FROM gone;
$$;

REVOKE EXECUTE ON FUNCTION purge_unverified_signups() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('purge-unverified-signups', '15 * * * *', 'SELECT public.purge_unverified_signups()');
    ELSE
        RAISE NOTICE 'pg_cron is not enabled: enable it, then schedule SELECT public.purge_unverified_signups() hourly.';
    END IF;
END $$;

-- 8. AUDIT READ VIEW (GoTrue writes auth.audit_log_entries: sign-ups, OTP sends,
-- confirmations, logins, MFA). Super admin only; no edit or delete path.
CREATE OR REPLACE FUNCTION get_auth_audit_events(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (created_at TIMESTAMPTZ, ip_address TEXT, action TEXT, actor TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: super admin access required.';
    END IF;
    RETURN QUERY
    SELECT e.created_at, e.ip_address::text, e.payload->>'action', e.payload->>'actor_username'
    FROM auth.audit_log_entries e
    ORDER BY e.created_at DESC
    LIMIT least(greatest(p_limit, 1), 1000);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_auth_audit_events(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_auth_audit_events(INTEGER) TO authenticated;
