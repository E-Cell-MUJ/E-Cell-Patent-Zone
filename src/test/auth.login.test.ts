import { describe, it, expect, beforeEach } from 'vitest';
import { isAllowedUniversityEmail } from '../features/auth/authUtils';
import { COORDINATOR } from '../config/constants';
import { upsertProfile, fetchCurrentProfile } from '../lib/api';

describe('Institutional Authentication & Role Segregation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates official MUJ university student emails', () => {
    expect(isAllowedUniversityEmail('aditya.sharma@muj.manipal.edu')).toBe(true);
    expect(isAllowedUniversityEmail('219301234@muj.manipal.edu')).toBe(true);
    expect(isAllowedUniversityEmail('patent.admin@muj.manipal.edu')).toBe(true);
    expect(isAllowedUniversityEmail('coordinator@muj.manipal.edu')).toBe(true);
  });

  it('strictly rejects non-university personal email domains', () => {
    expect(isAllowedUniversityEmail('user@gmail.com')).toBe(false);
    expect(isAllowedUniversityEmail('student@yahoo.com')).toBe(false);
    expect(isAllowedUniversityEmail('attacker@evil.com')).toBe(false);
    expect(isAllowedUniversityEmail('test@muj.manipal.edu.evil.com')).toBe(false);
  });

  it('correctly provisions student applicant profiles on sign-in', async () => {
    const studentEmail = 'aditya.sharma@muj.manipal.edu';
    const profile = await upsertProfile({
      id: 'student-aditya',
      university_email: studentEmail,
      full_name: 'Aditya Sharma',
      role: 'student',
      department: 'Computer Science and Engineering',
    });

    expect(profile.role).toBe('student');
    expect(profile.university_email).toBe(studentEmail);

    const fetched = await fetchCurrentProfile(profile.id);
    expect(fetched?.role).toBe('student');
    expect(fetched?.full_name).toBe('Aditya Sharma');
  });

  it('correctly provisions Patent Coordinator admin profile', async () => {
    const coordEmail = COORDINATOR.EMAIL;
    const profile = await upsertProfile({
      id: COORDINATOR.ID,
      university_email: coordEmail,
      full_name: COORDINATOR.FULL_NAME,
      role: 'admin',
      department: 'Directorate of Research & IPR Cell',
    });

    expect(profile.role).toBe('admin');
    expect(profile.full_name).toBe(COORDINATOR.FULL_NAME);

    const fetched = await fetchCurrentProfile(COORDINATOR.ID);
    expect(fetched?.role).toBe('admin');
    expect(fetched?.university_email).toBe(coordEmail);
  });
});
