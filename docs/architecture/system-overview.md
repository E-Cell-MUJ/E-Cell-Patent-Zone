# Architecture & System Overview

**System:** Manipal University Jaipur — Patent Application & Disclosure Portal  
**Maintainer / Lead Architect:** SynthReaper (`codewithaditya8002@gmail.com`)  
**Domain:** `patents.muj.manipal.edu`

---

## 1. System Context & Architecture Diagram

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Browser Layer"]
        Student["Student Inventor (Drafting / Submissions)"]
        Coordinator["Patent Coordinator (Docket Review / Corrections)"]
        SuperAdmin["Super Admin (Account Security & Supervision)"]
    end

    subgraph SecurityBoundary ["Security & Protection Perimeter"]
        Turnstile["Cloudflare Turnstile Bot Protection"]
        DomainFilter["Domain Gateway (@muj.manipal.edu only)"]
        MfaGate["RFC 6238 TOTP MFA Gate (aal2)"]
    end

    subgraph PostgRESTLayer ["PostgREST & Edge API"]
        RPC_Student["submit_application_atomic / applicant_resubmit_atomic"]
        RPC_Coordinator["coordinator_transition_status"]
        RPC_Admin["get_user_directory / get_pipeline_overview / admin_set_suspended"]
        StorageEngine["Supabase Storage (patent-documents / patent-drawings)"]
    end

    subgraph DatabaseLayer ["PostgreSQL 15 (AWS ap-southeast-1)"]
        ProfilesTable[("public.profiles")]
        AppsTable[("public.applications")]
        VersionsTable[("public.application_versions")]
        AuditTable[("public.admin_audit_log")]
        SettingsTable[("public.app_settings")]
    end

    subgraph EmailLayer ["Transactional Messaging"]
        BrevoSMTP["Brevo SMTP Relay (Port 587)"]
        M365Graph["Microsoft 365 Exchange Online (Optional Hook)"]
    end

    Student --> Turnstile
    Coordinator --> Turnstile
    SuperAdmin --> Turnstile
    Turnstile --> DomainFilter
    DomainFilter --> MfaGate
    MfaGate --> PostgRESTLayer
    PostgRESTLayer --> DatabaseLayer
    PostgRESTLayer --> BrevoSMTP
```

---

## 2. Multi-Tenant Role & Permission Invariants

| Role | Disclosure Read | Disclosure Edit | Administrative Audit | Account Actions | Pipeline Telemetry |
|---|---|---|---|---|---|
| **Student** | Own applications only | Own drafts/resubmissions | ❌ None | ❌ None | ❌ None |
| **Coordinator (`admin`)** | All submitted disclosures | Status & remarks only | ❌ None | ❌ None | Review docket |
| **Super Admin (`super_admin`)** | ❌ **DENIED** (Claims/Drawings masked) | ❌ **DENIED** | ✅ Full read access | ✅ Suspend/Reset/Role | ✅ Stage & Department counts |

---

## 3. Data Integrity & State Machine

```mermaid
stateDiagram-v2
    [*] --> draft: Student creates disclosure
    draft --> submitted: Student submits (Atomic Snapshot)
    submitted --> under_review: Coordinator starts review
    under_review --> corrections_required: Coordinator requests technical remarks
    corrections_required --> resubmitted: Student addresses remarks (Version++)
    resubmitted --> under_review: Coordinator re-examines
    under_review --> approved_next_stage: Statutory clearance granted
```

Every transition is atomic and executed via `coordinator_transition_status()`, creating an immutable row in `application_status_history`.
