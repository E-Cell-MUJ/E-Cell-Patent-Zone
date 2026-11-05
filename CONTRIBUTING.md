# Contributing to the MUJ Patent Application Portal

Thank you for contributing to the **Manipal University Jaipur Patent Application & Disclosure Portal**.

This system safeguards early-stage invention disclosures, prior-art searches, and technical drawings before statutory filing with the Indian Patent Office (IPO / CGPDTM). Under Section 39 of the Indian Patents Act 1970, maintaining absolute novelty and multi-tenant confidentiality is mandatory.

---

## 1. Branching Strategy & Workflow

We follow an engineering model designed for zero regression:

- **`main`**: Production branch. Deployments here reflect the active live release. Direct pushes to `main` are restricted.
- **`develop`**: Primary integration branch. All active development, automated CI verification, and staging previews take place here.
- **Feature Branches**: Branch off `develop`:
  ```bash
  git checkout develop
  git pull origin develop
  git checkout -b feat/your-feature-name
  # or fix/your-bugfix-name
  ```

---

## 2. Local Development Environment

### Prerequisites:
- **Node.js**: v20+ (LTS) or v24
- **Package Manager**: `npm` (v10+)
- **PostgreSQL**: PostgreSQL 15+ (or Supabase CLI)

### Installation:
```bash
git clone https://github.com/SynthReaper/ecell-patentportal.git
cd ecell-patentportal
npm install
```

### Environment Configuration:
Copy `.env.example` to `.env` or `.env.local`:
```bash
cp .env.example .env
```
Ensure required variables are populated:
- `VITE_SUPABASE_URL`: Your Supabase project URL (`https://<project-ref>.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Supabase client anon public key
- `VITE_TURNSTILE_SITE_KEY`: (Optional for local testing; required for production verification)

---

## 3. Engineering Invariants & Coding Standards

Contributors must adhere to the following architectural rules:

1. **Zero Mock/Demo Fallbacks**:
   - The production codebase operates strictly against live Supabase PostgreSQL tables and RPCs.
   - Mock data, fake seed disclosures, and localStorage offline fallbacks are prohibited in non-test runtime code.
2. **PostgreSQL RLS Invariants**:
   - Every table must have Row-Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
   - Every `SECURITY DEFINER` function must explicitly specify `SET search_path = public` and use schema-qualified table references.
   - Wrap `auth.uid()` as scalar `(SELECT auth.uid())` for query plan caching and injection resilience.
3. **Flat Architecture & Simplicity**:
   - Avoid deep inheritance hierarchies and speculative abstractions.
   - Keep files readable, explicit, and typed with TypeScript.
4. **Anti-AI-Slop Frontend**:
   - Maintain intentional, high-contrast institutional typography pairing: Plus Jakarta Sans / Inter paired with JetBrains Mono telemetry.
   - Prohibit generic indigo glowing mesh gradients, neon halos, and cliché marketing buzzwords.

---

## 4. Local Verification & Test Suite

Before opening a pull request or pushing to `develop`, execute the complete test suite:

```bash
# 1. Run Vitest unit, render, and lifecycle tests
npm test -- --run

# 2. Run Database RLS and workflow assertions
npm run test:db

# 3. Verify TypeScript build and Vite compilation
npm run build

# 4. Audit dependencies
npm audit --audit-level=high
```

---

## 5. Pull Request Guidelines

1. Fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) completely.
2. Ensure PR target branch is `develop`.
3. Provide local test output or screenshots demonstrating end-to-end verification.
4. Never include confidential invention text, drawings, or live credentials in pull requests.

---

## 6. Contact & Maintainer

For queries regarding architecture, contribution access, or security disclosures, contact the lead maintainer at codewithaditya8002@gmail.com.
