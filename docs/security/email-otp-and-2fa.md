# Email OTP verification and coordinator 2FA

Status: Implemented and active in production on Supabase (cwjnujgzsuphfkbybvoz) and Vercel. Fully verified.

> **Update 2026-10-31: email code at sign-up kept; every role uses TOTP; self-service resets added.** Students now pass TOTP like coordinators (migration `20261031000000_student_authenticator.sql`). Forgot password uses Supabase's recovery code (`verifyOtp` type `recovery`), plus TOTP when enrolled. A student who lost the authenticator proves the password session and a fresh emailed sign-in code; Edge Function `reset-authenticator` then deletes the TOTP factors. Dashboard setup: README section 6.

## 1. Decision

**Option A: Supabase Auth's built-in email OTP and TOTP MFA.** No custom OTP code, storage or crypto.

- Supabase Auth (GoTrue) already does the following for each 6-digit code:
  - generates it with a CSPRNG
  - stores only a hash
  - makes it single-use, so a resend invalidates the previous code
  - expires it (`otp_expiry = 600`)
  - paces resends (`max_frequency = 60s`) and applies rate limits and CAPTCHA
- The database only has to decide what an unverified account may do. The answer is nothing: it gets no profile, and it cannot file applications.
- Option B (a custom Edge Function) would only be needed for per-code attempt counters; see section 5.

## 2. Flows

```mermaid
sequenceDiagram
  participant S as Student browser
  participant A as Supabase Auth
  participant DB as Postgres
  S->>A: signUp(email, password, metadata, captcha)
  A->>DB: INSERT auth.users (email_confirmed_at = NULL)
  DB-->>A: domain + kill-switch trigger OK; no profile yet
  A-->>S: (same response if the address already exists)
  A->>S: email with 6-digit code (10 min, single use)
  S->>A: verifyOtp(email, code, type 'email', captcha)
  A->>DB: UPDATE auth.users SET email_confirmed_at = now()
  DB-->>DB: on_auth_user_confirmed -> profiles row (role 'student')
  A-->>S: session -> dashboard
```

```mermaid
sequenceDiagram
  participant L as Legacy user (created by register_university_user)
  participant A as Supabase Auth
  Note over L: Migration set email_confirmed_at = NULL and ended their sessions
  L->>A: signInWithPassword
  A-->>L: error email_not_confirmed -> UI shows code step
  L->>A: resend(type 'signup') -> verifyOtp
  A-->>L: confirmed; existing profile and applications kept
```

```mermaid
sequenceDiagram
  participant C as Coordinator / super admin
  participant A as Supabase Auth
  participant DB as Postgres
  C->>A: signInWithPassword -> aal1 session
  Note over C: ProtectedRoute shows MfaGate; is_admin() is false at aal1
  alt first time
    C->>A: mfa.enroll(totp) -> QR + secret
  end
  C->>A: mfa.challengeAndVerify(code) -> aal2 session
  C->>DB: admin reads/writes now pass is_admin() / is_super_admin()
```

## 3. Where each rule is enforced

| Rule | Enforced by |
|---|---|
| Only `@muj.manipal.edu` | `enforce_university_email_domain` trigger (server), plus the UI regex |
| Code required before an account works | `enable_confirmations = true`; no profile until `email_confirmed_at` is set |
| Unverified users cannot file | RLS INSERT on `applications` requires `is_mailbox_verified()` |
| Max 10 new disclosures per user per day | `trigger_limit_daily_drafts` |
| Role never from the client | `handle_new_user()` always writes `student`; only `is_super_admin()` changes roles |
| Admin powers need TOTP | `is_admin()` / `is_super_admin()` require JWT `aal = 'aal2'` |
| Registration can be closed instantly | `app_settings.registration_enabled` (checked in the trigger) |
| Abandoned sign-ups removed | `purge_unverified_signups()` hourly via pg_cron (24 h) |
| No silent demo fallback in production | `AuthContext` never falls back when Supabase is configured; `VITE_ENABLE_MOCK_FALLBACK` removed |

## 4. Threat model (STRIDE)

| Threat | Example | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Registering a classmate's address | Code goes to that mailbox; no profile or filing without it | Someone who controls the mailbox |
| Spoofing | Brute-forcing a 6-digit code | 10-min expiry, single use, CAPTCHA on verify, per-IP `token_verifications` | No per-code attempt cap (see 5.3) |
| Spoofing | Coordinator password stolen | TOTP required for every admin read/write | Lost or stolen phone: see runbook |
| Tampering | Setting `role` in sign-up metadata | Ignored by `handle_new_user()` | — |
| Tampering | Client sends `aal2` | JWT is signed by Supabase; `aal` is read from the verified token | — |
| Repudiation | "I never approved that" | `application_status_history` plus GoTrue `auth.audit_log_entries` (MFA, logins) | Audit entries hold raw emails (see 5.4) |
| Information disclosure | Probing which emails are registered | `signUp` and `resend` responses look identical; the UI uses the same wording | Sign-in with a correct password still says "not verified" |
| Denial of service | Email-bombing an address | CAPTCHA, 60 s per-address pacing, global `email_sent` ceiling | Campus NAT shares IP limits |
| Denial of service | OTP delivery outage | Kill switch closes registration; verified users unaffected | New students wait |
| Elevation of privilege | Password-only admin session | `is_admin()` false at aal1, so RLS hides all disclosures | — |

