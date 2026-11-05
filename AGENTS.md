# AGENTS.md — Autonomous Agent Directives & Architecture Guide

**System:** Manipal University Jaipur — Patent Application & Disclosure Portal  
**Maintainer / Lead Architect:** SynthReaper (`codewithaditya8002@gmail.com`)  
**Institutional Scope:** Directorate of Research & IPR Cell • E-CELL MUJ  
**Statutory Compliance:** Indian Patents Act 1970 (Section 39) • OWASP ASVS L2 • DPDP 2025

---

## 1. Prime Directives for Autonomous AI Agents

Whenever you inspect, refactor, debug, or extend this codebase, you MUST adhere to these non-negotiable operational invariants:

### A. Strict First-to-File Confidentiality (Section 39 Compliance)

- Under Indian Patent Law, India operates on an **absolute novelty principle** with no grace period.
- **Zero Public Disclosure**: Unauthenticated visitors must NEVER be able to browse, query, or enumerate invention titles, technical claims, applicant identities, or drawing assets.
- **Student Multi-Tenant Isolation**: Row-Level Security (RLS) must guarantee that Student A can NEVER query, read, or modify disclosures belonging to Student B.
- **Super Admin Confidentiality Shield**: Super Admins (IT Governance) oversee accounts, audit logs, and workflow status metadata, but are **strictly barred at the database RLS level** from reading invention descriptions, claims, or technical drawings.
- **Data Minimization in Emails**: Outgoing transactional emails (OTP codes, status updates) must NEVER include disclosure claim text or invention summaries.

### B. Pure Live Production Runtime (Zero Mock/Demo Fallbacks)

- **STRICT PROHIBITION**: Never reintroduce offline mock data, simulated localStorage seed disclosures (`app-seed-...`), mock logins (`signInDemo`), or bypass flags in non-test runtime code.
- All application state must strictly query live Supabase PostgreSQL tables, storage buckets, and secure RPCs (`get_user_directory`, `get_pipeline_overview`, `get_registration_switch`, `set_registration_enabled`, `get_admin_audit_log`, `get_auth_events`, `get_system_telemetry`).
- If Supabase or the network is unavailable, throw descriptive institutional error states rather than falling back to fake data.

### C. Co-Author & Attribution Requirement

- Every commit made by an agent or human contributor MUST include the following co-author trailer in the commit message:

  ```text
  Co-Authored-By: SynthReaper <codewithaditya8002@gmail.com>
  ```

- All newly authored core modules, services, and architecture manifests must maintain the author signature attribution:

  ```text
  /* Author: SynthReaper <codewithaditya8002@gmail.com> */
  ```

---

## 2. Technical Stack & Architectural Layout

```
├── .github/                     # GitHub workflows, templates (PR, bug report, security)
│   ├── ISSUE_TEMPLATE/          # Bug reports, feature requests, confidential disclosures
│   ├── PULL_REQUEST_TEMPLATE.md # Quality & compliance PR checklist
│   └── workflows/ci.yml         # Automated GitHub Actions test pipeline
├── docs/                        # Complete institutional documentation
│   ├── architecture/            # System designs, schemas, data-flow diagrams
│   ├── deployment/              # Vercel, Supabase, and Brevo SMTP runbooks
│   ├── security/                # Email OTP, 2FA, and Threat Model
│   ├── specs/                   # Institutional RFCs and permission matrix
│   └── CHANGELOG.md             # Version history and release logs
├── supabase/
│   ├── functions/               # Deno Edge Functions (send-auth-email, reset-authenticator)
│   ├── migrations/              # Ordered, immutable PostgreSQL migrations
│   ├── templates/               # Auth email HTML templates (confirmation, recovery)
│   └── tests/                   # Direct PostgreSQL RLS security assertions
├── src/
│   ├── assets/                  # Institutional logos (MUJ Crest, E-CELL emblem)
│   ├── components/              # Shared UI components (MfaGate, ProtectedRoute, Turnstile)
│   ├── config/                  # Centralized typed environment & constants (env.ts, constants.ts)
│   ├── features/
│   │   ├── applications/        # Patent disclosure state machine & workflow
│   │   └── auth/                # Supabase AuthContext, OTP routines, TOTP enrollment
│   ├── lib/                     # PostgREST API client, Supabase singleton, storage helpers
│   ├── pages/                   # Workspaces (Student, Coordinator Docket, Super Admin Console)
│   └── styles/                  # Clean bespoke institutional typography & layout styles
├── AGENTS.md                    # This autonomous agent specification
├── CONTRIBUTING.md              # Contributor workflow and PR guidelines
├── RULES.md                     # Engineering invariants and security rules
└── SECURITY.md                  # ASVS L2 security policy and vulnerability runbook
```

---

## 3. Database & PostgreSQL RLS Invariants

When writing or modifying PostgreSQL migrations:

1. **Explicit Security Definer Context**:
   Every `SECURITY DEFINER` function MUST set `SET search_path = public` and use explicit, schema-qualified table names (`public.applications`, `auth.users`).
2. **Scalar Auth UID Binding**:
   Always wrap `auth.uid()` as `(SELECT auth.uid())` in RLS policies to allow the PostgreSQL query optimizer to cache the user ID for execution plans.
3. **No Blind Full Table Grants**:
   Never use `FOR ALL` RLS policies on tables with lifecycle status columns (`applications`, `public.profiles`). Use distinct policies for `SELECT`, `INSERT`, and `UPDATE`.
4. **Append-Only Immutability**:
   Tables recording audit trails (`admin_audit_log`, `application_status_history`, `application_versions`) must strictly revoke `UPDATE`, `DELETE`, and `TRUNCATE` permissions from authenticated and anonymous roles.

---

## 4. Frontend & Design Invariants (Zero AI Slop)

1. **Intentional Institutional Aesthetics**:
   - Palette: Clean academic parchment (`#FAF7EE` / `#FFFFFF`), deep navy ink (`#152E5A`), institutional royal blue (`#204E96`), and muted warm stone borders (`#EBE5D5`).
   - Typography: Crisp grotesque (Plus Jakarta Sans / Inter) paired with monospaced telemetry (JetBrains Mono).
   - **STRICT BAN**: Prohibit generic purple glowing neon card borders, floaty glowing mesh gradients, and cliché marketing buzzwords ("revolutionary", "delve", "tapestry").
2. **Deterministic Role Navigation**:
   - Students belong on `/dashboard` and `/draft`.
   - Coordinators belong on `/admin/dashboard`.
   - Super Admins belong on `/superadmin/dashboard`.
   - Never allow stale session history to redirect students to staff consoles.

---

## 5. Mandatory Pre-Completion Verification Loop

Before declaring any coding or configuration task complete, agents MUST run and pass:

```bash
# 1. Vitest Test Suite (All 82 tests must pass)
npm test -- --run

# 2. Database RLS and Migration Integrity Suite (All 20 SQL checks must pass)
npm run test:db

# 3. Production Vite Build (Must compile with zero TypeScript errors)
npm run build
```
