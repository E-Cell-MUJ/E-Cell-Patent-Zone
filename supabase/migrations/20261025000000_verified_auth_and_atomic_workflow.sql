-- =============================================================================
-- Migration: 20261025000000_verified_auth_and_atomic_workflow.sql
-- Description: Restricts accounts to @muj.manipal.edu Microsoft (Outlook)
--              sign-in at the database level, closes privilege escalation
--              holes, and moves multi-step
--              workflow writes (save, submit, resubmit, review transitions)
--              into atomic RPCs so the frontend never sees half-applied or
--              silently rejected writes.
-- =============================================================================

-- 1. TRUST HELPER
-- PostgREST runs every client request as `anon` or `authenticated`.
-- SECURITY DEFINER RPCs, the SQL editor and the service role run as other roles.
CREATE OR REPLACE FUNCTION is_api_request()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT current_user IN ('anon', 'authenticated');
$$;

-- 2. UNIVERSITY ACCOUNT GATE (server side; the client check alone is bypassable)
CREATE OR REPLACE FUNCTION enforce_university_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN
    IF NEW.email IS NULL OR lower(NEW.email) !~ '^[a-z0-9._-]+@muj\.manipal\.edu$' THEN
        RAISE EXCEPTION 'Registration Rejected: Only official @muj.manipal.edu email addresses are permitted.';
    END IF;
    -- Accounts come only from Microsoft sign-in. A password signup would let anyone claim a
    -- college address without proving mailbox ownership (and later hijack it via identity linking).
    IF TG_OP = 'INSERT' AND NEW.raw_app_meta_data->>'provider' = 'email' THEN
        RAISE EXCEPTION 'Registration Rejected: Sign in with your @muj.manipal.edu Microsoft account.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_university_email_domain ON auth.users;
CREATE TRIGGER enforce_university_email_domain
BEFORE INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION enforce_university_email_domain();

-- 3. PROFILE CREATION FROM IDENTITY METADATA (role is never taken from metadata)
-- Microsoft supplies `name` (and Supabase may copy it to `full_name`).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- 4. PROFILE GUARD
-- Was SECURITY DEFINER with no trusted path, so provision_admin_account() from the
-- SQL editor was rejected too. Now only direct API requests are restricted.
CREATE OR REPLACE FUNCTION check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    IF is_api_request() AND NOT is_admin() THEN
        IF NEW.role <> OLD.role THEN
            RAISE EXCEPTION 'Unauthorized: Users cannot modify their own authorization role.';
        END IF;
        IF NEW.university_email <> OLD.university_email THEN
            RAISE EXCEPTION 'Unauthorized: University email is bound to the verified account.';
        END IF;
    END IF;
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Anyone could previously call this over the API and make themselves admin.
REVOKE EXECUTE ON FUNCTION provision_admin_account(TEXT) FROM PUBLIC, anon, authenticated;

-- 5. APPLICATION WORKFLOW COLUMN GUARD
-- Status, ownership, version and reference number change only through the RPCs below.
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
    ELSIF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
        OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
        OR NEW.current_version IS DISTINCT FROM OLD.current_version
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
        RAISE EXCEPTION 'Unauthorized: workflow fields change only through submission and review actions.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_workflow_columns ON applications;
CREATE TRIGGER trigger_guard_workflow_columns
BEFORE INSERT OR UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION guard_application_workflow_columns();