## 5. Deviations from the prompt (with reasons)

1. **Flag name `registration_enabled`**, not `registration_otp_required`. "Off" must mean "registration closed", never "registration without a code".
2. **Rate limits.** GoTrue offers per-address pacing (`max_frequency = 60s`), a project-wide `email_sent` ceiling (60/h) and per-IP limits per 5 minutes. "5 per email per hour" and "20 per IP per hour" cannot be expressed exactly. The per-IP limits stay at their defaults because students share campus NAT addresses; CAPTCHA is the main abuse control.
3. **No per-code attempt counter or 15-minute email lockout.** GoTrue does not expose them. The protections are the 10-minute expiry, the per-IP verification limit and CAPTCHA on `verifyOtp`. **Decision needed:** if the university requires a hard 5-attempt cap, build Option B (custom Edge Function) for registration codes.
4. **Audit log** is GoTrue's `auth.audit_log_entries`, which stores raw emails rather than an HMAC, read through `get_auth_audit_events()` (super admin + TOTP). Make sure audit logging to the database is enabled in the project's Auth settings.
5. **Email has an HTML body only**: GoTrue templates have no plain-text part.
6. **Stricter than asked:** admin *reads* need aal2 too, not just writes, because disclosures are confidential.
7. **`register_university_user` only resets passwords now** (super admin with TOTP). It can no longer create accounts, so self-registration has exactly one path.
8. **Not built here:** Playwright E2E, the axe scan, and the timing-enumeration and header-spoofing security tests. They need a running Supabase stack; this machine has no Docker.

## 6. Deployment order (do not reorder)

The migration ends every email-password session and makes those accounts verify by code, including coordinators and super admins. Email delivery must work **before** it runs.

1. In the hosted dashboard (or `supabase config push`), apply what `supabase/config.toml` now says:
   - Auth → Providers → Email: "Confirm email" ON; OTP length 6; OTP expiry 600 s.
   - Auth → Rate limits: email sends 60/h; resend interval 60 s.
   - Auth → Email templates → Confirm signup: subject and body from `supabase/templates/confirmation.html` (shows `{{ .Token }}`).
   - Email delivery, either:
     - from a university Outlook / Microsoft 365 mailbox via the Send Email hook (section 10), or
     - Auth → SMTP with a provider (SES, Postmark), with SPF, DKIM and DMARC aligned for the sending domain.

     The built-in SMTP is for testing only.
   - Auth → Bot and abuse protection: Turnstile ON with its secret. Set `VITE_TURNSTILE_SITE_KEY` in the frontend build.
   - Auth → MFA: TOTP enroll and verify ON.
   - Database → Extensions: enable `pg_cron`.
2. Send yourself a test sign-up on staging and confirm the code arrives within 30 s.
3. Apply `20261029000200_email_otp_verification_and_mfa.sql`, then deploy the frontend.
4. Tell coordinators and super admins: at next sign-in they enter an emailed code, then set up an authenticator app.

## 7. Runbook

- **Close registration now:** `UPDATE app_settings SET value = 'false' WHERE key = 'registration_enabled';` Reopen with `'true'`.
- **Full rollback (safe mode):** run `supabase/rollbacks/20261029000200_email_otp_verification_and_mfa.down.sql`. It closes registration, lifts the TOTP requirement and the draft limit, and keeps the code requirement for existing unverified accounts.
- **Coordinator lost their authenticator:** the project owner removes the factor in Dashboard → Authentication → Users → (user) → MFA factors, and records who and why. The coordinator enrolls again at next sign-in.
- **Student never got a code:** check the SMTP logs and bounces. Ask them to use "Send a new code" after 60 s. The code is valid for 10 minutes.
- **Abuse spike:** query `get_auth_audit_events(1000)` (as a super admin with TOTP) for repeated `user_confirmation_requested` from one IP. Tighten the Auth rate limits, or close registration with the kill switch.
- **Secret rotation:** rotate the SMTP credentials and the Turnstile secret in the dashboard. Changing them does not invalidate sessions.
- **Never** turn "Confirm email" off. The database cannot tell an auto-confirmation from a verified code.

## 8. Open questions for university IT and legal

1. Sending domain for the code emails, and approval to use the university relay.
2. Is a hard 5-attempt cap per code mandatory? If yes, build Option B (see 5.3).
3. Hosting region (the CERT-In 180-day log retention within India) and the audit log retention period.
4. The DPDP Act notice text shown at registration, and the retention period for unverified and deleted accounts.
5. Who may remove a coordinator's MFA factor, and where that action is recorded.

## 9. Verification run

