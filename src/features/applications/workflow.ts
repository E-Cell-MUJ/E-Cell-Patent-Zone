import type { ApplicationStatus, AppRole } from '../../types/database.types';

export interface TransitionRule {
  from: ApplicationStatus;
  to: ApplicationStatus;
  allowedRole: AppRole;
  requiresReason?: boolean;
}

export const VALID_TRANSITIONS: TransitionRule[] = [
  // Student submits initial draft
  { from: 'draft', to: 'submitted', allowedRole: 'student' },
  // Admin opens submitted application for review or acts directly
  { from: 'submitted', to: 'under_review', allowedRole: 'admin' },
  { from: 'submitted', to: 'corrections_required', allowedRole: 'admin', requiresReason: true },
  { from: 'submitted', to: 'approved_next_stage', allowedRole: 'admin' },
  // Admin requests corrections with specific comments
  { from: 'under_review', to: 'corrections_required', allowedRole: 'admin', requiresReason: true },
  // Student resubmits after addressing corrections
  { from: 'corrections_required', to: 'resubmitted', allowedRole: 'student' },
  // Admin re-evaluates resubmitted application
  { from: 'resubmitted', to: 'under_review', allowedRole: 'admin' },
  { from: 'resubmitted', to: 'corrections_required', allowedRole: 'admin', requiresReason: true },
  { from: 'resubmitted', to: 'approved_next_stage', allowedRole: 'admin' },
  // Admin approves for internal next stage
  { from: 'under_review', to: 'approved_next_stage', allowedRole: 'admin' },
];

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  role: AppRole
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS.some(
    (rule) => rule.from === from && rule.to === to && rule.allowedRole === role
  );
}

export function getStatusDisplayName(status: ApplicationStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Submitted';
    case 'under_review':
      return 'Under Review';
    case 'corrections_required':
      return 'Corrections Required';
    case 'resubmitted':
      return 'Resubmitted';
    case 'approved_next_stage':
      return 'Approved for Next Stage';
    default:
      return status;
  }
}

export function getStatusBadgeClass(status: ApplicationStatus): string {
  switch (status) {
    case 'draft':
      return 'badge badge-draft';
    case 'submitted':
      return 'badge badge-submitted';
    case 'under_review':
      return 'badge badge-under_review';
    case 'corrections_required':
      return 'badge badge-corrections_required';
    case 'resubmitted':
      return 'badge badge-resubmitted';
    case 'approved_next_stage':
      return 'badge badge-approved_next_stage';
    default:
      return 'badge';
  }
}
