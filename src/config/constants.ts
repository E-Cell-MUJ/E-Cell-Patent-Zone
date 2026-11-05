import { ENV } from './env';

/**
 * Institutional & University Identity
 */
export const INSTITUTION = {
  NAME: ENV.INSTITUTION_NAME,
  SHORT_NAME: ENV.INSTITUTION_SHORT_NAME,
  LEGAL_ENTITY: ENV.INSTITUTION_NAME,
  ADDRESS: `${ENV.INSTITUTION_NAME}, Dehmi Kalan, Jaipur, Rajasthan 303007`,
  DOMAIN: ENV.ALLOWED_EMAIL_DOMAIN,
  EMAIL_AT_DOMAIN: `@${ENV.ALLOWED_EMAIL_DOMAIN}`,
  CONTACT_EMAIL: ENV.CONTACT_EMAIL,
  WEBSITE_URL: ENV.INSTITUTION_WEBSITE_URL,
  IPR_CELL_URL: ENV.IPR_CELL_URL,
  PORTAL_BASE_URL: ENV.PORTAL_BASE_URL,
  DEPARTMENTS: {
    IPR_CELL: 'Directorate of Research & IPR Cell',
    CSE: 'Computer Science and Engineering',
    SCIT: 'School of Computing and Information Technology',
    MECHATRONICS: 'Mechatronics Engineering',
    EEE: 'Electrical & Electronics Engineering',
  },
  PORTAL_TITLE: 'Patent & IPR Disclosure Portal',
  PORTAL_FULL_NAME: `${ENV.INSTITUTION_NAME.toUpperCase()} Patent & IPR Disclosure Portal`,
  PORTAL_OFFICIAL_BADGE: 'Official',
  COMPLIANCE_NOTICE: 'PRD V1.1 Compliant • OWASP ASVS L2 • DPDP 2025 Architecture',
  POLICY_ACKNOWLEDGEMENT_1: `I undertake not to publicly disclose, present, or publish this invention without prior written clearance from the Directorate of Research & IPR Cell, ${ENV.INSTITUTION_NAME}.`,
  POLICY_ACKNOWLEDGEMENT_2: `I agree to abide by the ${ENV.INSTITUTION_NAME} Intellectual Property Rights (IPR) Policy and standard inventorship assignment rules.`,
  PATENT_LAW_WARNING: `Under Indian Patent Law (Patents Act 1970), India operates on a strict first-to-file basis with no general grace period. Public disclosure (conferences, preprints, public GitHub repositories, or theses) prior to the official filing of a provisional application destroys absolute novelty. Ensure all invention disclosures remain strictly confidential within the ${ENV.INSTITUTION_NAME} IPR portal.`,
  AUTH_RESTRICTION_NOTICE: `Access is restricted to authorized students, faculty, and IPR administrators of ${ENV.INSTITUTION_NAME}.`,
  SIGN_IN_NOTICE: `By authenticating, you confirm adherence to the ${ENV.INSTITUTION_SHORT_NAME} IPR Policy and the Indian Patents Act 1970. All disclosures are confidential by default.`,
} as const;

/**
 * Coordinator Metadata & Labels
 */
export const COORDINATOR = {
  ID: 'admin-coordinator-uuid',
  EMAIL: ENV.COORDINATOR_EMAIL,
  FULL_NAME: ENV.COORDINATOR_NAME,
  FORMAL_NAME_WITH_ROLE: `${ENV.COORDINATOR_NAME} (Coordinator)`,
  INFORMAL_NAME: 'Patent Coordinator',
  TITLE: 'Patent Coordinator',
  BADGE: 'Patent Review Cell',
  ADMIN_BADGE: 'Patent Coordinator',
  REVIEW_DOCKET_TITLE: 'Patent Review Docket & Examination Queue',
  CLEARANCE_ACTOR: 'Patent Coordinator',
  CLEARANCE_SUCCESS_MESSAGE: 'Public disclosure risk successfully evaluated and cleared by Patent Coordinator.',
  STATUTORY_CLEARANCE_REQUIRED_ERROR: 'Statutory constraint: Prior public disclosure risk must be formally evaluated and cleared by Patent Coordinator before approval.',
  APPROVAL_REASON_DEFAULT: 'Approved for next stage by Patent Coordinator following verified statutory and inventorship review.',
} as const;

