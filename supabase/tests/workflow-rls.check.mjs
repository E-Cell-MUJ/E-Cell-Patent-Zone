// Database security & workflow checks: runs the real migrations in an in-memory
// Postgres (PGlite) with minimal stand-ins for Supabase's auth/storage schemas.
// Run with: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const db = new PGlite();

// Minimal Supabase stand-ins
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
  CREATE TABLE auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{"provider":"azure"}'::jsonb, email_confirmed_at timestamptz default now(),
    instance_id uuid, aud text, role text, encrypted_password text, created_at timestamptz default now(), updated_at timestamptz,
    confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
  CREATE TABLE auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid not null, identity_data jsonb not null, provider text not null,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE TABLE auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  ALTER TABLE auth.users ADD COLUMN banned_until timestamptz, ADD COLUMN last_sign_in_at timestamptz;
  CREATE TABLE auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, factor_type text default 'totp', status text default 'verified');
  CREATE TABLE auth.audit_log_entries (id uuid primary key default gen_random_uuid(), payload json, created_at timestamptz default now(), ip_address varchar(64) default '');
  -- PGlite has no pgcrypto; stand-ins with the same signatures
  CREATE FUNCTION extensions.gen_salt(text) RETURNS text LANGUAGE sql AS $$ SELECT 'salt' $$;
  CREATE FUNCTION extensions.crypt(text, text) RETURNS text LANGUAGE sql AS $$ SELECT md5($2 || $1) $$;
  CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`);

const strip = (sql) => sql.replace(/CREATE EXTENSION[^;]+;/g, '');
await db.exec(strip(readFileSync(`${root}/supabase/migrations/001_initial_schema.sql`, 'utf8')));
await db.exec(readFileSync(`${root}/supabase/migrations/20261025000000_verified_auth_and_atomic_workflow.sql`, 'utf8'));
await db.exec(readFileSync(`${root}/supabase/migrations/20261029000000_super_admin_role.sql`, 'utf8'));
await db.exec(readFileSync(`${root}/supabase/migrations/20261029000100_frontend_direct_workflow.sql`, 'utf8'));

// An account the old register_university_user confirmed with no mailbox proof, with a live session
await db.exec('SET ROLE anon');
const [{ r: legacy }] = (await db.query(`SELECT register_university_user('legacy.user@muj.manipal.edu', 'secret1', 'Legacy User', 'MECH') AS r`)).rows;
await db.exec('RESET ROLE');
const L = legacy.user_id;
await db.query(`INSERT INTO auth.sessions (user_id) VALUES ($1)`, [L]);
await db.exec(readFileSync(`${root}/supabase/migrations/20261029000200_email_otp_verification_and_mfa.sql`, 'utf8'));
await db.exec(readFileSync(`${root}/supabase/migrations/20261031000000_student_authenticator.sql`, 'utf8'));
await db.exec(readFileSync(`${root}/supabase/migrations/20261031000100_fix_signup_trigger_search_path.sql`, 'utf8'));
await db.exec(readFileSync(`${root}/supabase/migrations/20261031000200_super_admin_console.sql`, 'utf8'));

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

const clear = `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SELECT set_config('request.jwt.claims', '', false);`;
// aal2 by default so coordinator checks pass; pass 'aal1' for a password-only session
async function as(uid, sql, params = [], aal = 'aal2') {
  await db.exec(uid
    ? `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false); SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, aal })}', false);`
    : clear);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec(clear);
  }
}
async function fails(uid, sql, re, params, aal) {
  await assert.rejects(() => as(uid, sql, params, aal), re);
}
const ok = (name) => console.log('ok -', name);

// 1. Domain gate + profile from metadata
await fails(null, `INSERT INTO auth.users (id, email) VALUES ('${'9'.repeat(8)}-9999-9999-9999-999999999999', 'x@gmail.com')`, /Only official @muj.manipal.edu/);
await fails(null, `INSERT INTO auth.users (id, email) VALUES ('${'8'.repeat(8)}-8888-8888-8888-888888888888', 'spoof@evil.com@muj.manipal.edu')`, /Only official/);
await as(null, `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('${A}', 'Alice.S@MUJ.manipal.edu', '{"full_name":"Alice S","department":"CSE","registration_number":"229","phone":"98","role":"admin"}'),
  ('${B}', 'bob@muj.manipal.edu', '{"name":"Bob K"}'),
  ('${C}', 'dorelal.coordinator@muj.manipal.edu', '{}')`);
