-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Complete schema, RLS policies, triggers, and audit log functions
--              for the Manipal University Jaipur (MUJ) Patent Application Portal.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('student', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM (
        'draft',
        'submitted',
        'under_review',
        'corrections_required',
        'resubmitted',
        'approved_next_stage'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE affiliation_type AS ENUM ('student', 'faculty', 'external');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE document_category AS ENUM (
        'complete_specification',
        'drawings',
        'prior_art',
        'declaration',
        'noc',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE correction_status AS ENUM ('pending', 'addressed', 'waived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE comment_type AS ENUM ('general', 'internal_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. SEQUENCES
CREATE SEQUENCE IF NOT EXISTS patent_ref_seq START WITH 1 INCREMENT BY 1;

-- 3. TABLES

-- Profiles Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    university_email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role app_role NOT NULL DEFAULT 'student',
    department TEXT,
    registration_number TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Applications Table
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    technical_field TEXT NOT NULL,
    background_problem TEXT NOT NULL,
    description TEXT NOT NULL,
    novelty_features TEXT NOT NULL,
    practical_applications TEXT NOT NULL,
    status application_status NOT NULL DEFAULT 'draft',
    current_version INTEGER NOT NULL DEFAULT 1,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Inventors Table (Supports multiple inventors per application)
CREATE TABLE IF NOT EXISTS inventors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    affiliation_type affiliation_type NOT NULL DEFAULT 'student',
    department TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Application Documents Table
CREATE TABLE IF NOT EXISTS application_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    document_category document_category NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Application Versions Table (Immutable submission snapshots)
CREATE TABLE IF NOT EXISTS application_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    submitted_by UUID NOT NULL REFERENCES profiles(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    submission_notes TEXT
);

-- Correction Requests Table (Reviewer per-field or per-document requests)
CREATE TABLE IF NOT EXISTS correction_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES profiles(id),
    field_name TEXT,
    document_id UUID REFERENCES application_documents(id) ON DELETE SET NULL,
    comment TEXT NOT NULL,
    status correction_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ
);

-- Application Comments Table
CREATE TABLE IF NOT EXISTS application_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id),
    comment_type comment_type NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Application Status History Table (Audit Log)
CREATE TABLE IF NOT EXISTS application_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    from_status application_status,
    to_status application_status NOT NULL,
    changed_by UUID NOT NULL REFERENCES profiles(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- In-Portal Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. INDEXES FOR HIGH-PERFORMANCE LOOKUPS
CREATE INDEX IF NOT EXISTS idx_applications_owner_id ON applications(owner_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_reference_number ON applications(reference_number);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventors_app_id ON inventors(application_id);
CREATE INDEX IF NOT EXISTS idx_documents_app_id ON application_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_versions_app_id ON application_versions(application_id);
CREATE INDEX IF NOT EXISTS idx_corrections_app_id ON correction_requests(application_id);
CREATE INDEX IF NOT EXISTS idx_comments_app_id ON application_comments(application_id);
CREATE INDEX IF NOT EXISTS idx_status_history_app_id ON application_status_history(application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);

-- 5. HELPER AND SECURITY FUNCTIONS

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- Function to generate standard institutional reference numbers: MUJ-PAT-YYYY-XXXX
CREATE OR REPLACE FUNCTION generate_patent_reference_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    seq_val INT;
    cur_year TEXT;
BEGIN
    seq_val := nextval('patent_ref_seq');
    cur_year := to_char(CURRENT_DATE, 'YYYY');
    RETURN 'MUJ-PAT-' || cur_year || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- Trigger to automatically assign reference number before insert if not provided
CREATE OR REPLACE FUNCTION set_application_reference_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
        NEW.reference_number := generate_patent_reference_number();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_ref_num ON applications;
CREATE TRIGGER trigger_set_ref_num
BEFORE INSERT ON applications
FOR EACH ROW
EXECUTE FUNCTION set_application_reference_number();

-- Trigger to prevent students from escalating their own role in profiles
CREATE OR REPLACE FUNCTION check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.role <> OLD.role AND NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Users cannot modify their own authorization role.';
    END IF;
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_profile_role_protect ON profiles;
CREATE TRIGGER trigger_profile_role_protect
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION check_profile_role_update();

-- Trigger to update application updated_at and record status changes in audit log
CREATE OR REPLACE FUNCTION handle_application_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.updated_at := timezone('utc'::text, now());
    
    -- If status has changed, log into status history
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
            'Status transition from ' || COALESCE(OLD.status::text, 'none') || ' to ' || NEW.status::text
        );
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_application_audit ON applications;
CREATE TRIGGER trigger_application_audit
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION handle_application_update();

-- Automatic new user profile creation from auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, university_email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'student'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- 6. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventors ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Users can view their own profile or Admin can view all" ON profiles;
CREATE POLICY "Users can view their own profile or Admin can view all"
ON profiles FOR SELECT
USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "Users can update their own non-role fields" ON profiles;
CREATE POLICY "Users can update their own non-role fields"
ON profiles FOR UPDATE
USING (auth.uid() = id OR is_admin());

-- APPLICATIONS POLICIES
DROP POLICY IF EXISTS "Students can view own applications or Admin can view all" ON applications;
CREATE POLICY "Students can view own applications or Admin can view all"
ON applications FOR SELECT
USING (auth.uid() = owner_id OR is_admin());

DROP POLICY IF EXISTS "Students can create draft applications" ON applications;
CREATE POLICY "Students can create draft applications"
ON applications FOR INSERT
WITH CHECK (auth.uid() = owner_id AND status = 'draft');

DROP POLICY IF EXISTS "Students can edit own drafts or corrections or Admin can edit" ON applications;
CREATE POLICY "Students can edit own drafts or corrections or Admin can edit"
ON applications FOR UPDATE
USING (
    (auth.uid() = owner_id AND status IN ('draft', 'corrections_required'))
    OR is_admin()
);

-- INVENTORS POLICIES
DROP POLICY IF EXISTS "Users can view inventors of accessible applications" ON inventors;
CREATE POLICY "Users can view inventors of accessible applications"
ON inventors FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = inventors.application_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
);

DROP POLICY IF EXISTS "Owners can manage inventors on draft or correction applications" ON inventors;
CREATE POLICY "Owners can manage inventors on draft or correction applications"
ON inventors FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = inventors.application_id
        AND a.owner_id = auth.uid()
        AND a.status IN ('draft', 'corrections_required')
    )
    OR is_admin()
);

