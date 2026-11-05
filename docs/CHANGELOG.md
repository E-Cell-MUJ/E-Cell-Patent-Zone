# Changelog & Version History

All notable changes to the **Manipal University Jaipur Patent Application & Disclosure Portal** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] — 2026-11-06 (Current Production Release)

### Added
- **GitHub Governance & Templates**:
  - Added comprehensive [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) with ASVS L2 & Section 39 compliance verification checklists.
  - Added [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md) with sanitized reporting guidelines.
  - Added [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md) tracking student and coordinator workflows.
  - Added [Confidential Security Disclosure Template](.github/ISSUE_TEMPLATE/security_vulnerability.md) and [Config](.github/ISSUE_TEMPLATE/config.yml).
  - Added [`CODEOWNERS`](.github/CODEOWNERS) defining structural ownership.
- **Autonomous Agent & Operational Directives**:
  - Authored [`AGENTS.md`](AGENTS.md) establishing prime directives, RLS invariants, attribution rules, and verification loops.
  - Authored [`RULES.md`](RULES.md) outlining repository engineering rules, coding standards, and branch policies.
  - Authored [`docs/deployment/production-runbook.md`](docs/deployment/production-runbook.md) covering Vercel, Supabase, Brevo SMTP, and incident runbooks.
- **Super Admin PostgREST RPC Compatibility Aliases**:
  - Created migration `20261105000000_super_admin_rpc_aliases.sql` providing:
    - `get_registration_switch()` alias for `registration_enabled()`
    - `super_admin_toggle_registration(boolean)` alias for `set_registration_enabled(boolean)`
    - `get_admin_audit_log(integer)` for secure audit trail access
    - `get_auth_events(integer)` alias for `get_auth_audit_events`
    - `get_system_telemetry()` alias for `get_superadmin_telemetry`

### Changed
- **Pure Live Supabase Production Engine**:
  - Completely purged all simulated mock disclosures (`app-seed-001` through `004`), in-memory fake users, and localStorage offline fallback modes from runtime code.
  - All workspace queries now strictly interface with live Supabase PostgreSQL tables and storage buckets.
- **Email Verification & SMTP Architecture**:
  - Configured Brevo SMTP relay (`smtp-relay.brevo.com:587`) for instantaneous delivery of 6-digit confirmation OTP codes and verification links.
  - Updated Auth email templates to support both 6-digit code entry and one-click email confirmation buttons.
- **Database Sanitization & Sequence Reset**:
  - Reset application reference number sequence (`patent_ref_seq`) to `1` so subsequent applications start at `MUJ-PAT-2026-0001`.
  - Truncated test applications, versions, documents, comments, and audit entries for clean production launch.
- **Role-Based Routing Isolation**:
  - Hardened `LoginPage.tsx` and `ProtectedRoute.tsx` to prevent student accounts from being redirected to staff/admin routes from stale session history.

### Fixed
- Fixed PostgREST schema cache rejection error (`Could not find the function public.get_registration_switch without parameters in the schema cache`).
- Fixed coordinator and superadmin credential synchronization for live production accounts.

---

## [1.1.0] — 2026-10-31

### Added
- **Administrative Governance Console**:
  - Real-time directory supervision with account security actions: reset authenticator, suspend/reactivate, sign out everywhere.
  - Confidential pipeline oversight showing lifecycle stages, waiting times, and departmental distributions without exposing invention claims.
  - Append-only admin audit log (`admin_audit_log`) tracking all governance operations.
- **Two-Factor Authentication (TOTP)**:
  - Enforced RFC 6238 TOTP enrollment and challenge for Coordinator (`admin`) and Super Admin (`super_admin`) accounts (`aal2` session requirement).
  - Added `MfaGate` UI for seamless authenticator scanning and challenge verification.
- **Tamper-Proof Workflow Invariants**:
  - Enforced atomic application submission and status transitions via `SECURITY DEFINER` PL/pgSQL functions.
  - Added immutable application snapshot generation on submission and revision events.

---

## [1.0.0] — 2026-10-21

### Added
- **Initial Invention Disclosure Portal**:
  - Student workspace for drafting invention disclosures with multi-inventor support, prior-art searches, and file attachments.
  - Patent Coordinator docket for screening disclosures, requesting technical corrections, and granting initial clearance.
  - PostgreSQL 15 schema with Row-Level Security, audit status history, and auto-generated sequential reference numbers.
  - Institutional Manipal University Jaipur design system with responsive layouts.