const [pa] = await as(null, `SELECT * FROM profiles WHERE id = '${A}'`);
assert.equal(pa.university_email, 'alice.s@muj.manipal.edu');
assert.equal(pa.department, 'CSE');
assert.equal(pa.role, 'student', 'role from metadata must be ignored');
await fails(null, `UPDATE auth.users SET email = 'alice@gmail.com' WHERE id = '${A}'`, /Only official/);
assert.equal((await as(null, `SELECT full_name FROM profiles WHERE id = '${B}'`))[0].full_name, 'Bob K');
ok('domain gate and profile metadata');

// 2. Privilege escalation closed; provisioning works from SQL editor
await fails(A, `SELECT provision_admin_account('alice.s@muj.manipal.edu')`, /permission denied/);
await fails(A, `UPDATE profiles SET role = 'admin' WHERE id = '${A}'`, /only a super admin can change account roles/);
await fails(A, `UPDATE profiles SET university_email = 'bob@muj.manipal.edu' WHERE id = '${A}'`, /bound to the verified account/);
await as(A, `UPDATE profiles SET phone = '99' WHERE id = '${A}'`);
await as(null, `SELECT provision_admin_account('dorelal.coordinator@muj.manipal.edu')`);
assert.equal((await as(null, `SELECT role FROM profiles WHERE id = '${C}'`))[0].role, 'admin');
ok('privilege escalation blocked, admin provisioning works');

// 3. Atomic draft save
const draft = { title: 'Solar Dryer', technical_field: '', background_problem: '', description: '', novelty_features: '', practical_applications: '' };
const inventors = [{ full_name: 'Alice S', email: 'alice.s@muj.manipal.edu', department: 'CSE', affiliation_type: 'student' }, { full_name: 'Prof X', email: 'x@muj.manipal.edu', department: 'EEE', affiliation_type: 'faculty' }];
const [{ save_application_draft: appId }] = await as(A, `SELECT save_application_draft($1, $2)`, [draft, inventors]);
const [app] = await as(A, `SELECT * FROM applications WHERE id = $1`, [appId]);
assert.match(app.reference_number, /^MUJ-PAT-\d{4}-\d{4}$/);
assert.equal(app.status, 'draft');
const invs = await as(A, `SELECT * FROM inventors WHERE application_id = $1 ORDER BY order_index`, [appId]);
assert.deepEqual(invs.map((i) => [i.full_name, i.is_primary]), [['Alice S', true], ['Prof X', false]]);
await fails(A, `SELECT save_application_draft($1, $2)`, /invalid input value for enum affiliation_type/, [{ id: appId }, [{ full_name: 'Bad', affiliation_type: 'alien' }]]);
assert.equal((await as(A, `SELECT count(*)::int AS n FROM inventors WHERE application_id = $1`, [appId]))[0].n, 2, 'failed save must not drop inventors');
await fails(B, `SELECT save_application_draft($1, '[]')`, /not found or no longer editable/, [{ id: appId, title: 'hijack' }]);
ok('draft save is atomic and owner-scoped');

// 4. Workflow columns locked over the API
await fails(A, `UPDATE applications SET status = 'approved_next_stage' WHERE id = $1`, /Invalid status transition from draft to approved_next_stage/, [appId]);
await fails(A, `UPDATE applications SET current_version = 9 WHERE id = $1`, /workflow fields change only/, [appId]);
await as(A, `INSERT INTO applications (owner_id, reference_number, status, current_version, title, technical_field, background_problem, description, novelty_features, practical_applications)
  VALUES ('${A}', 'MUJ-PAT-2026-9999', 'submitted', 7, 't', '', '', '', '', '')`);
const [spoof] = await as(A, `SELECT * FROM applications WHERE title = 't'`);
assert.notEqual(spoof.reference_number, 'MUJ-PAT-2026-9999');
assert.equal(spoof.status, 'draft');
assert.equal(spoof.current_version, 1);
await fails(A, `INSERT INTO application_versions (application_id, version_number, snapshot_data, submitted_by) VALUES ($1, 5, '{}', '${A}')`, /row-level security/, [appId]);
ok('workflow columns, reference numbers and snapshots are tamper-proof');

