## Summary of Changes

<!-- Provide a clear, technical summary of the changes proposed in this pull request. -->

### Related Issues
- Resolves #<!-- issue number -->

---

## Type of Change

- [ ] 🐛 Bug fix (non-breaking fix for an identified defect)
- [ ] ✨ Feature enhancement (adds verified functional capabilities)
- [ ] 🔒 Security hardening (RLS, secrets management, auth invariant)
- [ ] 🗄️ Database migration (schema, functions, or storage policies)
- [ ] ⚡ Performance optimization (bundle size, query latency)
- [ ] 📖 Documentation update (runbooks, architecture, specs)
- [ ] 🧪 Test suite additions (Vitest, RLS assertions, E2E)

---

## Security & Compliance Checklist (OWASP ASVS L2 & Section 39)

- [ ] **Confidential by Default**: No invention disclosures, claims, or technical drawings are exposed unauthenticated or to unauthorized roles.
- [ ] **Student Data Isolation**: Multi-tenant RLS invariants verified — students cannot view, query, or enumerate other students' disclosures.
- [ ] **Staff Confidentiality Shield**: Super admins (IT governance) are barred at the PostgreSQL level from reading invention content.
- [ ] **Zero Hardcoded Secrets**: No credentials, tokens, service role keys, or unhashed passwords exist in client bundles or git history.
- [ ] **Domain Enforcement**: Institutional restrictions (`@muj.manipal.edu`) verified at both UI and database trigger layers.
- [ ] **Audit Trail**: Administrative actions and lifecycle status transitions log caller ID, timestamp, and metadata.

---

## Local Verification & Test Suite

All checks must pass locally before requesting review:

- [ ] `npm test -- --run` passes (all unit and render suites).
- [ ] `npm run test:db` passes (all SQL RLS and workflow assertions).
- [ ] `npm run build` succeeds (`tsc -b && vite build`) with zero TypeScript errors.
- [ ] `npm audit --audit-level=high` reports zero vulnerabilities.

---

## Screenshots / Evidence (if applicable)

<!-- Attach terminal test output, browser verification, or UI captures. -->