-- Audit trigger now records the reason passed by the workflow RPCs.
CREATE OR REPLACE FUNCTION handle_application_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := timezone('utc'::text, now());

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO application_status_history (
            application_id,
            from_status,
            to_status,
            changed_by,
            reason
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            auth.uid(),
            COALESCE(
                NULLIF(current_setting('app.status_reason', true), ''),
                'Status transition from ' || COALESCE(OLD.status::text, 'none') || ' to ' || NEW.status::text
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Snapshots, correction resolution and notifications are written only by the RPCs.
DROP POLICY IF EXISTS "Users can insert snapshot on submission or resubmission" ON application_versions;
DROP POLICY IF EXISTS "Students can mark correction requests as addressed" ON correction_requests;

-- 6. WORKFLOW HELPERS
CREATE OR REPLACE FUNCTION application_snapshot(p_application_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT to_jsonb(a) || jsonb_build_object(
        'inventors',
        COALESCE(
            (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.order_index) FROM inventors i WHERE i.application_id = a.id),
            '[]'::jsonb
        )
    )
    FROM applications a
    WHERE a.id = p_application_id;
$$;

CREATE OR REPLACE FUNCTION assert_application_complete(p_application_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM applications
        WHERE id = p_application_id
        AND (
            trim(title) = '' OR trim(technical_field) = '' OR trim(background_problem) = ''
            OR trim(description) = '' OR trim(novelty_features) = '' OR trim(practical_applications) = ''
        )
    ) THEN
        RAISE EXCEPTION 'Complete all mandatory disclosure sections before submitting.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inventors WHERE application_id = p_application_id) THEN
        RAISE EXCEPTION 'Add at least one inventor before submitting.';
    END IF;
END;
$$;

-- 7. ATOMIC WORKFLOW RPCs

-- Draft save: SECURITY INVOKER, so RLS still decides what the caller may edit.
-- Application row and inventors are replaced in one transaction (no half-saved drafts).
CREATE OR REPLACE FUNCTION save_application_draft(p_application JSONB, p_inventors JSONB DEFAULT '[]'::jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_id UUID := NULLIF(p_application->>'id', '')::uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO applications (
            owner_id, title, technical_field, background_problem,
            description, novelty_features, practical_applications
        ) VALUES (
            auth.uid(),
            COALESCE(NULLIF(trim(p_application->>'title'), ''), 'Untitled Invention Draft'),
            COALESCE(p_application->>'technical_field', ''),
            COALESCE(p_application->>'background_problem', ''),
            COALESCE(p_application->>'description', ''),
            COALESCE(p_application->>'novelty_features', ''),
            COALESCE(p_application->>'practical_applications', '')
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE applications SET
            title = COALESCE(NULLIF(trim(p_application->>'title'), ''), title),
            technical_field = COALESCE(p_application->>'technical_field', technical_field),
            background_problem = COALESCE(p_application->>'background_problem', background_problem),
            description = COALESCE(p_application->>'description', description),
            novelty_features = COALESCE(p_application->>'novelty_features', novelty_features),
            practical_applications = COALESCE(p_application->>'practical_applications', practical_applications)
        WHERE id = v_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Application not found or no longer editable.';
        END IF;
    END IF;

    IF jsonb_array_length(COALESCE(p_inventors, '[]'::jsonb)) > 0 THEN
        DELETE FROM inventors WHERE application_id = v_id;
        INSERT INTO inventors (
            application_id, full_name, email, phone, affiliation_type, department, is_primary, order_index
        )
        SELECT
            v_id,
            COALESCE(inv->>'full_name', ''),
            COALESCE(inv->>'email', ''),
            NULLIF(inv->>'phone', ''),
            COALESCE(NULLIF(inv->>'affiliation_type', ''), 'student')::affiliation_type,
            COALESCE(inv->>'department', ''),
            COALESCE((inv->>'is_primary')::boolean, ord = 1),
            (ord - 1)::int
        FROM jsonb_array_elements(p_inventors) WITH ORDINALITY AS t(inv, ord);
    END IF;

    RETURN v_id;
END;
$$;

-- Student: draft -> submitted
CREATE OR REPLACE FUNCTION submit_application(p_application_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app applications%ROWTYPE;
    v_notes TEXT := COALESCE(NULLIF(trim(p_notes), ''), 'Submitted for initial review.');
BEGIN
    SELECT * INTO v_app FROM applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND OR v_app.owner_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Application not found.';
    END IF;
    IF v_app.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft applications can be submitted (current status: %).', v_app.status;
    END IF;
    PERFORM assert_application_complete(p_application_id);

    PERFORM set_config('app.status_reason', v_notes, true);
    UPDATE applications
    SET status = 'submitted', submitted_at = timezone('utc'::text, now())
    WHERE id = p_application_id;

    INSERT INTO application_versions (application_id, version_number, snapshot_data, submitted_by, submission_notes)
    VALUES (p_application_id, v_app.current_version, application_snapshot(p_application_id), auth.uid(), v_notes);

    INSERT INTO notifications (user_id, title, message, link)
    VALUES (
        auth.uid(),
        'Application Submitted',
        format('Your application (%s) has been submitted for review.', v_app.reference_number),
        '/applications/' || p_application_id
    );
END;
$$;

-- Student: corrections_required -> resubmitted (version + 1)
CREATE OR REPLACE FUNCTION resubmit_application(p_application_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app applications%ROWTYPE;
    v_next INTEGER;
    v_notes TEXT;
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
    v_notes := COALESCE(NULLIF(trim(p_notes), ''), format('Resubmitted as Version %s with corrections.', v_next));

    PERFORM set_config('app.status_reason', v_notes, true);
    UPDATE applications
    SET status = 'resubmitted', current_version = v_next
    WHERE id = p_application_id;

    UPDATE correction_requests
    SET status = 'addressed', resolved_at = timezone('utc'::text, now())
    WHERE application_id = p_application_id AND status = 'pending';

    INSERT INTO application_versions (application_id, version_number, snapshot_data, submitted_by, submission_notes)
    VALUES (p_application_id, v_next, application_snapshot(p_application_id), auth.uid(), v_notes);

    INSERT INTO notifications (user_id, title, message, link)
    SELECT
        id,
        'Application Resubmitted with Corrections',
        format('Application %s has been updated and resubmitted by the applicant.', v_app.reference_number),
        '/admin/applications/' || p_application_id
    FROM profiles
    WHERE role = 'admin';
END;
$$;

-- Coordinator: review transitions (mirrors VALID_TRANSITIONS in src/features/applications/workflow.ts)
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
    v_title TEXT := 'Application Status Updated';
    v_message TEXT;
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

    v_message := format('Application %s status is now: %s.', v_app.reference_number, p_to_status);
    IF p_to_status = 'corrections_required' THEN
        v_title := 'Corrections Requested on Patent Application';
        v_message := format('The patent coordinator has requested specific corrections for %s. Please review the feedback.', v_app.reference_number);
    ELSIF p_to_status = 'approved_next_stage' THEN
        v_title := 'Application Approved for Next Stage';
        v_message := format('Application %s has been approved by the patent coordinator for internal patent filing.', v_app.reference_number);
    END IF;

    INSERT INTO notifications (user_id, title, message, link)
    VALUES (v_app.owner_id, v_title, v_message, '/applications/' || p_application_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION save_application_draft(JSONB, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION submit_application(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION resubmit_application(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION transition_application_status(UUID, application_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_application_draft(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_application(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resubmit_application(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION transition_application_status(UUID, application_status, TEXT) TO authenticated;