// 5. Submit
await fails(A, `SELECT submit_application($1)`, /Complete all mandatory/, [appId]);
await as(A, `SELECT save_application_draft($1, '[]')`, [{ id: appId, technical_field: 'Energy', background_problem: 'Drying', description: 'Desc', novelty_features: 'Novel', practical_applications: 'Farms' }]);
await fails(B, `SELECT submit_application($1)`, /Application not found/, [appId]);
await as(A, `SELECT submit_application($1, 'first go')`, [appId]);
const [sub] = await as(A, `SELECT * FROM applications WHERE id = $1`, [appId]);
assert.equal(sub.status, 'submitted');
assert.ok(sub.submitted_at);
const [v1] = await as(A, `SELECT * FROM application_versions WHERE application_id = $1`, [appId]);
assert.equal(v1.version_number, 1);
assert.equal(v1.snapshot_data.inventors.length, 2);
assert.equal((await as(A, `SELECT reason FROM application_status_history WHERE application_id = $1 AND to_status = 'submitted'`, [appId]))[0].reason, 'first go');
assert.equal((await as(A, `SELECT count(*)::int AS n FROM notifications WHERE user_id = '${A}'`))[0].n, 1);
await fails(A, `SELECT submit_application($1)`, /Only draft applications/, [appId]);
await fails(A, `SELECT save_application_draft($1, '[]')`, /no longer editable/, [{ id: appId, title: 'edit after submit' }]);
ok('submit validates, snapshots, logs reason, notifies');

// 6. Coordinator transitions
await fails(A, `SELECT transition_application_status($1, 'approved_next_stage')`, /only the patent coordinator/, [appId]);
await as(C, `SELECT transition_application_status($1, 'under_review')`, [appId]);
await fails(C, `SELECT transition_application_status($1, 'submitted')`, /Invalid status transition from under_review to submitted/, [appId]);
await as(C, `INSERT INTO correction_requests (application_id, reviewer_id, comment) VALUES ($1, '${C}', 'Fix claims')`, [appId]);
await as(C, `SELECT transition_application_status($1, 'corrections_required', 'Claims too broad')`, [appId]);
assert.equal((await as(A, `SELECT reason FROM application_status_history WHERE application_id = $1 AND to_status = 'corrections_required'`, [appId]))[0].reason, 'Claims too broad');
assert.equal((await as(A, `SELECT title FROM notifications WHERE user_id = '${A}' ORDER BY created_at DESC, title LIMIT 1`))[0].title !== undefined, true);
// RLS filters the update silently: verify nothing changed
await as(A, `UPDATE correction_requests SET comment = 'nothing to fix', status = 'addressed' WHERE application_id = $1`, [appId]);
assert.equal((await as(null, `SELECT comment FROM correction_requests WHERE application_id = $1`, [appId]))[0].comment, 'Fix claims');
ok('coordinator transitions validated and reasons recorded');

// 7. Resubmit
await as(A, `SELECT save_application_draft($1, '[]')`, [{ id: appId, novelty_features: 'Narrowed claims' }]);
await as(A, `SELECT resubmit_application($1)`, [appId]);
const [re] = await as(A, `SELECT * FROM applications WHERE id = $1`, [appId]);
assert.equal(re.status, 'resubmitted');
assert.equal(re.current_version, 2);
assert.equal((await as(A, `SELECT status FROM correction_requests WHERE application_id = $1`, [appId]))[0].status, 'addressed');
const [v2] = await as(A, `SELECT * FROM application_versions WHERE application_id = $1 AND version_number = 2`, [appId]);
assert.equal(v2.snapshot_data.novelty_features, 'Narrowed claims');
assert.equal((await as(C, `SELECT count(*)::int AS n FROM notifications WHERE user_id = '${C}'`))[0].n, 1);
await as(C, `SELECT transition_application_status($1, 'approved_next_stage')`, [appId]);
ok('resubmit bumps version, resolves corrections, notifies coordinator');

// 8. Anonymous callers
await db.exec('SET ROLE anon');
await assert.rejects(() => db.query(`SELECT submit_application($1)`, [appId]), /permission denied/);
await db.exec('RESET ROLE');
ok('anon cannot call workflow RPCs');