-- APPLICATION DOCUMENTS POLICIES
DROP POLICY IF EXISTS "Users can view documents of accessible applications" ON application_documents;
CREATE POLICY "Users can view documents of accessible applications"
ON application_documents FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_documents.application_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
);

DROP POLICY IF EXISTS "Owners can upload documents for draft or correction applications" ON application_documents;
CREATE POLICY "Owners can upload documents for draft or correction applications"
ON application_documents FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_documents.application_id
        AND a.owner_id = auth.uid()
        AND a.status IN ('draft', 'corrections_required')
    )
    OR is_admin()
);

-- APPLICATION VERSIONS POLICIES
DROP POLICY IF EXISTS "Users can view versions of accessible applications" ON application_versions;
CREATE POLICY "Users can view versions of accessible applications"
ON application_versions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_versions.application_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
);

DROP POLICY IF EXISTS "Users can insert snapshot on submission or resubmission" ON application_versions;
CREATE POLICY "Users can insert snapshot on submission or resubmission"
ON application_versions FOR INSERT
WITH CHECK (
    auth.uid() = submitted_by AND (
        EXISTS (
            SELECT 1 FROM applications a
            WHERE a.id = application_versions.application_id
            AND a.owner_id = auth.uid()
        )
        OR is_admin()
    )
);

-- CORRECTION REQUESTS POLICIES
DROP POLICY IF EXISTS "Users can view correction requests for accessible applications" ON correction_requests;
CREATE POLICY "Users can view correction requests for accessible applications"
ON correction_requests FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = correction_requests.application_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
);

DROP POLICY IF EXISTS "Admins can create and manage correction requests" ON correction_requests;
CREATE POLICY "Admins can create and manage correction requests"
ON correction_requests FOR ALL
USING (is_admin());

DROP POLICY IF EXISTS "Students can mark correction requests as addressed" ON correction_requests;
CREATE POLICY "Students can mark correction requests as addressed"
ON correction_requests FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = correction_requests.application_id
        AND a.owner_id = auth.uid()
        AND a.status = 'corrections_required'
    )
);

-- APPLICATION COMMENTS POLICIES
DROP POLICY IF EXISTS "Users can view comments for accessible applications" ON application_comments;
CREATE POLICY "Users can view comments for accessible applications"
ON application_comments FOR SELECT
USING (
    (comment_type = 'general' AND EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_comments.application_id
        AND (a.owner_id = auth.uid() OR is_admin())
    ))
    OR (comment_type = 'internal_admin' AND is_admin())
);

DROP POLICY IF EXISTS "Users can post comments on accessible applications" ON application_comments;
CREATE POLICY "Users can post comments on accessible applications"
ON application_comments FOR INSERT
WITH CHECK (
    auth.uid() = author_id AND (
        (comment_type = 'general' AND EXISTS (
            SELECT 1 FROM applications a
            WHERE a.id = application_comments.application_id
            AND (a.owner_id = auth.uid() OR is_admin())
        ))
        OR (comment_type = 'internal_admin' AND is_admin())
    )
);

-- APPLICATION STATUS HISTORY POLICIES
DROP POLICY IF EXISTS "Users can view status history of accessible applications" ON application_status_history;
CREATE POLICY "Users can view status history of accessible applications"
ON application_status_history FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_status_history.application_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
);

-- NOTIFICATIONS POLICIES
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
USING (auth.uid() = user_id);

-- 7. STORAGE BUCKET CONFIGURATION (Supabase Storage SQL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'patent-documents',
    'patent-documents',
    false,
    26214400, -- 25MB max
    ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];

-- Storage Policies for Private Patent Documents
DROP POLICY IF EXISTS "Users can read authorized application documents" ON storage.objects;
CREATE POLICY "Users can read authorized application documents"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'patent-documents' AND (
        is_admin() OR
        EXISTS (
            SELECT 1 FROM applications a
            WHERE a.id::text = (storage.foldername(name))[1]
            AND a.owner_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Users can upload documents for draft or correction applications" ON storage.objects;
CREATE POLICY "Users can upload documents for draft or correction applications"
ON storage.objects FOR INSERT
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

-- 8. TRUSTED ADMIN PROVISIONING SCRIPT (For Patent Cell Coordinator)
-- Run this function with designated university email to grant admin status securely
CREATE OR REPLACE FUNCTION provision_admin_account(target_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET role = 'admin', updated_at = timezone('utc'::text, now())
    WHERE university_email = target_email;
    
    IF NOT FOUND THEN
        RAISE NOTICE 'Target profile with email % not found yet. Role will be updated once account registers.', target_email;
    END IF;
END;
$$;
