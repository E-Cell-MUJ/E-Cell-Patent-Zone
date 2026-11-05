-- ==============================================================================
-- MUJ Patent Portal — pgTAP Comprehensive Security & RLS Test Suite
-- Proves that database-level security policies cannot be bypassed.
-- ==============================================================================

BEGIN;
SELECT plan(15);

-- 1. Verify Extension & Tables Exist
SELECT has_table('public', 'applications', 'Table public.applications exists');
SELECT has_table('public', 'correction_requests', 'Table public.correction_requests exists');
SELECT has_table('public', 'status_history', 'Table public.status_history exists');
SELECT has_table('public', 'audit_log', 'Table public.audit_log exists');

-- 2. Setup Test Fixture Roles & Identities
DO $$
DECLARE
    v_student_a_id UUID := '11111111-1111-1111-1111-111111111111';
    v_student_b_id UUID := '22222222-2222-2222-2222-222222222222';
    v_coord_id     UUID := '33333333-3333-3333-3333-333333333333';
BEGIN
    -- Ensure clean test records in profiles
    INSERT INTO public.profiles (id, email, full_name, department, role)
    VALUES 
        (v_student_a_id, 'student.a@muj.manipal.edu', 'Student A', 'Computer Science', 'student'),
        (v_student_b_id, 'student.b@muj.manipal.edu', 'Student B', 'Information Tech', 'student'),
        (v_coord_id, 'dorelal@muj.manipal.edu', 'Dorelal Ji', 'Directorate of Research', 'coordinator')
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 3. TEST: Reject Non-MUJ Email in Domain Function
SELECT throws_ok(
    $$ 
    INSERT INTO auth.users (id, email) 
    VALUES ('99999999-9999-9999-9999-999999999999', 'intruder@gmail.com') 
    $$,
    'P0001',
    '%Registration Rejected: Only official @muj.manipal.edu email addresses are permitted%',
    'auth.users triggers correctly block non-MUJ email addresses'
);

SELECT throws_ok(
    $$ 
    INSERT INTO auth.users (id, email) 
    VALUES ('88888888-8888-8888-8888-888888888888', 'spoof@evil.com@muj.manipal.edu') 
    $$,
    'P0001',
    '%Registration Rejected: Only official @muj.manipal.edu email addresses are permitted%',
    'auth.users triggers correctly block sub-domain and delimiter-spoofed emails'
);

-- 4. TEST: Student A creates an application
DO $$
DECLARE
    v_app_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
    -- Act as Student A
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', '11111111-1111-1111-1111-111111111111',
        'role', 'authenticated',
        'aal', 'aal1'
    )::text, true);

    INSERT INTO public.applications (id, owner_id, title, technical_field, status)
    VALUES (v_app_id, '11111111-1111-1111-1111-111111111111', 'Novel IoT Solar Sensor', 'Electronics', 'draft');
END $$;

-- 5. TEST: Student Cannot Directly Alter Status via UPDATE
SELECT throws_ok(
    $$ 
    UPDATE public.applications 
    SET status = 'approved_next_stage' 
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' 
    $$,
    'P0001',
    '%Unauthorized: Status changes must be executed through the transition_application_status function%',
    'Direct client UPDATE of status column is prohibited by trigger'
);

-- 6. TEST: Student Cannot Directly Alter Reference Number
SELECT throws_ok(
    $$ 
    UPDATE public.applications 
    SET reference_no = 'MUJ-PAT-FAKE-0001' 
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' 
    $$,
    'P0001',
    '%Unauthorized: Reference numbers are immutable and system-generated%',
    'Direct client tampering with reference_no is blocked by trigger'
);

-- 7. TEST: Student B Cannot Read Student A's Application (RLS Isolation)
DO $$
BEGIN
    -- Switch session to Student B
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', '22222222-2222-2222-2222-222222222222',
        'role', 'authenticated',
        'aal', 'aal1'
    )::text, true);
END $$;

SELECT is_empty(
    $$ SELECT id FROM public.applications WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
    'Student B cannot select Student A applications (Owner RLS isolation verified)'
);

-- 8. TEST: Coordinator Without AAL2 (Password/OTP only) Cannot View Applications
DO $$
BEGIN
    -- Switch session to Coordinator at AAL1 (no 2FA completed)
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', '33333333-3333-3333-3333-333333333333',
        'role', 'authenticated',
        'aal', 'aal1'
    )::text, true);
END $$;

SELECT is_empty(
    $$ SELECT id FROM public.applications WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
    'Coordinator session at AAL1 is denied access to confidential applications by RLS'
);

-- 9. TEST: Coordinator With AAL2 CAN View Applications
DO $$
BEGIN
    -- Switch session to Coordinator at AAL2 (TOTP verified)
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', '33333333-3333-3333-3333-333333333333',
        'role', 'authenticated',
        'aal', 'aal2'
    )::text, true);
END $$;

SELECT isnt_empty(
    $$ SELECT id FROM public.applications WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
    'Coordinator with AAL2 is granted access to review applications'
);

-- 10. TEST: Coordinator Inserts a Correction Request & Student Attempts to Tamper
DO $$
DECLARE
    v_corr_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
BEGIN
    -- Coordinator at AAL2 adds a correction
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', '33333333-3333-3333-3333-333333333333',
        'role', 'authenticated',
        'aal', 'aal2'
    )::text, true);

    INSERT INTO public.correction_requests (
        id, application_id, target_type, target_key, comment, severity, status, created_by
    ) VALUES (
        v_corr_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'field', 'novelty_features',
        'Clarify prior art differentiation', 'blocking', 'open', '33333333-3333-3333-3333-333333333333'
    );
END $$;

-- Switch to Student A
DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', '11111111-1111-1111-1111-111111111111',
        'role', 'authenticated',
        'aal', 'aal1'
    )::text, true);
END $$;

-- Student attempts to rewrite comment and severity to 'advisory'
SELECT throws_ok(
    $$ 
    UPDATE public.correction_requests 
    SET comment = 'Looks good now', severity = 'advisory' 
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' 
    $$,
    'P0001',
    '%Unauthorized: Students cannot alter coordinator feedback parameters%',
    'Students cannot tamper with coordinator comments, severity, or targets'
);

-- Student attempts to mark addressed without a student note
SELECT throws_ok(
    $$ 
    UPDATE public.correction_requests 
    SET status = 'addressed', student_note = '   ' 
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' 
    $$,
    'P0001',
    '%Validation Failed: An explanation note is required when marking an item addressed%',
    'Students must provide a substantive explanation note when addressing corrections'
);

-- 11. TEST: Status History Table Prohibits Deletion / Modification (Append-Only)
SELECT throws_ok(
    $$ DELETE FROM public.status_history WHERE true $$,
    'P0001',
    '%Integrity Violation: DELETE operations are strictly prohibited on immutable audit and version tables%',
    'status_history cannot be deleted or pruned'
);

SELECT throws_ok(
    $$ DELETE FROM public.application_versions WHERE true $$,
    'P0001',
    '%Integrity Violation: DELETE operations are strictly prohibited on immutable audit and version tables%',
    'application_versions cannot be deleted'
);

SELECT * FROM finish();
ROLLBACK;