// 9. Direct table workflow, as src/lib/api.ts sends it
const docCount = async (id) => (await as(null, `SELECT count(*)::int AS n FROM application_documents WHERE application_id = $1`, [id]))[0].n;
const addDoc = (id) => as(B, `INSERT INTO application_documents (application_id, storage_path, document_category, original_filename, mime_type, file_size_bytes, uploaded_by)
  VALUES ($1, 'x/spec.pdf', 'complete_specification', 'spec.pdf', 'application/pdf', 10, '${B}')`, [id]);
const [{ id: bobApp }] = await as(B, `INSERT INTO applications (owner_id, title, technical_field, background_problem, description, novelty_features, practical_applications)
  VALUES ('${B}', 'Drone', 'Vision', 'Cracks', 'Payload', 'Thermal', 'Bridges') RETURNING id`);
await as(B, `INSERT INTO inventors (application_id, full_name, email, department) VALUES ($1, 'Bob K', 'bob@muj.manipal.edu', 'CSE')`, [bobApp]);
await addDoc(bobApp);
await as(B, `DELETE FROM application_documents WHERE application_id = $1`, [bobApp]);
assert.equal(await docCount(bobApp), 0, 'owner removes documents from a draft');
await addDoc(bobApp);

await as(B, `UPDATE applications SET status = 'submitted', submitted_at = '2000-01-01', updated_at = now() WHERE id = $1`, [bobApp]);
const [bs] = await as(B, `SELECT * FROM applications WHERE id = $1`, [bobApp]);
assert.equal(bs.status, 'submitted');
assert.ok(new Date(bs.submitted_at).getFullYear() > 2000, 'server sets submission time');
assert.equal((await as(B, `SELECT count(*)::int AS n FROM application_versions WHERE application_id = $1 AND version_number = 1`, [bobApp]))[0].n, 1);
await fails(B, `INSERT INTO notifications (user_id, title, message) VALUES ('${B}', 'x', 'y')`, /row-level security/);
assert.equal((await as(B, `SELECT count(*)::int AS n FROM notifications WHERE user_id = '${B}'`))[0].n, 1);
await as(B, `DELETE FROM application_documents WHERE application_id = $1`, [bobApp]);
assert.equal(await docCount(bobApp), 1, 'documents locked after submission');

await fails(C, `UPDATE applications SET status = 'draft' WHERE id = $1`, /Invalid status transition from submitted to draft/, [bobApp]);
await as(C, `INSERT INTO correction_requests (application_id, reviewer_id, comment) VALUES ($1, '${C}', 'Add drawings')`, [bobApp]);
await as(C, `UPDATE applications SET status = 'corrections_required', updated_at = now() WHERE id = $1`, [bobApp]);
assert.equal((await as(B, `SELECT count(*)::int AS n FROM notifications WHERE user_id = '${B}' AND title LIKE 'Corrections%'`))[0].n, 1);

// Client-computed version is ignored
await as(B, `UPDATE applications SET status = 'resubmitted', current_version = 7 WHERE id = $1`, [bobApp]);
const [br] = await as(B, `SELECT * FROM applications WHERE id = $1`, [bobApp]);
assert.equal(br.status, 'resubmitted');
assert.equal(br.current_version, 2);
assert.equal((await as(B, `SELECT status FROM correction_requests WHERE application_id = $1`, [bobApp]))[0].status, 'addressed');
assert.equal((await as(B, `SELECT count(*)::int AS n FROM application_versions WHERE application_id = $1 AND version_number = 2`, [bobApp]))[0].n, 1);
assert.equal((await as(C, `SELECT count(*)::int AS n FROM notifications WHERE user_id = '${C}'`))[0].n, 2);
ok('direct submit, review and resubmit are validated and produce snapshots and notifications');

// 10. Password accounts: Supabase Auth sign-up + emailed code; the RPC only resets passwords
async function anon(sql, params = []) {
  await db.exec('SET ROLE anon');
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('RESET ROLE');
  }
}
const profileCount = async (id) => (await as(null, `SELECT count(*)::int AS n FROM profiles WHERE id = $1`, [id]))[0].n;
const N = '55555555-5555-5555-5555-555555555555';
// GoTrue inserts an email sign-up unconfirmed; the role in metadata must still be ignored
await as(null, `INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
  VALUES ('${N}', 'New.Student@muj.manipal.edu', '{"full_name":"New Student","department":"ECE","role":"admin"}', '{"provider":"email"}', NULL)`);
