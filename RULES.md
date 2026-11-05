# Repository Rules & Engineering Standards

**Project:** Manipal University Jaipur — Patent Application & Disclosure Portal  
**Maintainer / Lead Architect:** SynthReaper (`codewithaditya8002@gmail.com`)  
**Target Environment:** Production (`patents.muj.manipal.edu` / Vercel Edge)

---

## 1. Core Engineering Invariants

### Rule 1.1: Live Production Backend Exclusivity
- Offline mock data, simulated localStorage seed applications, and synthetic mock users are strictly prohibited in runtime code.
- Every read and write must communicate directly with the live Supabase PostgreSQL backend via typed PostgREST RPCs or client queries.
- Fail fast with explicit user-friendly error banners if network or database connectivity is disrupted.

### Rule 1.2: Commit Attribution & Co-Authorship
- Every commit to this repository MUST include the following co-author trailer in the commit message:
  ```text
  Co-Authored-By: SynthReaper <codewithaditya8002@gmail.com>
  ```
- Core architecture modules must retain author metadata in header docstrings.

### Rule 1.3: Data Isolation & Statutory Compliance
- In accordance with Section 39 of the Indian Patents Act 1970, unfiled invention disclosures must be treated as top-secret institutional IP.
- No invention claims, abstracts, or technical drawings may be made publicly accessible.
- Multi-tenant student isolation is strictly enforced via PostgreSQL Row-Level Security (RLS). Students cannot query or inspect applications created by other students.
- Super Admins (IT Governance) supervise accounts and pipeline metrics but are denied direct access to disclosure claims or technical drawing files.

### Rule 1.4: Strict Branching Model
- **`main`**: Production releases only.
- **`develop`**: Active development, CI/CD previews, and bugfixes.
- All modifications and agent tasks must be integrated and verified on `develop` before production release.

---

## 2. Authentication & Security Rules

1. **Email Domain Gating**:
   - Accounts must end with `@muj.manipal.edu`.
   - Gated at frontend form entry and enforced at database insertion via the `enforce_university_email_domain` trigger.
2. **Two-Tier Email Verification**:
   - New student registrations require a 6-digit OTP code (`{{ .Token }}`) or verification link dispatched via Brevo SMTP relay.
   - Self-registration switch (`registration_enabled`) can be frozen instantly by Super Admins via `set_registration_enabled(false)`.
3. **MFA for Administrative Roles**:
   - Coordinator (`admin`) and IT Governance (`super_admin`) accounts must enroll in RFC 6238 TOTP.
   - Administrative PostgREST RPCs require an `aal2` authenticated JWT session.
4. **Cloudflare Turnstile Bot Protection**:
   - Registration and login are shielded by Turnstile CAPTCHA tokens, validated server-side.

---

## 3. Code Standards & Anti-Slop Directive

1. **Software Simplicity (Karpathy Principles)**:
   - Zero unnecessary abstractions or speculative service layers. Flat, readable TypeScript modules with explicit state flow.
2. **Design Standards**:
   - Authentic institutional styling: Deep navy ink (`#152E5A`), academic parchment (`#FAF7EE`), royal blue accents (`#204E96`).
   - Clean typographic pairing: Plus Jakarta Sans / Inter + JetBrains Mono telemetry.
   - Prohibit unstyled generic elements, glowing purple neon mesh halos, and cliché marketing filler copy.

---

## 4. Verification Gate

No code may be committed or merged without passing all 3 local verification gates:
```bash
npm test -- --run   # 82 Vitest tests
npm run test:db     # 20 PostgreSQL RLS & migration checks
npm run build       # Vite production bundle compilation
```
