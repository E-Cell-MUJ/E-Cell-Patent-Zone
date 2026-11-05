export type AppRole = 'student' | 'admin' | 'super_admin';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'corrections_required'
  | 'resubmitted'
  | 'approved_next_stage';

export type AffiliationType = 'student' | 'faculty' | 'external';

export type DocumentCategory =
  | 'complete_specification'
  | 'drawings'
  | 'prior_art'
  | 'declaration'
  | 'noc'
  | 'other';

export type CorrectionStatus = 'pending' | 'addressed' | 'waived';

export type CommentType = 'general' | 'internal_admin';

export interface Profile {
  id: string;
  university_email: string;
  full_name: string;
  role: AppRole;
  department: string | null;
  registration_number: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  reference_number: string;
  owner_id: string;
  title: string;
  technical_field: string;
  background_problem: string;
  description: string;
  novelty_features: string;
  practical_applications: string;
  status: ApplicationStatus;
  current_version: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields:
  profiles?: Profile;
  inventors?: Inventor[];
  application_documents?: ApplicationDocument[];
  correction_requests?: CorrectionRequest[];
  application_status_history?: ApplicationStatusHistory[];
  application_versions?: ApplicationVersion[];
}

export interface Inventor {
  id: string;
  application_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  affiliation_type: AffiliationType;
  department: string;
  is_primary: boolean;
  order_index: number;
  created_at: string;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  storage_path: string;
  document_category: DocumentCategory;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  version_number: number;
  uploaded_by: string;
  created_at: string;
  download_url?: string;
}

export interface ApplicationVersion {
  id: string;
  application_id: string;
  version_number: number;
  snapshot_data: Record<string, unknown>;
  submitted_by: string;
  submitted_at: string;
  submission_notes: string | null;
}

export interface CorrectionRequest {
  id: string;
  application_id: string;
  reviewer_id: string;
  field_name: string | null;
  document_id: string | null;
  comment: string;
  status: CorrectionStatus;
  created_at: string;
  resolved_at: string | null;
  reviewer?: Profile;
  document?: ApplicationDocument;
}

export interface ApplicationComment {
  id: string;
  application_id: string;
  author_id: string;
  comment_type: CommentType;
  content: string;
  created_at: string;
  author?: Profile;
}

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  changed_by: string;
  reason: string | null;
  created_at: string;
  changer?: Profile;
}

export interface InPortalNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
