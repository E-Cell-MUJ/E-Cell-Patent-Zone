import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraftApplication,
  submitApplication,
  transitionApplicationStatus,
  createCorrectionRequest,
  resubmitApplication,
  fetchApplicationById,
} from '../lib/api';

describe('Application Workflow & Correction Lifecycle Verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('progresses through the 6-step patent application lifecycle', async () => {
    const student = { id: 'student-test-uuid', role: 'student' as const };
    const admin = { id: 'admin-coordinator-uuid', role: 'admin' as const };

    // STEP 1: Draft - Student can save and edit
    const draft = await saveDraftApplication(
      {
        title: 'Piezoelectric Micro-Generator for Wearables',
        technical_field: 'Energy Harvesting and Nanotechnology',
        background_problem: 'Wearable bio-monitors suffer from bulky rechargeable cells.',
        description: 'Flexible PDMS-embedded nanowire generator.',
        novelty_features: 'Graded modulus boundary coupling.',
        practical_applications: 'Medical pulse oximetry and smart patches.',
      },
      [
        {
          full_name: 'Aditya Sharma',
          email: 'aditya.sharma@muj.manipal.edu',
          affiliation_type: 'student',
          department: 'CSE',
          is_primary: true,
        },
      ],
      student.id
    );

    expect(draft.status).toBe('draft');
    expect(draft.current_version).toBe(1);
    const stableId = draft.id;
    const stableRef = draft.reference_number;

    // STEP 2: Submitted - Application is sent for review
    const submitted = await submitApplication(stableId, student.id, 'Formal submission for review.');
    expect(submitted.status).toBe('submitted');
    expect(submitted.id).toBe(stableId);

    // STEP 3: Under Review - Admin examines the application
    const underReview = await transitionApplicationStatus(
      stableId,
      'under_review',
      admin,
      'Patent Review Cell commenced active screening.'
    );
    expect(underReview.status).toBe('under_review');
    expect(underReview.id).toBe(stableId);

    // STEP 4: Decision Split - Admin requests corrections
    await createCorrectionRequest(
      stableId,
      admin.id,
      'Please quantify mechanical strain conversion efficiency in Novelty section.',
      'novelty_features'
    );
    const correctionsReq = await transitionApplicationStatus(
      stableId,
      'corrections_required',
      admin,
      'Novelty efficiency metrics needed.'
    );
    expect(correctionsReq.status).toBe('corrections_required');

    // STEP 5: Student edits and resubmits (Same application ID; updated version and history)
    await saveDraftApplication(
      {
        id: stableId,
        novelty_features: 'Graded modulus boundary coupling achieving 38% mechanical strain-to-voltage conversion.',
      },
      draft.inventors || [],
      student.id
    );

    const resubmitted = await resubmitApplication(
      stableId,
      student.id,
      'Clarified efficiency metrics as requested.'
    );

    // CRITICAL REQUIREMENT VERIFICATION:
    // 1. Same Application ID preserved
    expect(resubmitted.id).toBe(stableId);
    expect(resubmitted.reference_number).toBe(stableRef);
    // 2. Status moved to resubmitted
    expect(resubmitted.status).toBe('resubmitted');
    // 3. Version incremented to 2
    expect(resubmitted.current_version).toBe(2);

    // 4. Verify previous submission history is retained in database
    const rawVersions = localStorage.getItem('muj_patent_portal_versions');
    expect(rawVersions).toBeDefined();
    const appVersions = JSON.parse(rawVersions || '[]').filter((v: any) => v.application_id === stableId);
    expect(appVersions.length).toBe(2);
    expect(appVersions[0].version_number).toBe(1);
    expect(appVersions[1].version_number).toBe(2);

    // STEP 6: Admin reviews again and approves for next stage
    const approved = await transitionApplicationStatus(
      stableId,
      'approved_next_stage',
      admin,
      'Cleared by Patent Review Cell for institutional patent filing.'
    );
    expect(approved.status).toBe('approved_next_stage');
    expect(approved.id).toBe(stableId);

    const finalApp = await fetchApplicationById(stableId, student);
    expect(finalApp?.status).toBe('approved_next_stage');
    expect(finalApp?.current_version).toBe(2);
  });
});
