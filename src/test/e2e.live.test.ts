// @vitest-environment node
// Live end-to-end check of src/lib/api.ts against a throwaway Supabase project.
// api.ts falls back to browser storage on backend errors, so every step is verified
// directly in Postgres (SUPABASE_DB_URL) instead of trusting the return values.
// Run: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... SUPABASE_DB_URL=... npx vitest run src/test/e2e.live.test.ts --mode e2e
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import * as api from '../lib/api';

const DB_URL = process.env.SUPABASE_DB_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), standing in for the coordinator's authenticator app
function totp(base32Secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...base32Secret.replace(/=+$/, '').toUpperCase()]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe.skipIf(!DB_URL)('live backend', { timeout: 120_000 }, () => {
  const s = Date.now().toString(36);
  const pw = `E2e-${s}-pw`;
  const emails = {
    student: `e2e.student.${s}@muj.manipal.edu`,
    coord: `e2e.coord.${s}@muj.manipal.edu`,
    superAdmin: `e2e.super.${s}@muj.manipal.edu`,
  };
  const ids: Record<string, string> = {};
  const fields = {
    title: 'E2E Solar Dryer',
    technical_field: 'Energy',
    background_problem: 'Drying',
    description: 'Desc',
    novelty_features: 'Novel',
    practical_applications: 'Farms',
  };
  let db: pg.Client;
  let appId = '';

  const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => (await q(`SELECT count(*)::int AS n FROM ${sql}`, params))[0].n;
  const appRow = async () => (await q(`SELECT * FROM applications WHERE id::text = $1`, [appId]))[0];
  const totpSecrets: Record<string, string> = {};
  // Every role passes TOTP, as the MfaGate does
  const signIn = async (email: string, password = pw) => {
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    {
      if (!totpSecrets[email]) {
        const { data: f, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (enrollError) throw enrollError;
        totpSecrets[email] = f.totp.secret;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factorId = factors?.all.find((x) => x.factor_type === 'totp')!.id;
      const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId!, code: totp(totpSecrets[email]) });
      if (mfaError) throw mfaError;
    }
    return data.user.id;
  };

  beforeAll(async () => {
    expect(isSupabaseConfigured()).toBe(true);
    db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
  });

  afterAll(async () => {
    await supabase.auth.signOut();
    if (!db) return;
    const users = Object.values(emails);
    await q(`DELETE FROM applications WHERE owner_id IN (SELECT id FROM auth.users WHERE email = ANY($1))`, [users]);
    await q(`DELETE FROM auth.users WHERE email = ANY($1)`, [users]);
    await db.end();
  });

  it('registers accounts that work only after the emailed code', async () => {
    // Needs a test project with CAPTCHA off; production keeps it on
    for (const [key, email] of Object.entries(emails)) {
      // Same call as AuthContext.registerUniversityAccount
      const { error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: { data: { full_name: `E2E ${key}`, department: 'CSE' } },
      });
      expect(error).toBeNull();
      const [user] = await q(`SELECT id, email_confirmed_at FROM auth.users WHERE email = $1`, [email]);
      expect(user.email_confirmed_at).toBeNull();
      ids[key] = user.id;
      expect(await count(`profiles WHERE id = $1`, [user.id])).toBe(0);
    }
    const { error: early } = await supabase.auth.signInWithPassword({ email: emails.student, password: pw });
    expect(early?.code).toBe('email_not_confirmed');
    // The code itself only reaches the inbox; confirming here is what verifyOtp does on the server
    await q(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = ANY($1)`, [Object.values(ids)]);
    expect(await count(`profiles WHERE id = ANY($1)`, [Object.values(ids)])).toBe(3);

    // Signing up again with a known address neither errors nor changes the password
    await supabase.auth.signUp({ email: emails.student, password: 'someone-else' });
    await supabase.auth.signOut();
    const { error: still } = await supabase.auth.signInWithPassword({ email: emails.student, password: pw });
    expect(still).toBeNull();

    // Role bootstrap, as done from the SQL editor
    await q(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [ids.coord]);
    await q(`UPDATE profiles SET role = 'super_admin' WHERE id = $1`, [ids.superAdmin]);
  });

  it('coordinator without TOTP is not an admin', async () => {
    await supabase.auth.signOut();
    await supabase.auth.signInWithPassword({ email: emails.coord, password: pw });
    const { data } = await supabase.rpc('is_admin');
    expect(data).toBe(false);
  });

  it('student signs in, saves a draft, manages documents and submits', async () => {
    const uid = await signIn(emails.student);
    expect(await api.fetchCurrentProfile(uid)).toMatchObject({
      role: 'student',
      department: 'CSE',
      university_email: emails.student,
    });

    const draft = await api.saveDraftApplication(
      fields,
      [{ full_name: 'E2E student', email: emails.student, affiliation_type: 'student', department: 'CSE' }],
      uid
    );
    appId = draft.id;
    const row = await appRow();
    expect(row?.status).toBe('draft');
    expect(row.reference_number).toMatch(/^MUJ-PAT-\d{4}-\d{4}$/);
    expect(await count(`inventors WHERE application_id::text = $1`, [appId])).toBe(1);

    const pdf = () => new File(['%PDF-1.4 e2e'], 'spec.pdf', { type: 'application/pdf' });
    const doc = await api.uploadDocument(appId, pdf(), 'complete_specification', uid);
    expect(doc.id).toMatch(UUID);
    expect(await count(`storage.objects WHERE bucket_id = 'patent-documents' AND name = $1`, [doc.storage_path])).toBe(1);
    await api.deleteDocument(doc.id, uid);
    expect(await count(`application_documents WHERE id::text = $1`, [doc.id])).toBe(0);
    expect((await api.uploadDocument(appId, pdf(), 'complete_specification', uid)).id).toMatch(UUID);

    await api.submitApplication(appId, uid, 'E2E submission');
    const sub = await appRow();
    expect(sub.status).toBe('submitted');
    expect(sub.submitted_at).not.toBeNull();
    expect(await count(`application_versions WHERE application_id::text = $1 AND version_number = 1`, [appId])).toBe(1);
    expect(await count(`notifications WHERE user_id = $1`, [uid])).toBe(1);
    expect(await api.fetchNotifications(uid)).toHaveLength(1);
  });

  it('coordinator reviews and requests corrections', async () => {
    const uid = await signIn(emails.coord);
    const admin = { id: uid, role: 'admin' as const };
    expect((await api.fetchApplications(admin)).some((a) => a.id === appId)).toBe(true);
    const detail = await api.fetchApplicationById(appId, admin);
    expect(detail?.inventors).toHaveLength(1);
    expect(detail?.application_documents).toHaveLength(1);

    await api.transitionApplicationStatus(appId, 'under_review', admin);
    expect((await appRow()).status).toBe('under_review');
    expect((await api.createCorrectionRequest(appId, uid, 'Add drawings', 'description')).id).toMatch(UUID);
    await api.addApplicationComment(appId, uid, 'E2E general comment', 'general');
    await api.transitionApplicationStatus(appId, 'corrections_required', admin, 'Drawings missing');
    expect((await appRow()).status).toBe('corrections_required');
    expect(await count(`notifications WHERE user_id = $1 AND title LIKE 'Corrections%'`, [ids.student])).toBe(1);
  });

  it('student sees feedback, edits and resubmits', async () => {
    const uid = await signIn(emails.student);
    const user = { id: uid, role: 'student' as const };
    const app = await api.fetchApplicationById(appId, user);
    expect(app?.status).toBe('corrections_required');
    expect(app?.correction_requests?.[0]).toMatchObject({ status: 'pending', comment: 'Add drawings' });
    expect((await api.fetchApplicationComments(appId, 'student')).map((c: any) => c.content)).toContain('E2E general comment');

    await api.saveDraftApplication({ id: appId, ...fields, description: 'Desc with drawings' }, app!.inventors!, uid);
    expect((await appRow()).description).toBe('Desc with drawings');
    await api.resubmitApplication(appId, uid, 'E2E resubmission');
    const re = await appRow();
    expect(re.status).toBe('resubmitted');
    expect(re.current_version).toBe(2);
    expect(await count(`correction_requests WHERE application_id::text = $1 AND status = 'pending'`, [appId])).toBe(0);
    expect(await count(`application_versions WHERE application_id::text = $1 AND version_number = 2`, [appId])).toBe(1);
    expect(await count(`notifications WHERE user_id = $1 AND title LIKE 'Application Resubmitted%'`, [ids.coord])).toBe(1);

    await expect(api.transitionApplicationStatus(appId, 'approved_next_stage', user)).rejects.toThrow();
    expect((await appRow()).status).toBe('resubmitted');
  });

  it('coordinator approves; super admin supervises', async () => {
    const cid = await signIn(emails.coord);
    await api.transitionApplicationStatus(appId, 'approved_next_stage', { id: cid, role: 'admin' });
    expect((await appRow()).status).toBe('approved_next_stage');

    await signIn(emails.superAdmin);
    expect((await api.fetchAllProfiles()).map((p) => p.id)).toEqual(expect.arrayContaining(Object.values(ids)));
    expect((await api.fetchProcessSupervisionOverview()).find((o) => o.id === appId)).toMatchObject({
      status: 'approved_next_stage',
      applicant_email: emails.student,
    });
    const telemetry = await api.fetchSuperAdminTelemetry();
    expect(telemetry?.applications_by_status?.approved_next_stage).toBeGreaterThanOrEqual(1);

    expect(await api.superAdminUpdateUserRole(ids.student, 'admin')).toEqual({ success: true });
    expect((await q(`SELECT role FROM profiles WHERE id = $1`, [ids.student]))[0].role).toBe('admin');
    expect(await api.superAdminUpdateUserRole(ids.student, 'student')).toEqual({ success: true });

    expect(await api.superAdminResetUserPassword(emails.student, `${pw}-new`, 'E2E student', 'CSE')).toEqual({ success: true });
    expect(await signIn(emails.student, `${pw}-new`)).toBe(ids.student);
  });
});
