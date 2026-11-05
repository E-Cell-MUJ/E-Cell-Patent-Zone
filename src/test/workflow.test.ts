import { describe, it, expect } from 'vitest';
import { canTransition, getStatusDisplayName } from '../features/applications/workflow';

describe('Workflow State Machine and Transition Guard', () => {
  it('allows student to transition from draft to submitted', () => {
    expect(canTransition('draft', 'submitted', 'student')).toBe(true);
  });

  it('prevents student from approving their own application', () => {
    expect(canTransition('draft', 'approved_next_stage', 'student')).toBe(false);
    expect(canTransition('submitted', 'approved_next_stage', 'student')).toBe(false);
    expect(canTransition('under_review', 'approved_next_stage', 'student')).toBe(false);
  });

  it('prevents student from transitioning to under_review', () => {
    expect(canTransition('submitted', 'under_review', 'student')).toBe(false);
  });

  it('allows admin to move submitted application to under_review', () => {
    expect(canTransition('submitted', 'under_review', 'admin')).toBe(true);
  });

  it('allows admin to request corrections or approve', () => {
    expect(canTransition('under_review', 'corrections_required', 'admin')).toBe(true);
    expect(canTransition('under_review', 'approved_next_stage', 'admin')).toBe(true);
  });

  it('allows student to resubmit only from corrections_required', () => {
    expect(canTransition('corrections_required', 'resubmitted', 'student')).toBe(true);
    expect(canTransition('draft', 'resubmitted', 'student')).toBe(false);
  });

  it('formats status display names cleanly', () => {
    expect(getStatusDisplayName('under_review')).toBe('Under Review');
    expect(getStatusDisplayName('approved_next_stage')).toBe('Approved for Next Stage');
    expect(getStatusDisplayName('corrections_required')).toBe('Corrections Required');
  });
});
