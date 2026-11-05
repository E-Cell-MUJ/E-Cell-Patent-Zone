import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchApplicationById,
  saveDraftApplication,
  submitApplication,
  transitionApplicationStatus,
  upsertProfile,
  uploadDocument,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../lib/api';
import { canTransition } from '../features/applications/workflow';
import { isAllowedUniversityEmail } from '../features/auth/authUtils';

describe('Security & Access Control Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prevents Student A from accessing Student B patent disclosure', async () => {
    const studentA = { id: 'student-alice-uuid', role: 'student' as const };
    const studentB = { id: 'student-bob-uuid', role: 'student' as const };

    const bobApp = await saveDraftApplication(
      { title: 'Bob Private Invention' },
      [],
      studentB.id
    );

    // Alice attempts to inspect Bob's application
    await expect(fetchApplicationById(bobApp.id, studentA)).rejects.toThrow('Access denied');
  });

  it('prevents students from promoting their own account to admin', async () => {
    const student = {
      id: 'student-charlie-uuid',
      university_email: 'charlie@muj.manipal.edu',
      full_name: 'Charlie Student',
      role: 'student' as const,
    };

    // Initial creation as student
    const created = await upsertProfile(student);
    expect(created.role).toBe('student');

    // Charlie attempts privilege escalation to admin
    const escalated = await upsertProfile({
      id: student.id,
      university_email: student.university_email,
      role: 'admin',
    });

    // Verification: role must remain student!
    expect(escalated.role).toBe('student');
  });

  it('prevents students from approving their own patent applications', async () => {
    const student = { id: 'student-david-uuid', role: 'student' as const };

    const app = await saveDraftApplication({ title: 'David Disclosure' }, [], student.id);
    await submitApplication(app.id, student.id);

    // Student directly calls transition status to approved_next_stage
    await expect(
      transitionApplicationStatus(app.id, 'approved_next_stage', student)
    ).rejects.toThrow(/Unauthorized transition/);
  });

  it('prevents student from moving application to under_review or corrections_required', () => {
    expect(canTransition('submitted', 'under_review', 'student')).toBe(false);
    expect(canTransition('under_review', 'corrections_required', 'student')).toBe(false);
  });

  it('rejects oversized document uploads (> 25MB)', async () => {
    const student = { id: 'student-uploader', role: 'student' as const };
    const app = await saveDraftApplication({ title: 'App with big file' }, [], student.id);

    // Create mock oversized file (26 Megabytes)
    const oversizedBlob = new Blob([new Uint8Array(MAX_DOCUMENT_SIZE_BYTES + 1024)], {
      type: 'application/pdf',
    });
    const oversizedFile = new File([oversizedBlob], 'massive_patent_spec.pdf', {
      type: 'application/pdf',
    });

    await expect(
      uploadDocument(app.id, oversizedFile, 'complete_specification', student.id)
    ).rejects.toThrow(/exceeds maximum permitted size/);
  });

  it('rejects forbidden file MIME types', async () => {
    const student = { id: 'student-uploader', role: 'student' as const };
    const app = await saveDraftApplication({ title: 'App with bad file' }, [], student.id);

    const maliciousFile = new File(['executable binary'], 'malicious_script.exe', {
      type: 'application/x-msdownload',
    });

    await expect(
      uploadDocument(app.id, maliciousFile, 'complete_specification', student.id)
    ).rejects.toThrow(/Unsupported file type/);
  });

  it('rejects spoofed file extensions even with permitted MIME types', async () => {
    const student = { id: 'student-uploader', role: 'student' as const };
    const app = await saveDraftApplication({ title: 'App with spoofed file' }, [], student.id);

    const spoofedFile = new File(['<html><script>alert(1)</script></html>'], 'exploit.html', {
      type: 'application/pdf',
    });

    await expect(
      uploadDocument(app.id, spoofedFile, 'complete_specification', student.id)
    ).rejects.toThrow(/Unsupported file extension/);
  });

  it('prevents illegal state transitions outside permitted state machine', () => {
    // Draft directly to resubmitted without prior review or corrections
    expect(canTransition('draft', 'resubmitted', 'student')).toBe(false);

    // Approved application cannot transition back to draft
    expect(canTransition('approved_next_stage', 'draft', 'student')).toBe(false);
    expect(canTransition('approved_next_stage', 'draft', 'admin')).toBe(false);
  });

  describe('University Email Domain Enforcement', () => {
    it('accepts valid @muj.manipal.edu email addresses', () => {
      expect(isAllowedUniversityEmail('student@muj.manipal.edu')).toBe(true);
      expect(isAllowedUniversityEmail('aditya.sharma@muj.manipal.edu')).toBe(true);
      expect(isAllowedUniversityEmail('patent.admin@muj.manipal.edu')).toBe(true);
      expect(isAllowedUniversityEmail('  TEST.USER@MUJ.MANIPAL.EDU  ')).toBe(true);
    });

    it('strictly rejects non-@muj.manipal.edu domains', () => {
      expect(isAllowedUniversityEmail('student@jaipur.manipal.edu')).toBe(false);
      expect(isAllowedUniversityEmail('student@manipal.edu')).toBe(false);
      expect(isAllowedUniversityEmail('student@gmail.com')).toBe(false);
      expect(isAllowedUniversityEmail('student@yahoo.com')).toBe(false);
      expect(isAllowedUniversityEmail('attacker@muj.manipal.edu.malicious.com')).toBe(false);
      expect(isAllowedUniversityEmail('')).toBe(false);
    });
  });
});
