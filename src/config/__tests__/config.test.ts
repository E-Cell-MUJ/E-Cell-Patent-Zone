import { describe, it, expect } from 'vitest';
import { ENV, validateEnvironment } from '../env';
import {
  INSTITUTION,
  COORDINATOR,
  DEMO_PERSONAS,
  STORAGE_KEYS,
  STORAGE_BUCKETS,
  SECURITY_RULES,
} from '../constants';
import { validateMujEmail, formatReferenceNo, computeSha256 } from '../../lib/supabase';
import { SEED_PROFILES, INITIAL_APPLICATIONS } from '../../data/seedData';

describe('Centralized Configuration & Environment Architecture', () => {
  describe('ENV fallback and structure', () => {
    it('should provide default institutional URLs and endpoints', () => {
      expect(ENV.PORTAL_BASE_URL).toContain('muj.manipal.edu');
      expect(ENV.INSTITUTION_NAME).toBe('Manipal University Jaipur');
      expect(ENV.INSTITUTION_SHORT_NAME).toBe('MUJ');
      expect(ENV.INSTITUTION_WEBSITE_URL).toContain('manipal.edu');
      expect(ENV.IPR_CELL_URL).toContain('ipr-cell');
      expect(ENV.CONTACT_EMAIL).toBe('ipr.cell@muj.manipal.edu');
      expect(ENV.COORDINATOR_NAME).toBe('Dr. Dorelal Sharma');
      expect(ENV.ALLOWED_EMAIL_DOMAIN).toBe('muj.manipal.edu');
    });

    it('should provide default Supabase and storage bucket configurations', () => {
      expect(ENV.SUPABASE_URL).toBeDefined();
      expect(ENV.STORAGE_BUCKET_DOCS).toBe('patent-documents');
      expect(ENV.STORAGE_BUCKET_DRAWINGS).toBe('patent-drawings');
    });

    it('should validate environment and fail fast in production if required variables are missing', () => {
      expect(validateEnvironment(ENV).valid).toBe(true);

      const prodEnvWithPlaceholders = {
        ...ENV,
        APP_ENV: 'production' as const,
        SUPABASE_URL: 'https://mock-instance.supabase.co',
      };
      expect(() => validateEnvironment(prodEnvWithPlaceholders)).toThrow(/Production startup failure/);

      const prodEnvValid = {
        ...ENV,
        APP_ENV: 'production' as const,
        SUPABASE_URL: 'https://real-project.supabase.co',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validkey',
        PORTAL_BASE_URL: 'https://patents.muj.manipal.edu',
      };
      expect(validateEnvironment(prodEnvValid).valid).toBe(true);
    });
  });

  describe('INSTITUTION constants', () => {
    it('should contain accurate university identity attributes', () => {
      expect(INSTITUTION.NAME).toBe('Manipal University Jaipur');
      expect(INSTITUTION.SHORT_NAME).toBe('MUJ');
      expect(INSTITUTION.DOMAIN).toBe('muj.manipal.edu');
      expect(INSTITUTION.EMAIL_AT_DOMAIN).toBe('@muj.manipal.edu');
      expect(INSTITUTION.ADDRESS).toContain('Dehmi Kalan, Jaipur');
      expect(INSTITUTION.DEPARTMENTS.IPR_CELL).toBe('Directorate of Research & IPR Cell');
      expect(INSTITUTION.SIGN_IN_NOTICE).toContain(INSTITUTION.SHORT_NAME);
    });
  });

  describe('COORDINATOR details', () => {
    it('should centralize coordinator attributes', () => {
      expect(COORDINATOR.ID).toBe('admin-coordinator-uuid');
      expect(COORDINATOR.FULL_NAME).toBe('Dr. Dorelal Sharma');
      expect(COORDINATOR.INFORMAL_NAME).toBe('Patent Coordinator');
      expect(COORDINATOR.EMAIL).toBe('dorelal.coordinator@muj.manipal.edu');
      expect(COORDINATOR.BADGE).toContain('Patent Review');
      expect(COORDINATOR.ADMIN_BADGE).toContain('Patent Coordinator');
    });
  });

  describe('DEMO_PERSONAS', () => {
    it('should match the allowed institutional domain', () => {
      expect(DEMO_PERSONAS.STUDENT_ADITYA.email).toMatch(/@muj\.manipal\.edu$/);
      expect(DEMO_PERSONAS.STUDENT_PRIYA.email).toMatch(/@muj\.manipal\.edu$/);
      expect(DEMO_PERSONAS.FACULTY_GUIDE.email).toMatch(/@muj\.manipal\.edu$/);
      expect(DEMO_PERSONAS.COORDINATOR.email).toMatch(/@muj\.manipal\.edu$/);
    });

    it('should specify demo MFA code and application reference ID', () => {
      expect(DEMO_PERSONAS.DEMO_MFA_CODE).toBe('123456');
      expect(DEMO_PERSONAS.DEFAULT_APPLICATION_ID).toBe('app-0003');
    });
  });

  describe('STORAGE_KEYS & STORAGE_BUCKETS', () => {
    it('should define isolated local storage keys', () => {
      expect(STORAGE_KEYS.AUTH_USER).toBe('muj_patent_portal_auth_user');
      expect(STORAGE_KEYS.APPLICATIONS).toBe('muj_patent_portal_applications');
      expect(STORAGE_KEYS.MFA_TIMESTAMP).toBe('muj_patent_portal_mfa_timestamp');
      expect(STORAGE_BUCKETS.DOCUMENTS).toBe('patent-documents');
    });
  });

  describe('Email validation (validateMujEmail) with centralized rules', () => {
    it('accepts valid @muj.manipal.edu emails', () => {
      expect(validateMujEmail('aditya.sharma@muj.manipal.edu')).toBe(true);
      expect(validateMujEmail('priya.patel@muj.manipal.edu')).toBe(true);
      expect(validateMujEmail('patent.coordinator@muj.manipal.edu')).toBe(true);
      expect(validateMujEmail('student123@muj.manipal.edu')).toBe(true);
      expect(validateMujEmail('FIRST.LAST@MUJ.MANIPAL.EDU')).toBe(true);
    });

    it('rejects non-institutional emails and malicious domains', () => {
      expect(validateMujEmail('user@gmail.com')).toBe(false);
      expect(validateMujEmail('hacker@muj.manipal.edu.evil.com')).toBe(false);
      expect(validateMujEmail('user@manipal.edu')).toBe(false); // must be muj.manipal.edu
      expect(validateMujEmail('@muj.manipal.edu')).toBe(false);
      expect(validateMujEmail('')).toBe(false);
      expect(validateMujEmail('   ')).toBe(false);
      expect(validateMujEmail('null')).toBe(false);
    });

    it('rejects dot-tampering attacks where subdomains or TLD characters are modified', () => {
      // Proves that all dots are escaped in the generated regex, preventing wildcard character matches
      expect(validateMujEmail('user@muj.manipalXedu')).toBe(false);
      expect(validateMujEmail('user@mujXmanipal.edu')).toBe(false);
      expect(validateMujEmail('user@muj.manipal_edu')).toBe(false);
      expect(validateMujEmail('user@muj0manipal0edu')).toBe(false);
    });
  });

  describe('Reference numbering and cryptographic hashing', () => {
    it('should correctly format MUJ reference sequence numbers', () => {
      expect(formatReferenceNo(2026, 1)).toBe('MUJ-PAT-2026-0001');
      expect(formatReferenceNo(2026, 42)).toBe('MUJ-PAT-2026-0042');
      expect(formatReferenceNo(2026, 9999)).toBe('MUJ-PAT-2026-9999');
    });

    it('should produce valid SHA-256 hex string', async () => {
      const hash = await computeSha256('test snapshot payload');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Seed Data Integrity with Config', () => {
    it('all seed profile emails must be valid under SECURITY_RULES.EMAIL_REGEX', () => {
      for (const profile of SEED_PROFILES) {
        expect(SECURITY_RULES.EMAIL_REGEX.test(profile.email)).toBe(true);
      }
    });

    it('coordinator seed profile matches COORDINATOR configuration', () => {
      const coord = SEED_PROFILES.find((p) => p.role === 'coordinator');
      expect(coord).toBeDefined();
      expect(coord?.id).toBe(COORDINATOR.ID);
      expect(coord?.email).toBe(COORDINATOR.EMAIL);
      expect(coord?.full_name).toBe(COORDINATOR.FULL_NAME);
    });

    it('all initial applications have matching owner email domains', () => {
      for (const app of INITIAL_APPLICATIONS) {
        expect(app.owner_email).toBeDefined();
        expect(SECURITY_RULES.EMAIL_REGEX.test(app.owner_email || '')).toBe(true);
        expect(app.reference_no).toMatch(/^MUJ-PAT-2026-\d{4}$/);
      }
    });
  });
});