/**
 * Demo Personas & Evaluation Credentials
 */
export const DEMO_PERSONAS = {
  COORDINATOR: {
    id: COORDINATOR.ID,
    email: COORDINATOR.EMAIL,
    full_name: COORDINATOR.FULL_NAME,
    department: INSTITUTION.DEPARTMENTS.IPR_CELL,
    role: 'coordinator' as const,
  },
  STUDENT_ADITYA: {
    id: 'user-student-aditya',
    email: `aditya.sharma@${ENV.ALLOWED_EMAIL_DOMAIN}`,
    full_name: 'Aditya Sharma',
    department: INSTITUTION.DEPARTMENTS.CSE,
    registration_no: '229301045',
    phone: '+91 98765 43210',
    role: 'student' as const,
  },
  STUDENT_PRIYA: {
    id: 'user-student-priya',
    email: `priya.patel@${ENV.ALLOWED_EMAIL_DOMAIN}`,
    full_name: 'Priya Patel',
    department: INSTITUTION.DEPARTMENTS.MECHATRONICS,
    registration_no: '229302118',
    phone: '+91 91234 56789',
    role: 'student' as const,
  },
  FACULTY_GUIDE: {
    id: 'user-faculty-guide',
    email: `sunil.kumar@${ENV.ALLOWED_EMAIL_DOMAIN}`,
    full_name: 'Prof. Sunil Kumar',
    department: INSTITUTION.DEPARTMENTS.EEE,
    role: 'faculty' as const,
  },
  DEMO_MFA_CODE: '123456',
  EMAIL_PLACEHOLDER: `student.name@${ENV.ALLOWED_EMAIL_DOMAIN}`,
  PHONE_PLACEHOLDER: '+91 98765 43210',
  DEFAULT_APPLICATION_ID: 'app-0003',
} as const;

/**
 * LocalStorage Keys
 */
export const STORAGE_KEYS = {
  AUTH_USER: 'muj_patent_portal_auth_user',
  MFA_TIMESTAMP: 'muj_patent_portal_mfa_timestamp',
  APPLICATIONS: 'muj_patent_portal_applications',
  CONTENTS: 'muj_patent_portal_contents',
  INVENTORS: 'muj_patent_portal_inventors',
  DOCS: 'muj_patent_portal_docs',
  CORRECTIONS: 'muj_patent_portal_corrs',
  HISTORY: 'muj_patent_portal_history',
  VERSIONS: 'muj_patent_portal_versions',
  NOTES: 'muj_patent_portal_notes',
} as const;

/**
 * Supabase Storage Buckets
 */
export const STORAGE_BUCKETS = {
  DOCUMENTS: ENV.STORAGE_BUCKET_DOCS,
  DRAWINGS: ENV.STORAGE_BUCKET_DRAWINGS,
} as const;

/**
 * Security & Validation Rules
 */
const escapedDomain = ENV.ALLOWED_EMAIL_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const SECURITY_RULES = {
  MIN_HOLD_REASON_LENGTH: 10,
  MIN_REJECT_REASON_LENGTH: 10,
  MFA_FRESHNESS_MINUTES: 15,
  MFA_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
  ],
  EMAIL_REGEX: new RegExp(`^[a-z0-9._-]+@${escapedDomain}$`, 'i'),
  RESTRICTED_EMAIL_ERROR: `Access restricted: You must use an authorized @${ENV.ALLOWED_EMAIL_DOMAIN} institutional email address.`,
} as const;
