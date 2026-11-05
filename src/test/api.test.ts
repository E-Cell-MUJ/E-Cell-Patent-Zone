import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraftApplication,
  submitApplication,
  resubmitApplication,
  transitionApplicationStatus,
  createCorrectionRequest,
  fetchApplications,
  fetchApplicationById,
} from '../lib/api';

describe('Data Access Layer & Workflow Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates and saves a new draft application with inventors', async () => {
    const studentUser = { id: 'student-test-01', role: 'student' as const };
    const draftData = {
      title: 'Novel Solar Heat Exchanger',
      technical_field: 'Thermal Engineering',
      background_problem: 'Inefficient fluid heat transfer in high-temperature parabolic concentrators.',
      description: 'Micro-finned dual passage fluid conduit.',
      novelty_features: 'Asymmetric turbulent boundary layer trips.',
      practical_applications: 'Solar steam power generation and industrial water desalination.',
    };

    const inventors = [
      {
        full_name: 'Aditya Sharma',
        email: 'aditya.sharma@muj.manipal.edu',
        affiliation_type: 'student' as const,
        department: 'Mechanical Engineering',
        is_primary: true,
      },
    ];

    const created = await saveDraftApplication(draftData, inventors, studentUser.id);
    expect(created.id).toBeDefined();
    expect(created.reference_number).toMatch(/^MUJ-PAT-\d{4}-\d{4}$/);
    expect(created.status).toBe('draft');
    expect(created.inventors).toHaveLength(1);
    expect(created.inventors![0].full_name).toBe('Aditya Sharma');
  });

  it('submits a draft application and transitions status to submitted', async () => {
    const studentUser = { id: 'student-test-02', role: 'student' as const };
    const draft = await saveDraftApplication(
      { title: 'Draft to submit' },
      [],
      studentUser.id
    );

    const submitted = await submitApplication(draft.id, studentUser.id);
    expect(submitted.status).toBe('submitted');
    expect(submitted.submitted_at).toBeDefined();

    const fetched = await fetchApplicationById(draft.id, studentUser);
    expect(fetched?.status).toBe('submitted');
  });

  it('prevents non-owner students from accessing other students applications', async () => {
    const studentA = { id: 'student-A', role: 'student' as const };
    const studentB = { id: 'student-B', role: 'student' as const };

    const draft = await saveDraftApplication(
      { title: 'Student A Secret Invention' },
      [],
      studentA.id
    );

    await expect(fetchApplicationById(draft.id, studentB)).rejects.toThrow('Access denied');
  });

  it('allows admin (Patent Coordinator) to review and request corrections', async () => {
    const student = { id: 'student-C', role: 'student' as const };
    const admin = { id: 'admin-coordinator-uuid', role: 'admin' as const };

    const draft = await saveDraftApplication({ title: 'Application for Review' }, [], student.id);
    await submitApplication(draft.id, student.id);

    // Admin transitions to under_review
    const underReview = await transitionApplicationStatus(draft.id, 'under_review', admin);
    expect(underReview.status).toBe('under_review');

    // Admin adds correction request
    const corr = await createCorrectionRequest(
      draft.id,
      admin.id,
      'Please elaborate on the novelty features in Section 5.',
      'novelty_features'
    );
    expect(corr.id).toBeDefined();
    expect(corr.status).toBe('pending');

    // Admin transitions to corrections_required
    const correctionsReq = await transitionApplicationStatus(
      draft.id,
      'corrections_required',
      admin,
      'Incomplete novelty explanation'
    );
    expect(correctionsReq.status).toBe('corrections_required');

    // Student resubmits
    const resubmitted = await resubmitApplication(draft.id, student.id, 'Expanded novelty description.');
    expect(resubmitted.status).toBe('resubmitted');
    expect(resubmitted.current_version).toBe(2);

    // Verify fetchApplications filters by role
    const adminApps = await fetchApplications(admin);
    expect(adminApps.length).toBeGreaterThan(0);

    const studentApps = await fetchApplications(student);
    expect(studentApps.every((a) => a.owner_id === student.id)).toBe(true);
  });
});
