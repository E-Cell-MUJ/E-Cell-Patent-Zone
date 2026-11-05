-- =============================================================================
-- Migration: 20261029000100_frontend_direct_workflow.sql
-- Description: Serves the portal frontend as it calls the database today:
--              direct status updates for submit / resubmit / review, password
--              accounts through register_university_user, document replacement,
--              and the super admin console. The tamper-proof rules from
--              20261025000000 stay: status changes are validated here, and
--              snapshots and notifications are written only by the database.
--
-- Bootstrap the first super admin from the SQL editor:
--   UPDATE profiles SET role = 'super_admin' WHERE university_email = '<it admin email>';
-- =============================================================================

-- 1. ROLE HELPER
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$;

-- 2. PROFILES: super admin oversight; only a super admin changes roles over the API
DROP POLICY IF EXISTS "Users can view their own profile or Admin can view all" ON profiles;
CREATE POLICY "Users can view their own profile or Admin can view all"
ON profiles FOR SELECT
USING (auth.uid() = id OR is_admin() OR is_super_admin());

DROP POLICY IF EXISTS "Users can update their own non-role fields" ON profiles;
CREATE POLICY "Users can update their own non-role fields"
ON profiles FOR UPDATE
USING (auth.uid() = id OR is_admin() OR is_super_admin());

CREATE OR REPLACE FUNCTION check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    IF is_api_request() THEN
        IF NEW.role <> OLD.role AND NOT is_super_admin() THEN
            RAISE EXCEPTION 'Unauthorized: only a super admin can change account roles.';
        END IF;
        IF NEW.university_email <> OLD.university_email AND NOT is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: University email is bound to the verified account.';
        END IF;
    END IF;
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- 3. APPLICATIONS
-- shortcut: row access also exposes disclosure text over the API; the console only selects
-- milestone columns. Upgrade: serve the pipeline overview from a SECURITY DEFINER RPC and drop this.
DROP POLICY IF EXISTS "Super admin can view application pipeline" ON applications;
CREATE POLICY "Super admin can view application pipeline"
ON applications FOR SELECT
USING (is_super_admin());

-- Without WITH CHECK, USING also applies to the new row and rejects draft -> submitted.
-- trigger_guard_workflow_columns decides which status changes are allowed.
DROP POLICY IF EXISTS "Students can edit own drafts or corrections or Admin can edit" ON applications;
CREATE POLICY "Students can edit own drafts or corrections or Admin can edit"
ON applications FOR UPDATE
USING (
    (auth.uid() = owner_id AND status IN ('draft', 'corrections_required'))
    OR is_admin()
)
WITH CHECK (auth.uid() = owner_id OR is_admin());

-- Direct API updates may change status only along VALID_TRANSITIONS
-- (src/features/applications/workflow.ts). Version and submission time are set here.
CREATE OR REPLACE FUNCTION guard_application_workflow_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT is_api_request() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.status := 'draft';
        NEW.current_version := 1;
        NEW.submitted_at := NULL;
        -- Cleared so trigger_set_ref_num (runs after this one) always assigns from the sequence
        NEW.reference_number := NULL;
        RETURN NEW;
    END IF;

    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
        OR NEW.reference_number IS DISTINCT FROM OLD.reference_number THEN
        RAISE EXCEPTION 'Unauthorized: workflow fields change only through submission and review actions.';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'draft' AND NEW.status = 'submitted' AND OLD.owner_id = auth.uid() THEN
            NEW.submitted_at := timezone('utc'::text, now());
            NEW.current_version := OLD.current_version;
        ELSIF OLD.status = 'corrections_required' AND NEW.status = 'resubmitted' AND OLD.owner_id = auth.uid() THEN
            NEW.submitted_at := OLD.submitted_at;
            NEW.current_version := OLD.current_version + 1;
        ELSIF is_admin() AND (
            (OLD.status IN ('submitted', 'resubmitted') AND NEW.status IN ('under_review', 'corrections_required', 'approved_next_stage'))
            OR (OLD.status = 'under_review' AND NEW.status IN ('corrections_required', 'approved_next_stage'))
        ) THEN
            NEW.submitted_at := OLD.submitted_at;
            NEW.current_version := OLD.current_version;
        ELSE
            RAISE EXCEPTION 'Invalid status transition from % to %.', OLD.status, NEW.status;
        END IF;
    ELSIF NEW.current_version IS DISTINCT FROM OLD.current_version
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
        RAISE EXCEPTION 'Unauthorized: workflow fields change only through submission and review actions.';
    END IF;
    RETURN NEW;
END;
$$;

-- 4. WORKFLOW SIDE EFFECTS
-- One place for snapshots, correction resolution and notifications, whether the status
-- changed through a direct update or a workflow RPC. The frontend's own inserts into
-- application_versions / notifications are rejected by RLS and ignored by the client.
CREATE OR REPLACE FUNCTION handle_application_workflow_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notes TEXT := NULLIF(trim(current_setting('app.status_reason', true)), '');
    v_title TEXT := 'Application Status Updated';
    v_message TEXT := format('Application %s status is now: %s.', NEW.reference_number, NEW.status);