- `npm run test:db`: 15 SQL check groups pass, covering:
  - sign-up needs the code
  - legacy accounts re-verify and their sessions end
  - unverified users cannot file
  - the 10-per-day draft limit
  - admin and super admin need aal2
  - the kill switch and 24 h purge
  - the rollback script
- Frontend: `tsc -b` and `vite build` pass. Vitest: 51 pass, including:
  - OTP helpers
  - the code-step UI (autocomplete `one-time-code`, masked email, 60 s resend, generic errors, back without losing input)
  - the TOTP enrollment gate
- `src/test/e2e.live.test.ts` covers the full flow against a real project (sign-up, confirm, TOTP, review, resubmit). It has not been run yet: it needs a throwaway project with CAPTCHA off.

## 10. Sending codes from a university Outlook (Microsoft 365) mailbox

Codes arrive from an official address such as `patent-portal@muj.manipal.edu`. Supabase Auth hands each email to the Edge Function `supabase/functions/send-auth-email`, which sends it through Microsoft Graph with OAuth.

Why not Supabase's SMTP settings with an Outlook password? They only support password sign-in, and Exchange Online turns password (Basic) SMTP AUTH off by default from the end of December 2026 (Microsoft message MC786329). It would also need SMTP AUTH enabled on the mailbox, which tenants with Security Defaults block.

**Who does what:** steps 1 and 2 need an MUJ Microsoft 365 administrator (university IT). Steps 3 to 5 are done in your Supabase project.

1. **Mailbox (IT).** Create a shared mailbox, for example `patent-portal@muj.manipal.edu`. A shared mailbox needs no licence.
2. **App identity limited to that one mailbox (IT).**
   - Entra admin centre → App registrations → New registration, single tenant, for example "MUJ Patent Portal mailer".
   - Note the **Application (client) ID** and the **Directory (tenant) ID**.
   - Certificates & secrets → New client secret. Copy the secret **Value** and note its expiry date.
   - **Do not** add the Microsoft Graph `Mail.Send` application permission in Entra. That would let the app send as *any* mailbox. Instead, grant it for this one mailbox in Exchange Online PowerShell:
     ```powershell
     Connect-ExchangeOnline
     # ObjectId = the app's Enterprise application object ID (not the app registration's)
     New-ServicePrincipal -AppId <client-id> -ObjectId <enterprise-app-object-id> -DisplayName "MUJ Patent Portal mailer"
     New-ManagementScope -Name "PatentPortalMailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'patent-portal@muj.manipal.edu'"
     New-ManagementRoleAssignment -App <client-id> -Role "Application Mail.Send" -CustomResourceScope "PatentPortalMailbox"
     # Should report InScope = True for this mailbox, and False for any other
     Test-ServicePrincipalAuthorization -Identity <client-id> -Resource patent-portal@muj.manipal.edu
     ```
3. **Create the hook (Supabase dashboard).** Authentication → Hooks → Add hook → **Send Email** → HTTPS.
   - URL: `https://<project-ref>.supabase.co/functions/v1/send-auth-email`
   - Generate the secret (`v1,whsec_...`) and copy it. Leave the hook **disabled** for now.
4. **Deploy the function and its secrets.** Type the secrets into your own terminal; never commit them or paste them into chat.
   ```bash
   npx supabase functions deploy send-auth-email --no-verify-jwt --project-ref <project-ref>
   npx supabase secrets set --project-ref <project-ref> MS_TENANT_ID=<tenant-id> MS_CLIENT_ID=<client-id> MS_CLIENT_SECRET=<secret-value> MS_SENDER_MAILBOX=patent-portal@muj.manipal.edu SEND_EMAIL_HOOK_SECRET='v1,whsec_<...>'
   ```
5. **Enable the hook and test.**
   - Enable the Send Email hook.
   - Register on the portal with a real `@muj.manipal.edu` address. The code should arrive from the shared mailbox within seconds.
   - If it doesn't, check Supabase → Edge Functions → `send-auth-email` → Logs:
     - `Microsoft sign-in failed`: wrong tenant ID, client ID or secret.
     - Graph `403`: the Exchange role assignment in step 2 is missing, or targets another mailbox.
     - `401 Invalid hook signature`: `SEND_EMAIL_HOOK_SECRET` doesn't match the hook's secret.

Notes:
- With the hook enabled, Supabase sends **every** Auth email through it. The function only sends 6-digit code emails (sign-up, email OTP, reauthentication) to `@muj.manipal.edu` addresses, and refuses link emails such as password recovery and email change. The portal doesn't use those; password resets go through the super admin.
- Exchange Online limits one mailbox to 10,000 recipients a day, which is plenty for registrations.
- The client secret expires (at most 24 months). Put its expiry in the IT calendar. Rotate it with a new secret, then `supabase secrets set MS_CLIENT_SECRET=...`.
- `npm run test:db` checks the email builder (code types only, digits only, same content as `supabase/templates/confirmation.html`). The Graph call itself can only be tested against the real tenant.