assert.equal(await profileCount(N), 0, 'no profile before the emailed code is entered');
await fails(N, `INSERT INTO applications (owner_id, title, technical_field, background_problem, description, novelty_features, practical_applications)
  VALUES ('${N}', 'x', '', '', '', '', '')`, /row-level security|foreign key/);
// verifyOtp sets email_confirmed_at
await as(null, `UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${N}'`);
const [np] = await as(null, `SELECT * FROM profiles WHERE id = '${N}'`);
assert.equal(np.university_email, 'new.student@muj.manipal.edu');
assert.equal(np.role, 'student');
assert.equal(np.department, 'ECE');
await assert.rejects(() => anon(`SELECT register_university_user('someone@muj.manipal.edu', 'secret1', 'Someone')`), /permission denied/);
const hash = async () => (await as(null, `SELECT encrypted_password FROM auth.users WHERE id = '${N}'`))[0].encrypted_password;
const firstHash = await hash();
assert.equal((await as(A, `SELECT register_university_user('new.student@muj.manipal.edu', 'byalice', 'x') AS r`))[0].r.success, false);
assert.equal(await hash(), firstHash, 'a student cannot reset another password');
// If "Confirm email" is ever turned off, GoTrue inserts the sign-up confirmed and the profile exists at once
const Q = '55555555-0000-0000-0000-000000000001';
await as(null, `INSERT INTO auth.users (id, email, raw_app_meta_data, email_confirmed_at) VALUES ('${Q}', 'quick.student@muj.manipal.edu', '{"provider":"email"}', now())`);
assert.equal(await profileCount(Q), 1, 'auto-confirmed sign-up gets a profile immediately');
await as(null, `DELETE FROM auth.users WHERE id = '${Q}'`);
await as(null, `DELETE FROM profiles WHERE id = '${Q}'`);
ok('sign-up needs the emailed code; the old self-registration path is closed');

// 11. Super admin console (TOTP session)
const S = '44444444-4444-4444-4444-444444444444';
await as(null, `INSERT INTO auth.users (id, email) VALUES ('${S}', 'it.admin@muj.manipal.edu')`);
await as(null, `UPDATE profiles SET role = 'super_admin' WHERE id = '${S}'`);
const reset = `SELECT register_university_user('new.student@muj.manipal.edu', 'reset99', 'x') AS r`;
assert.equal((await as(S, reset, [], 'aal1'))[0].r.success, false, 'password-only super admin session cannot reset');
assert.equal((await as(S, reset))[0].r.success, true);
assert.notEqual(await hash(), firstHash, 'super admin resets the password');
await fails(C, `UPDATE profiles SET role = 'admin' WHERE id = '${B}'`, /only a super admin can change account roles/);
await as(S, `UPDATE profiles SET role = 'admin' WHERE id = '${N}'`);
assert.equal((await as(null, `SELECT role FROM profiles WHERE id = '${N}'`))[0].role, 'admin');
assert.equal((await as(S, `SELECT count(*)::int AS n FROM profiles`))[0].n, 6);
assert.equal((await as(S, `SELECT count(*)::int AS n FROM get_pipeline_overview()`))[0].n, 3, 'pipeline overview, not row access');
const [{ get_superadmin_telemetry: t }] = await as(S, `SELECT get_superadmin_telemetry()`);
assert.equal(t.total_users, 6);
assert.equal(t.total_admins, 2);
assert.equal(t.total_applications, 3);
assert.deepEqual(t.applications_by_status, { approved_next_stage: 1, draft: 1, resubmitted: 1 });
assert.deepEqual(t.applications_by_department, { CSE: 2, 'Not specified': 1 });
await fails(A, `SELECT get_superadmin_telemetry()`, /super admin access required/);
await fails(S, `SELECT get_superadmin_telemetry()`, /super admin access required/, [], 'aal1');
await as(null, `INSERT INTO auth.audit_log_entries (payload) VALUES ('{"action":"user_signedup","actor_username":"new.student@muj.manipal.edu"}')`);
assert.equal((await as(S, `SELECT * FROM get_auth_audit_events(10)`))[0].action, 'user_signedup');
await fails(A, `SELECT * FROM get_auth_audit_events(10)`, /super admin access required/);
ok('super admin resets passwords, changes roles, reads telemetry and audit log only with TOTP');

