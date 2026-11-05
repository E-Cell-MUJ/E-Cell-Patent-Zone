export type UserRole = 'student' | 'faculty' | 'coordinator' | 'delegate';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'corrections_required'
  | 'resubmitted'
  | 'approved_next_stage'
  | 'rejected'
  | 'on_hold'
  | 'withdrawn';

export type SectionKey =
  | 'applicant_details'
  | 'co_inventors'
  | 'title_field'
  | 'problem_statement'
  | 'technical_description'
  | 'novelty_features'
  | 'applicability_disclosure'
  | 'declarations';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  registration_no?: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  delegate_until?: string | null;
  privacy_notice_version?: string;
  created_at: string;
  updated_at: string;
}

export interface Inventor {
  id: string;
  application_id: string;
  full_name: string;
  email: string;
  affiliation: string;
  is_primary: boolean;
  is_guide: boolean;
  contribution_share: number; // 1 - 100
  contribution_description?: string;
  confirmed_at?: string | null;
  created_at: string;
}

export type DocumentCategory =
  | 'specification'
  | 'drawings'
  | 'guide_noc'
  | 'prior_art'
  | 'other';

export type ScanStatus = 'quarantined' | 'verified' | 'rejected';

export interface ApplicationDocument {
  id: string;
  application_id: string;
  category: DocumentCategory;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
  sha256?: string;
  scan_status: ScanStatus;
  version_no: number;
  uploaded_by: string;
  archived_at?: string | null;
  created_at: string;
}

export type TargetType = 'section' | 'field' | 'document';
export type SeverityType = 'blocking' | 'advisory';
export type CorrectionStatus = 'open' | 'addressed' | 'resolved' | 'reopened';

export interface CorrectionRequest {
  id: string;
  application_id: string;
  round_no: number;
  target_type: TargetType;
  target_key: string;
  comment: string;
  severity: SeverityType;
  status: CorrectionStatus;
  student_note?: string;
  created_by: string;
  resolved_by?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface ReviewNote {
  id: string;
  application_id: string;
  author_id: string;
  author_name?: string;
  note: string;
  created_at: string;
}

export interface StatusHistory {
  id: string;
  application_id: string;
  from_status: ApplicationStatus;
  to_status: ApplicationStatus;
  actor_id: string;
  actor_name?: string;
  reason?: string | null;
  version_no: number;
  occurred_at: string;
}

export interface ApplicationVersion {
  id: string;
  application_id: string;
  version_no: number;
  snapshot: {
    application: Partial<Application>;
    content: Record<string, any>;
    inventors: Inventor[];
    documents: ApplicationDocument[];
  };
  snapshot_hash: string;
  submitted_by: string;
  created_at: string;
}

export type Section39Path =
  | 'india_first_six_weeks'
  | 'permit_requested'
  | 'permit_granted'
  | 'not_applicable';

export interface Application {
  id: string;
  reference_no: string;
  owner_id: string;
  owner_name?: string;
  owner_email?: string;
  department?: string;
  title: string;
  technical_field: string;
  status: ApplicationStatus;
  current_version: number;
  row_version: number;
  foreign_filing_intent: boolean;
  section39_path: Section39Path;
  public_disclosure_flag: boolean;
  disclosure_cleared: boolean;
  funding_source?: string;
  hold_reason?: string | null;
  linked_to?: string | null;
  submitted_at?: string | null;
  withdrawn_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Section-specific form content structures
export interface ApplicantDetailsContent {
  full_name: string;
  registration_no: string;
  department: string;
  email: string;
  phone: string;
  academic_year: string;
}

export interface CoInventorsContent {
  inventors: Array<{
    id?: string;
    full_name: string;
    email: string;
    affiliation: string;
    is_primary: boolean;
    is_guide: boolean;
    contribution_share: number;
    contribution_description?: string;
  }>;
}

export interface TitleFieldContent {
  title: string;
  technical_field: string;
  ipc_subclass?: string;
  keywords: string[];
}

export interface ProblemStatementContent {
  background_prior_art: string;
  limitations_existing_tech: string;
  technical_problem: string;
  objectives_invention: string;
}

export interface TechnicalDescriptionContent {
  detailed_working_mechanism: string;
  structural_components: string;
  step_by_step_methodology: string;
  drawings_description: string;
  best_mode_embodiment: string;
}

export interface NoveltyFeaturesContent {
  inventive_steps_summary: string;
  novel_features_differentiator: string;
  non_obviousness_rationale: string;
  industrial_applicability: string;
}

export interface ApplicabilityDisclosureContent {
  commercial_applications: string;
  foreign_filing_intent: boolean;
  section39_path: Section39Path;
  foreign_filing_details?: string;
  public_disclosure_flag: boolean;
  public_disclosure_venues?: string;
  public_disclosure_dates?: string;
  third_party_funding: boolean;
  funding_details?: string;
}

export interface DeclarationsContent {
  accuracy_undertaking: boolean;
  originality_undertaking: boolean;
  non_disclosure_undertaking: boolean;
  university_policy_acceptance: boolean;
  statutory_form1_consent: boolean;
  lead_applicant_signature_name: string;
  submission_date: string;
}

export interface ApplicationContentPayload {
  applicant_details: ApplicantDetailsContent;
  co_inventors: CoInventorsContent;
  title_field: TitleFieldContent;
  problem_statement: ProblemStatementContent;
  technical_description: TechnicalDescriptionContent;
  novelty_features: NoveltyFeaturesContent;
  applicability_disclosure: ApplicabilityDisclosureContent;
  declarations: DeclarationsContent;
}

export interface ReviewChecklist {
  inventorship_100_percent: boolean;
  public_disclosure_risk_assessed: boolean;
  section_39_foreign_filing_cleared: boolean;
  novelty_inventive_step_verified: boolean;
  formal_drawings_spec_adequate: boolean;
}
