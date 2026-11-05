import { describe, it, expect, beforeEach } from 'vitest';
import * as api from '../lib/api';
import type { Profile } from '../types/database.types';

describe('Portal Lifecycle End-to-End Functionality (Ready for Use Case)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('runs complete lifecycle: draft -> submit -> review -> correction -> resubmit -> approve', async () => {
    // 1. Create student, coordinator, and super admin profiles
    const student: Profile = await api.upsertProfile({
      id: 'student-aditya',
      university_email: 'aditya.sharma@muj.manipal.edu',
      full_name: 'Aditya Sharma',
      role: 'student',
      department: 'Computer Science and Engineering',
      registration_number: '229301045',
    });

    const coordinator: Profile = await api.upsertProfile({
      id: 'admin-coordinator-uuid',
      university_email: 'dorelal.coordinator@muj.manipal.edu',
      full_name: 'Dr. Dorelal Sharma',
      role: 'admin',
      department: 'Directorate of Research & IPR Cell',
    });

    const superAdmin: Profile = await api.upsertProfile({
      id: 'super-admin-uuid',
      university_email: 'it.admin@muj.manipal.edu',
      full_name: 'IT Systems Administrator',
      role: 'super_admin',
      department: 'Directorate of IT & Systems',
    });

    expect(student.role).toBe('student');
    expect(coordinator.role).toBe('admin');
    expect(superAdmin.role).toBe('super_admin');

    // 2. Student saves a draft patent application
    const draft = await api.saveDraftApplication(
      {
        title: 'IoT-Based Solar Crop Dryer with Thermal Storage',
        technical_field: 'Renewable Energy & Agriculture',
        background_problem: 'Open sun drying results in high crop loss and contamination.',
        description: 'A forced convection solar dryer integrated with PCM thermal energy storage.',
        novelty_features: 'Phase change material keeps continuous drying temperature at night.',
        practical_applications: 'Smallholder farm cooperatives and food processing units.',
      },
      [
        {
          full_name: 'Aditya Sharma',
          email: 'aditya.sharma@muj.manipal.edu',
          affiliation_type: 'student',
          department: 'Computer Science and Engineering',
          is_primary: true,
        },
      ],
      student.id
    );

    expect(draft.id).toBeDefined();
    expect(draft.status).toBe('draft');
    expect(draft.reference_number).toContain('MUJ-PAT-');

    // 3. Student submits the draft
    const submitted = await api.submitApplication(
      draft.id,
      student.id,
      'Final submission ready for coordinator screening.'
    );
    expect(submitted.status).toBe('submitted');

    // 4. Coordinator examines the submitted application
    const coordView = await api.fetchApplications(coordinator);
    const pendingApp = coordView.find((a) => a.id === draft.id);
    expect(pendingApp).toBeDefined();
    expect(pendingApp?.status).toBe('submitted');

    // 5. Coordinator transitions to under_review
    const inReview = await api.transitionApplicationStatus(
      draft.id,
      'under_review',
      coordinator,
      'Commencing novelty search and claims assessment.'
    );
    expect(inReview.status).toBe('under_review');

    // 6. Coordinator requests corrections
    const correctionsReq = await api.transitionApplicationStatus(
      draft.id,
      'corrections_required',
      coordinator,
      'Please elaborate on the PCM temperature retention curves.'
    );
    expect(correctionsReq.status).toBe('corrections_required');

    // 7. Student resubmits after addressing feedback
    const resubmitted = await api.resubmitApplication(
      draft.id,
      student.id,
      'Added enthalpy curves and temperature distribution logs in description.'
    );
    expect(resubmitted.status).toBe('resubmitted');
    expect(resubmitted.current_version).toBeGreaterThan(1);

    // 8. Coordinator approves for next stage (IPR filing)
    const approved = await api.transitionApplicationStatus(
      draft.id,
      'approved_next_stage',
      coordinator,
      'All technical queries resolved. Approved for formal patent attorney drafting.'
    );
    expect(approved.status).toBe('approved_next_stage');

    // 9. Super Admin verifies directory and audit log
    const userDir = await api.fetchUserDirectory();
    expect(userDir.length).toBeGreaterThanOrEqual(3);

    const supervision = await api.fetchProcessSupervisionOverview();
    expect(supervision.length).toBeGreaterThanOrEqual(1);

    // Verify registration kill switch
    await api.setRegistrationEnabled(false);
    const regOpen = await api.fetchRegistrationEnabled();
    expect(regOpen).toBe(false);

    // Reopen registration
    await api.setRegistrationEnabled(true);
    const regReopened = await api.fetchRegistrationEnabled();
    expect(regReopened).toBe(true);
  });
});