// 12. Coordinator powers need TOTP (aal2)
const [{ id: bApp }] = await as(B, `SELECT id FROM applications WHERE owner_id = '${B}'`);
assert.equal((await as(C, `SELECT is_admin() AS a`, [], 'aal1'))[0].a, false);
await as(C, `UPDATE applications SET status = 'approved_next_stage' WHERE id = $1`, [bApp], 'aal1');
assert.equal((await as(null, `SELECT status FROM applications WHERE id = $1`, [bApp]))[0].status, 'resubmitted', 'aal1 coordinator update is filtered out');
await fails(C, `SELECT transition_application_status($1, 'approved_next_stage')`, /only the patent coordinator/, [bApp], 'aal1');
assert.equal((await as(C, `SELECT count(*)::int AS n FROM applications`, [], 'aal1'))[0].n, 0, 'aal1 coordinator sees no disclosures');
ok('coordinator and super admin access require an aal2 (TOTP) session');

// 13. Existing accounts are left alone: still confirmed, still signed in
assert.notEqual((await as(null, `SELECT email_confirmed_at FROM auth.users WHERE id = $1`, [L]))[0].email_confirmed_at, null);
assert.equal((await as(null, `SELECT count(*)::int AS n FROM auth.sessions WHERE user_id = $1`, [L]))[0].n, 1);
assert.equal(await profileCount(L), 1, 'legacy data is kept');
const draftSql = `INSERT INTO applications (owner_id, title, technical_field, background_problem, description, novelty_features, practical_applications)
  VALUES ('${L}', 'Draft', '', '', '', '', '')`;
for (let i = 0; i < 10; i++) await as(L, draftSql);
await fails(L, draftSql, /Daily limit reached/);
ok('existing accounts keep working; 10 new disclosures per day');

// 14. Kill switch and purge
const signup = (id, email, ageHours = 0) => as(null, `INSERT INTO auth.users (id, email, raw_app_meta_data, email_confirmed_at, created_at)
  VALUES ('${id}', '${email}', '{"provider":"email"}', NULL, now() - interval '${ageHours} hours')`);
await signup('66666666-6666-6666-6666-666666666666', 'ghost@muj.manipal.edu', 25);
await signup('77777777-7777-7777-7777-777777777777', 'fresh@muj.manipal.edu');
assert.equal((await as(null, `SELECT purge_unverified_signups() AS n`))[0].n, 1);
assert.deepEqual((await as(null, `SELECT email FROM auth.users WHERE email IN ('ghost@muj.manipal.edu', 'fresh@muj.manipal.edu')`)).map((r) => r.email), ['fresh@muj.manipal.edu']);
await assert.rejects(() => anon(`SELECT purge_unverified_signups()`), /permission denied/);
await as(null, `UPDATE app_settings SET value = 'false' WHERE key = 'registration_enabled'`);
await assert.rejects(() => signup('88888888-8888-8888-8888-888888888888', 'late@muj.manipal.edu'), /temporarily unavailable/);
await as(null, `INSERT INTO auth.users (id, email) VALUES ('99999999-0000-0000-0000-000000000000', 'ms.user@muj.manipal.edu')`);
assert.equal((await anon(`SELECT value FROM app_settings WHERE key = 'registration_enabled'`))[0].value, false);
await as(null, `UPDATE app_settings SET value = 'true' WHERE key = 'registration_enabled'`);
ok('registration kill switch and 24 h purge of unverified sign-ups');

// 15. Rollback script: safe mode keeps registration closed, lifts TOTP and the draft limit
await db.exec(readFileSync(`${root}/supabase/rollbacks/20261029000200_email_otp_verification_and_mfa.down.sql`, 'utf8'));
assert.equal((await as(C, `SELECT is_admin() AS a`, [], 'aal1'))[0].a, true);
await assert.rejects(() => signup('88888888-8888-8888-8888-888888888888', 'late@muj.manipal.edu'), /temporarily unavailable/);
await as(L, draftSql);
ok('rollback keeps registration closed and lifts TOTP and draft limits');