BEGIN
    IF NEW.status = 'submitted' THEN
        PERFORM assert_application_complete(NEW.id);
        INSERT INTO application_versions (application_id, version_number, snapshot_data, submitted_by, submission_notes)
        VALUES (NEW.id, NEW.current_version, application_snapshot(NEW.id), auth.uid(),
                COALESCE(v_notes, 'Submitted for initial review.'));
        INSERT INTO notifications (user_id, title, message, link)
        VALUES (
            NEW.owner_id,
            'Application Submitted',
            format('Your application (%s) has been submitted for review.', NEW.reference_number),
            '/applications/' || NEW.id
        );
    ELSIF NEW.status = 'resubmitted' THEN
        PERFORM assert_application_complete(NEW.id);
        UPDATE correction_requests
        SET status = 'addressed', resolved_at = timezone('utc'::text, now())
        WHERE application_id = NEW.id AND status = 'pending';
        INSERT INTO application_versions (application_id, version_number, snapshot_data, submitted_by, submission_notes)
        VALUES (NEW.id, NEW.current_version, application_snapshot(NEW.id), auth.uid(),
                COALESCE(v_notes, format('Resubmitted as Version %s with corrections.', NEW.current_version)));
        INSERT INTO notifications (user_id, title, message, link)
        SELECT
            id,
            'Application Resubmitted with Corrections',
            format('Application %s has been updated and resubmitted by the applicant.', NEW.reference_number),
            '/admin/applications/' || NEW.id
        FROM profiles
        WHERE role = 'admin';
    ELSE
        IF NEW.status = 'corrections_required' THEN
            v_title := 'Corrections Requested on Patent Application';
            v_message := format('The patent coordinator has requested specific corrections for %s. Please review the feedback.', NEW.reference_number);
        ELSIF NEW.status = 'approved_next_stage' THEN
            v_title := 'Application Approved for Next Stage';
            v_message := format('Application %s has been approved by the patent coordinator for internal patent filing.', NEW.reference_number);
        END IF;
        INSERT INTO notifications (user_id, title, message, link)
        VALUES (NEW.owner_id, v_title, v_message, '/applications/' || NEW.id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_application_workflow_effects ON applications;
CREATE TRIGGER trigger_application_workflow_effects
AFTER UPDATE OF status ON applications
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION handle_application_workflow_effects();

-- The RPCs keep their validation; their side effects now come from the trigger above.
CREATE OR REPLACE FUNCTION submit_application(p_application_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app applications%ROWTYPE;
BEGIN
    SELECT * INTO v_app FROM applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND OR v_app.owner_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Application not found.';
    END IF;
    IF v_app.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft applications can be submitted (current status: %).', v_app.status;
    END IF;
    PERFORM assert_application_complete(p_application_id);

    PERFORM set_config('app.status_reason', COALESCE(NULLIF(trim(p_notes), ''), 'Submitted for initial review.'), true);
    UPDATE applications
    SET status = 'submitted', submitted_at = timezone('utc'::text, now())
    WHERE id = p_application_id;
END;
$$;

CREATE OR REPLACE FUNCTION resubmit_application(p_application_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app applications%ROWTYPE;
    v_next INTEGER;
BEGIN
    SELECT * INTO v_app FROM applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND OR v_app.owner_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Application not found.';
    END IF;
    IF v_app.status <> 'corrections_required' THEN
        RAISE EXCEPTION 'Only applications awaiting corrections can be resubmitted (current status: %).', v_app.status;
    END IF;
    PERFORM assert_application_complete(p_application_id);

    v_next := v_app.current_version + 1;
    PERFORM set_config('app.status_reason',
        COALESCE(NULLIF(trim(p_notes), ''), format('Resubmitted as Version %s with corrections.', v_next)), true);
    UPDATE applications
    SET status = 'resubmitted', current_version = v_next
    WHERE id = p_application_id;
END;
$$;

CREATE OR REPLACE FUNCTION transition_application_status(
    p_application_id UUID,
    p_to_status application_status,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app applications%ROWTYPE;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: only the patent coordinator can change review status.';
    END IF;

    SELECT * INTO v_app FROM applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found.';
    END IF;

    IF NOT (
        (v_app.status IN ('submitted', 'resubmitted') AND p_to_status IN ('under_review', 'corrections_required', 'approved_next_stage'))
        OR (v_app.status = 'under_review' AND p_to_status IN ('corrections_required', 'approved_next_stage'))
    ) THEN
        RAISE EXCEPTION 'Invalid status transition from % to %.', v_app.status, p_to_status;
    END IF;

    PERFORM set_config('app.status_reason', COALESCE(NULLIF(trim(p_reason), ''), ''), true);
    UPDATE applications SET status = p_to_status WHERE id = p_application_id;
END;
$$;

-- 5. DOCUMENTS
-- deleteDocument() removes the metadata row when a student replaces a flawed file.
DROP POLICY IF EXISTS "Owners can remove documents from draft or correction applications" ON application_documents;
CREATE POLICY "Owners can remove documents from draft or correction applications"
ON application_documents FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_documents.application_id
        AND a.owner_id = auth.uid()
        AND a.status IN ('draft', 'corrections_required')
    )
    OR is_admin()
);

-- uploadDocument() uploads with upsert, which Storage only allows with an UPDATE policy.
DROP POLICY IF EXISTS "Users can overwrite documents for draft or correction applications" ON storage.objects;
CREATE POLICY "Users can overwrite documents for draft or correction applications"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'patent-documents' AND (
        is_admin() OR
        EXISTS (
            SELECT 1 FROM applications a
            WHERE a.id::text = (storage.foldername(name))[1]
            AND a.owner_id = auth.uid()
            AND a.status IN ('draft', 'corrections_required')
        )
    )
)
WITH CHECK (
    bucket_id = 'patent-documents' AND (
        is_admin() OR
        EXISTS (
            SELECT 1 FROM applications a
            WHERE a.id::text = (storage.foldername(name))[1]
            AND a.owner_id = auth.uid()
            AND a.status IN ('draft', 'corrections_required')
        )
    )
);

-- 6. PASSWORD ACCOUNTS
-- GoTrue email signups stay blocked; register_university_user is the only way in.
CREATE OR REPLACE FUNCTION enforce_university_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN
    IF NEW.email IS NULL OR lower(NEW.email) !~ '^[a-z0-9._-]+@muj\.manipal\.edu$' THEN
        RAISE EXCEPTION 'Registration Rejected: Only official @muj.manipal.edu email addresses are permitted.';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.raw_app_meta_data->>'provider' = 'email'
        AND current_setting('app.trusted_registration', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Registration Rejected: Register through the portal with your @muj.manipal.edu address.';
    END IF;
    RETURN NEW;
END;
$$;

-- Called by the login page (register) and the super admin console (password reset).
-- Accounts are confirmed immediately: mailbox ownership is NOT verified (accepted trade-off).
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
    v_email TEXT := lower(trim(p_email));
    v_uid UUID;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN
    IF v_email IS NULL OR v_email !~ '^[a-z0-9._-]+@muj\.manipal\.edu$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only official @muj.manipal.edu email addresses are permitted.');
    END IF;
    IF length(COALESCE(p_password, '')) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters in length.');
    END IF;

    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
    IF v_uid IS NOT NULL THEN
        -- Registering never takes over an existing account; only a super admin resets passwords
        IF NOT is_super_admin() THEN
            RETURN jsonb_build_object('success', false, 'error', 'An account with this email already exists. Please sign in.');
        END IF;
        UPDATE auth.users
        SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = v_now
        WHERE id = v_uid;
        RETURN jsonb_build_object('success', true, 'user_id', v_uid);
    END IF;

    IF length(trim(COALESCE(p_full_name, ''))) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Please enter your full legal name as registered in university records.');
    END IF;

    v_uid := gen_random_uuid();
    PERFORM set_config('app.trusted_registration', 'on', true);
    -- Token columns must be '' not NULL, or GoTrue fails to load the user at sign-in.
    -- handle_new_user() builds the profile (role always 'student') from the metadata.
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
        crypt(p_password, gen_salt('bf')), v_now,
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_strip_nulls(jsonb_build_object(
            'full_name', trim(p_full_name),
            'department', p_department,
            'registration_number', p_reg_no,
            'phone', p_phone
        )),
        v_now, v_now, '', '', '', ''
    );
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
        v_uid::text, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        'email', v_now, v_now, v_now
    );
    PERFORM set_config('app.trusted_registration', '', true);

    RETURN jsonb_build_object('success', true, 'user_id', v_uid);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'An account with this email already exists. Please sign in.');
END;
$$;

REVOKE EXECUTE ON FUNCTION register_university_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_university_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 7. SUPER ADMIN TELEMETRY (aggregates only, no disclosure content)
CREATE OR REPLACE FUNCTION get_superadmin_telemetry()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: super admin access required.';
    END IF;

    RETURN jsonb_build_object(
        'total_users', (SELECT count(*) FROM profiles),
        'total_students', (SELECT count(*) FROM profiles WHERE role = 'student'),
        'total_admins', (SELECT count(*) FROM profiles WHERE role = 'admin'),
        'total_applications', (SELECT count(*) FROM applications),
        'applications_by_status', COALESCE(
            (SELECT jsonb_object_agg(status, n) FROM (
                SELECT status, count(*) AS n FROM applications GROUP BY status
            ) s),
            '{}'::jsonb
        ),
        'applications_by_department', COALESCE(
            (SELECT jsonb_object_agg(dept, n) FROM (
                SELECT COALESCE(p.department, 'Not specified') AS dept, count(*) AS n
                FROM applications a JOIN profiles p ON p.id = a.owner_id
                GROUP BY 1
            ) d),
            '{}'::jsonb
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_superadmin_telemetry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_superadmin_telemetry() TO authenticated;
