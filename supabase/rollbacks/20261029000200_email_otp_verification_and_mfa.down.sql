-- =============================================================================
-- Rollback for 20261029000200_email_otp_verification_and_mfa.sql
-- Run by hand (SQL editor or psql) if OTP delivery or TOTP blocks users.
--
-- Safe mode, not a full revert: new sign-ups are CLOSED ("Registration is
-- temporarily unavailable"), never reopened without a code. Accounts that are
-- already verified keep signing in; accounts awaiting re-verification can still
-- confirm with an emailed code. Kept on purpose: profile-after-confirmation,
-- the password-reset-only register_university_user, and the audit read RPC.
-- =============================================================================

UPDATE app_settings
SET value = 'false'::jsonb, updated_at = timezone('utc'::text, now())
WHERE key = 'registration_enabled';

-- Coordinators and super admins work again without the TOTP step
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin');
$$;

DROP POLICY IF EXISTS "Students can create draft applications" ON applications;
CREATE POLICY "Students can create draft applications"
ON applications FOR INSERT
WITH CHECK (auth.uid() = owner_id AND status = 'draft');

DROP TRIGGER IF EXISTS trigger_limit_daily_drafts ON applications;
DROP FUNCTION IF EXISTS limit_daily_drafts();
DROP FUNCTION IF EXISTS count_recent_applications(UUID);