// 16. Repair script for sign-ups stuck unconfirmed while "Confirm email" was on
const U = '55555555-0000-0000-0000-000000000002';
await as(null, `UPDATE app_settings SET value = 'true' WHERE key = 'registration_enabled'`);
await as(null, `INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
  VALUES ('${U}', 'stuck.student@muj.manipal.edu', '{"full_name":"Stuck Student"}', '{"provider":"email"}', NULL)`);
assert.equal(await profileCount(U), 0);
await db.exec(readFileSync(`${root}/supabase/fixes/unconfirmed_signups.sql`, 'utf8'));
assert.equal(await profileCount(U), 1, 'repair confirms the account and creates its profile');
assert.equal((await as(null, `SELECT full_name FROM profiles WHERE id = '${U}'`))[0].full_name, 'Stuck Student');
ok('repair script activates stuck sign-ups');

// 17. Students need an authenticator session (aal2) for every patent record
const [{ id: aApp }] = await as(A, `SELECT id FROM applications WHERE owner_id = '${A}' LIMIT 1`);
assert.equal((await as(A, `SELECT count(*)::int AS n FROM applications`, [], 'aal1'))[0].n, 0, 'aal1 student sees no disclosures');
assert.equal((await as(A, `SELECT count(*)::int AS n FROM profiles WHERE id = '${A}'`, [], 'aal1'))[0].n, 1, 'profile stays readable for the TOTP step');
await fails(A, `INSERT INTO applications (owner_id, title, technical_field, background_problem, description, novelty_features, practical_applications)
  VALUES ('${A}', 'x', '', '', '', '', '')`, /row-level security|authenticator/, [], 'aal1');
await fails(A, `SELECT save_application_draft($1::jsonb, '[]'::jsonb)`, /authenticator app/, [JSON.stringify({ title: 'New at aal1' })], 'aal1');
assert.equal((await as(A, `UPDATE inventors SET full_name = 'x' WHERE application_id = $1 RETURNING id`, [aApp], 'aal1')).length, 0, 'aal1 update matches no rows');
assert.ok((await as(A, `SELECT count(*)::int AS n FROM applications`))[0].n >= 1, 'aal2 student sees own disclosures');
await as(null, `INSERT INTO inventors (application_id, full_name, email, department) VALUES ($1, 'Editor Check', 'e@muj.manipal.edu', 'CSE')`, [aApp]);
ok('students need an authenticator (aal2) session for patent records; SQL editor still works');
// 18. Supabase Auth inserts sign-ups with search_path = auth; the triggers must still resolve
await db.exec(`SET search_path = auth; INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES ('55555555-0000-0000-0000-000000000003', 'auth.path@muj.manipal.edu', '{"provider":"email"}'); SET search_path = "$user", public;`);
assert.equal((await as(null, `SELECT count(*)::int AS n FROM auth.users WHERE email = 'auth.path@muj.manipal.edu'`))[0].n, 1);
ok('sign-up triggers work under the auth search_path');

// 19. Super admin console: directory, account actions, registration switch, pipeline, audit log
// Section 15 ran the rollback; restore the current schema first (both files are re-runnable)
for (const f of ['20261029000200_email_otp_verification_and_mfa', '20261031000200_super_admin_console']) {
  await db.exec(readFileSync(`${root}/supabase/migrations/${f}.sql`, 'utf8'));
}
await as(null, `INSERT INTO auth.users (id, email, raw_app_meta_data, email_confirmed_at) VALUES ('55555555-0000-0000-0000-000000000004', 'pending.code@muj.manipal.edu', '{"provider":"email"}', NULL)`);
const dir = await as(S, `SELECT * FROM get_user_directory()`);
assert.ok(dir.some((r) => r.email === 'pending.code@muj.manipal.edu' && r.full_name === null && r.email_confirmed_at === null), 'unverified sign-ups are listed');
await fails(A, `SELECT * FROM get_user_directory()`, /super admin access required/);
await fails(S, `SELECT * FROM get_user_directory()`, /super admin access required/, [], 'aal1');

await as(null, `INSERT INTO auth.mfa_factors (user_id) VALUES ($1)`, [B]);
await as(null, `INSERT INTO auth.sessions (user_id) VALUES ($1), ($1)`, [B]);
assert.equal((await as(S, `SELECT has_authenticator FROM get_user_directory() WHERE id = $1`, [B]))[0].has_authenticator, true);
await as(S, `SELECT admin_reset_authenticator($1)`, [B]);
assert.equal((await as(null, `SELECT count(*)::int AS n FROM auth.mfa_factors WHERE user_id = $1`, [B]))[0].n, 0);
assert.equal((await as(null, `SELECT count(*)::int AS n FROM auth.sessions WHERE user_id = $1`, [B]))[0].n, 0);
await fails(S, `SELECT admin_reset_authenticator($1)`, /another super admin/, [S]);
await fails(C, `SELECT admin_reset_authenticator($1)`, /super admin access required/, [B]);

await as(null, `INSERT INTO auth.sessions (user_id) VALUES ($1)`, [B]);
await as(S, `SELECT admin_sign_out_user($1)`, [B]);
assert.equal((await as(null, `SELECT count(*)::int AS n FROM auth.sessions WHERE user_id = $1`, [B]))[0].n, 0);

await as(S, `SELECT admin_set_suspended($1, true, 'Shared password')`, [B]);
assert.equal((await as(S, `SELECT suspended FROM get_user_directory() WHERE id = $1`, [B]))[0].suspended, true);
await as(S, `SELECT admin_set_suspended($1, false)`, [B]);
assert.equal((await as(null, `SELECT banned_until FROM auth.users WHERE id = $1`, [B]))[0].banned_until, null);
await fails(S, `SELECT admin_set_suspended($1, true)`, /own account/, [S]);

await as(S, `SELECT set_registration_enabled(false)`);
assert.equal((await anon(`SELECT value FROM app_settings WHERE key = 'registration_enabled'`))[0].value, false);
await as(S, `SELECT set_registration_enabled(true)`);
await fails(A, `SELECT set_registration_enabled(false)`, /super admin access required/);

const pipeline = await as(S, `SELECT * FROM get_pipeline_overview()`);
assert.ok(pipeline.length >= 1);
assert.ok(!('description' in pipeline[0]) && !('novelty_features' in pipeline[0]), 'no disclosure content');
assert.equal((await as(S, `SELECT count(*)::int AS n FROM applications`))[0].n, 0, 'super admin has no direct row access to disclosures');

const actions = (await as(S, `SELECT action, target_email, details FROM admin_audit_log ORDER BY id`)).map((r) => r.action);
for (const a of ['role_changed', 'password_reset', 'authenticator_reset', 'signed_out_everywhere', 'account_suspended', 'account_reactivated', 'registration_closed', 'registration_opened']) {
  assert.ok(actions.includes(a), `audit log records ${a}`);
}
assert.equal((await as(S, `SELECT details->>'reason' AS r FROM admin_audit_log WHERE action = 'account_suspended'`))[0].r, 'Shared password');
assert.equal((await as(A, `SELECT count(*)::int AS n FROM admin_audit_log`))[0].n, 0, 'students cannot read the audit log');
await fails(S, `INSERT INTO admin_audit_log (action) VALUES ('forged')`, /permission denied|row-level security/);
ok('super admin console: directory, account actions, registration switch, pipeline without content, audit log');

// 20. Authenticator step removed: a password-only (aal1) session has full access for every role
await db.exec(readFileSync(`${root}/supabase/migrations/20261101000100_remove_sign_in_authenticator.sql`, 'utf8'));
await db.exec(readFileSync(`${root}/supabase/migrations/20261101000200_authenticator_trigger_search_path.sql`, 'utf8'));
assert.ok((await as(S, `SELECT * FROM get_user_directory()`, [], 'aal1')).length > 0, 'aal1 super admin reads the directory');
assert.equal((await as(C, `SELECT is_admin() AS a`, [], 'aal1'))[0].a, true, 'aal1 coordinator is admin');
assert.ok((await as(C, `SELECT count(*)::int AS n FROM applications`, [], 'aal1'))[0].n > 0, 'aal1 coordinator sees disclosures');
assert.ok((await as(A, `SELECT count(*)::int AS n FROM applications WHERE owner_id = $1`, [A], 'aal1'))[0].n > 0, 'aal1 student sees own records');
assert.equal((await as(B, `SELECT count(*)::int AS n FROM applications WHERE owner_id = $1`, [A], 'aal1'))[0].n, 0, 'other students still cannot');
ok('sign-in authenticator removed: password sessions work, ownership rules unchanged');
console.log('all SQL checks passed');
