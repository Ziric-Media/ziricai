# EDU-00 — Educare Education Tenant Readiness Audit

**Gate:** EDU-00 (read-only)  
**Date:** 2026-11-12  
**Branch inspected:** `programme/sarah-u1-u5-r0` (current working tree; not switched)  
**School:** Educare Christian Combined School (management-authorised operational pilot)  
**Constraints honored:** no tenant creation, no code/data/env changes, no deploy, no Client Zero / Central Motors / SmileMore / WhatsApp mutation

---

## Executive summary and readiness verdict

### Verdict: **READY WITH BLOCKERS**

ZiricAI can host Educare as an **isolated Company Portal tenant** using the existing Mission Control operator provision path (`provisionOperatorTenant` → `provisionCompany` → real Firebase Auth owner). Core portal modules (dashboard, Sarah, inbox, knowledge, team, network listing, subscriber announcements) are reusable for a school without inventing a second platform.

However, **TP-3D is not closed** on this programme’s ledger, and the **TP-3D-FIX** (single default AI employee + workspace link refresh) **is not present on the current programme branch**. It lives in release worktrees (`.tp-3d-fix-release` / `.styling-1e-release`) at commit `5b3e892…`; deploy occurred, but disposable repair / TP-3D-RERUN were blocked by Firestore quota and a subsequent Portal profile-resolution incident.

Separately, the **parent/guardian school subscription form**, **learner-linking**, **school verification of guardians**, and **two-campus data model** are **not implemented**. Existing Sarah Network “Subscribe” is a **generic org consent subscription**, not a POPIA-aligned school enrolment of parent↔learner relationships.

**Implication for EDU-01:** Educare can be provisioned as an operational school tenant **if and only if** EDU-01 is constrained to:

1. Operator provision with an explicit `settings.tenantClass` (`PRODUCTION CUSTOMER` or `PILOT`).
2. **No Marketplace pack install** until TP-3D-FIX is merged onto the delivery branch (or EDU-01 deliberately avoids packs).
3. Clean isolation from Central Motors, SmileMore, Client Zero, and WhatsApp numbers.
4. Deferred parent form / campus schema to EDU-02–EDU-05 (not silent inventing of grade ranges beyond supplied campus facts).

Without those constraints, Educare risks inheriting the known dual-default / stale-workspace defect when packs are installed.

---

## 1. School information (supplied — not invented)

| Field | Value |
|--------|--------|
| Legal / trading name | Educare Christian Combined School |
| Authorisation | School management authorised operational pilot |
| Ethos | Christian-based education |
| Primary campus | 25 Von Wielligh Street, Rustenburg, 2999 — preschool toddlers (3 months–4 years) and primary grades; Mon–Fri 07:00–16:00 |
| Secondary campus | 155 Leyds Street, Rustenburg, 0299 — Grade 8–12; Mon–Fri 07:00–16:00 |
| Main phone | +27 14 592 2854 |
| Main email | info@educarechristianschool.co.za |

**Note:** Uploaded school HTML (`index(1).html`) was not found under the Cursor project uploads folder during this audit. Use the management-supplied campus facts above as authoritative for EDU-01+. Do not silently publish conflicting Grade R–9 vs Grade 10–12 website fragments without school confirmation of which campus owns which grades.

**Proposed companyId (recommendation only — not created):** `educare-christian-combined` or `educare-rtb` (must pass `isValidCompanyId`, must not collide with reserved Central Motors IDs).

---

## 2. Working tree / WIP dependency

| Item | Status |
|------|--------|
| Current branch | `programme/sarah-u1-u5-r0` |
| Dirty tree | **Large** — portal, Sarah App, network, payments, MC modules, untracked worktrees (`.tp-3d-fix-release`, `.styling-1e-release`, many `.p0-*`) |
| Stashes | Not applied / not inspected beyond status |
| EDU-00 impact | Audit only; **EDU-01 must not deploy dirty-main**. Use a clean successor branch / release artifact. |

**Classification:** EDU-01 is **Blocked by dependency** on release hygiene if attempted from this dirty tree.

---

## 3. TP-3D status and evidence

### Ledger (from programme history / agent transcript)

| Gate | Status |
|------|--------|
| TP-3A Knowledge bootstrap | CLOSED |
| TP-3B AI Employee runtime isolation | CLOSED |
| TP-3C Marketplace install on disposable tenant | CLOSED |
| TP-3D New-owner Portal | **NOT CLOSED** (PASS WITH FINDINGS) |
| TP-3D-FIX (single default + workspace refresh) | Implemented + committed (`5b3e892…`) + Railway deploy attempted; **repair / RERUN incomplete** |
| TP-3E / TP-3F | Historically blocked pending TP-3D CLOSED |

### What TP-3D found (evidence)

- Dual `isDefault: true` after Marketplace install.
- Stale provisioning/workspace links still pointing at pre-install agent.
- Workspace knowledge count understated (KB shell count vs documents).

### What TP-3D-FIX delivered (release trees only)

| Capability | Current programme branch | `.tp-3d-fix-release` @ `5b3e892` |
|------------|--------------------------|-------------------------------------|
| `setDefaultAiEmployee` / invariant | **Missing** (`getDefault` still `find(isDefault) \|\| agents[0]`) | **Present** |
| `refreshAuthoritativeWorkspaceLinks` | **Missing** | **Present** |
| `countKnowledgeDocs` via `listKnowledgeDocuments` | **Still adapter/KB-shell path** | **Fixed in release** |
| Verifiers / repair scripts | **Missing** on programme tree | Present under release worktree |

### Tests executed in this audit

| Command | Result |
|---------|--------|
| `node -e` smoke of `isCanonicalProvisioningComplete` | **PASS** — empty/partial → false; full resource set → true |
| `node scripts/verify-tenant-provisioning-1.mjs` | **FAIL / incomplete** — `NO_ADMIN_CREDENTIALS` in local env (expected without Admin) |
| TP-3D invariant verifier on programme tree | **Not present** |
| Production Firestore / disposable repair | **Not run** (read-only gate; historically quota-blocked) |

### Classification

| Question | Classification |
|----------|----------------|
| Can an operational customer tenant be provisioned via MC operator path? | **Implemented but not verified** on this branch (code path exists; no live Educare create) |
| Are default-tenant / workspace-link fixes complete on the branch we would ship Educare from? | **Partially implemented / Blocked** — fixed only on TP-3D-FIX release SHA, not merged into `programme/sarah-u1-u5-r0` |
| Tenant isolation (companyId-scoped company, membership, KB, agents)? | **Implemented and verified** historically on disposable Client #2 (TP-3B); still the intended model |
| Duplicate provision protection? | **Implemented** — `isCanonicalProvisioningComplete` short-circuits re-provision; reserved company IDs for CM |
| Rollback of Educare? | **Not implemented** as a first-class EDU rollback playbook — standard company suspend/archive APIs exist |

**Safe EDU-01 route:** Mission Control → `provisionOperatorTenant` with real owner email, `settings.tenantClass: "PRODUCTION CUSTOMER"` (or `PILOT`), industry `Education` / school, **skip Marketplace install** until TP-3D-FIX is on the delivery branch.

---

## 4. Existing reusable Company Portal architecture

| Module (Educare plan name) | Portal today | Source / API | Classification |
|----------------------------|--------------|--------------|----------------|
| School Dashboard | Overview `dashboard` | `js/portal/modules/dashboard.js`, `/api/portal/hub/:companyId` | **Implemented** (generic KPIs; not school-specific) |
| School Profile | Settings + Discover listing profile | `settings.js`, `discoverProfile.js` / `network.js`, `networkProfileService.js` | **Partially implemented** — single location/address/hours; **no campuses array** |
| School Sarah | Sarah Admin + AI Employees | `sarah.js`, `agents.js`, Company Reception | **Implemented** |
| Sarah Inbox | Conversations / inbox UI | `conversations.js`, `inbox-ui.js` | **Implemented** |
| Subscribers & Parents | Network subscriber event send + audience counts | `network.js` + `connectionService` / `subscriberEventService` | **Partially implemented** — **no parent/guardian directory, no pending verification queue** |
| Announcements / Notifications / Reminders | Subscriber events (`announcement` / `notification` / `reminder`) + consumer prefs | `subscriberEventService.js`, `notificationService.js`, ORG_PREF_KEYS | **Implemented** for generic subscribers |
| School Calendar | Appointments | `appointments.js` | **Partially implemented** — general appointments, not term calendar |
| Knowledge Centre | Knowledge Base | `knowledge.js`, `knowledgeService.js` | **Implemented** |
| Staff & Permissions | Team | `team.js`, `js/portal/permissions.js` | **Implemented** (owner/manager/sales/support/reception/viewer — **no teacher/parent roles**) |
| Analytics | Analytics | `analytics.js` | **Implemented** (generic) |
| Automotive / Dental CC | Industry command centres | `automotiveCommandCentre.js`, dental modules | **Implemented** for other industries — **no education preset / school CC** |

Industry presets on disk: `automotive-dealership`, `dental-clinic`, `construction-engineering` only — **no education preset**.

Marketplace docs mention `pack-school-ai` as a free education pack concept — **do not install for Educare until TP-3D-FIX is on the ship branch**.

---

## 5. Education tenant / two-campus model

### Desired

One organisation (Educare) with **two campus records** (Primary / Secondary), campus-specific grades, hours, and optional campus-scoped announcements.

### Current capability

| Need | Status |
|------|--------|
| One companyId / one org entity (`snId`) | **Implemented** |
| Public Discover profile (name, industry, location, address, hours, contact, gallery, products) | **Implemented** via `PUBLIC_PROFILE_FIELDS` |
| Multiple campuses as first-class fields | **Not implemented** |
| Campus-specific grade ranges | **Not implemented** |
| Campus-scoped announcements | **Not implemented** (subscriber events are org-wide + channel prefs) |
| Encode campuses in `serviceAreas` / `address` / `hours` text | **Workaround only** — lossy; not structured |

**Proposed data model (for EDU-02 — design only):**

```text
companies/{educareId}
  settings.tenantClass = PRODUCTION CUSTOMER | PILOT
  industry = Education
  campuses: [
    { id, name, kind: primary|secondary, address, hours[], gradesText, phone?, email? }
  ]

businessDirectory/{educareId}  // published subset
  campuses: [...]  // public, non-sensitive
  // no learner PII
```

Do **not** create two tenants for two campuses.

---

## 6. Sarah Network

| Capability | Status |
|------------|--------|
| Register org entity / SN-ID | **Implemented** (`ensureOrgEntity`, listing publish) |
| Publish approved public profile | **Implemented** (SNET-03) |
| Discover search + education category keyword | **Implemented** (`networkTaxonomy` education keywords) |
| Company Sarah on Discover / App chat | **Implemented** (discoverable gate + company reception) |
| Verification case / badge | **Implemented** (SNET-04) |
| Generic Subscribe + consent grant | **Implemented** (SNET-07) |
| My Organisations prefs (notifications / announcements / reminders) | **Implemented** |
| School-specific parent registration form | **Not implemented** |
| Pending guardian verification workflow | **Not implemented** |
| Learner records linked to parent subscriptions | **Not implemented** |

---

## 7. Parent subscription architecture (required vs available)

### Planned EDU flow

Discover → Subscribe → Parent & Guardian form → pending → school verifies → activate prefs.

### Available today

| Step | Status |
|------|--------|
| Discover Educare | Needs EDU-01 + publish |
| Subscribe (live) | Consent-linked `subscribe` — **no learner fields** (prototype-only account/reference fields hidden in live mode) |
| Prefill name/email from consumer profile | Partially available via consumer auth/profile; **not wired into a school form** |
| Multiple learners / multiple guardians | **Not implemented** |
| Pending vs approved school verification | **Not implemented** (subscribe activates immediately after consent) |
| Pause / withdraw subscription | **Implemented** (`unsubscribe`) at org level |
| Audit of guardian decisions | **Not implemented** (connection history ≠ school verification audit) |

**Critical product rule (confirmed by gap):** a Sarah account must **never** be treated as proof of legal guardianship. Current Subscribe violates that product intent for schools if used as-is without a verification layer.

### Proposed collections (EDU-03 / EDU-04 — not created)

```text
companies/{schoolId}/schoolLearners/{learnerId}     // minimised: name, grade, campusId, admissionNo?
companies/{schoolId}/guardianLinks/{linkId}         // parentUid, learnerId, relationship, status pending|approved|rejected
networkConnections/{id}                             // remains org subscription after approval
consent / audit docs for POPIA competent-person consent
```

---

## 8. Privacy and POPIA (children’s information)

| Safeguard | Status |
|-----------|--------|
| Competent-person consent for child data | **Not implemented** for school flows (generic network consent only) |
| Data minimisation (no grades/medical/academic in v1) | **Policy recommended**; **no school schema yet** |
| Parent/guardian verification by school staff | **Not implemented** |
| RBAC for school staff | **Partial** — generic portal roles; no teacher/campus scope |
| Separation of school ops vs consumer personal data | **Architecture supports** (company vs consumer collections); school link layer missing |
| Consent withdrawal | **Partial** — org unsubscribe exists |
| Auditability | **Partial** — network admin audit / connection history; not school verification |
| No learner academic-record system in v1 | **Correctly out of scope** — confirm in EDU-01+ |

---

## 9. APIs, collections, and source files (primary)

| Area | Paths |
|------|--------|
| Operator provision | `services/platform/operatorTenantProvisionService.js`, `services/platform/provisioningService.js`, MC `admin/js/admin/modules/companies.js` |
| Completeness gate | `isCanonicalProvisioningComplete`, `buildWorkspaceLinks`, `saveProvisioningLinks` |
| Classification | `js/shared/tenantClassification.js`, `services/network/networkEligibility.js` |
| Network listing | `services/network/networkProfileService.js`, `services/users/businessDirectoryService.js` |
| Connections / subscribe | `services/network/connectionService.js`, `services/users/consentGrantService.js` |
| Subscriber comms | `services/network/subscriberEventService.js`, `services/network/notificationService.js` |
| Portal shell | `js/portal/core/appShell.js`, `js/portal/modules/*` |
| Sarah App subscribe UI | `prototype/sarah-app-ux/js/app.js` (`sub01*`), `index.html` `#sub01RegisterModal` |
| TP-3D-FIX artifact | `.tp-3d-fix-release` @ `5b3e8924161b5d78bc947ca82dc77cc9050e73a6` |

---

## 10. Dependencies and implementation risks

1. **TP-3D not closed** + **FIX not on programme branch** → Marketplace install on Educare is unsafe until merged/verified.  
2. **Dirty working tree** → high risk of accidental co-deploy of unrelated WIP.  
3. **Using generic Subscribe for parents** → POPIA / guardianship risk if treated as verified school subscription.  
4. **No campus model** → Discover may oversimplify Educare as one address/grade band.  
5. **No education industry preset** → school portal looks like a general SMB until EDU-03.  
6. **Firestore quota history** → production Admin verification scripts may fail; do not interpret memory fallback as production truth.  
7. **WhatsApp** → Educare must not reuse Central Motors phone assignment; leave Ready-for-Setup or unassigned unless separately authorised.

---

## 11. Educare programme roadmap (agreed gates)

| Gate | Deliverable | Depends on |
|------|-------------|------------|
| **EDU-00** | Tenant readiness audit (this document) | — |
| **EDU-00A** | Provisioning and release-hygiene closure — TP-3D-FIX reconciled, verifiers run, clean delivery baseline identified (**no Educare tenant**) | EDU-00 |
| **EDU-01** | Provision one Educare Company Portal tenant (no `pack-school-ai`; `tenantClass`; owner access; isolation; optional stub campuses only if schema agreed) | EDU-00A closed |
| **EDU-02** | School Portal — Educare dashboard, profile, campus management, announcements, calendar, school knowledge configuration | EDU-01 |
| **EDU-03** | Parent and guardian management — directory, learner↔guardian links, verification queue, education RBAC, audit history | EDU-01 |
| **EDU-04** | Sarah App subscription experience — Educare discovery, parent form (multi-learner, campus, prefs, consent); requests stay **pending** until school verifies | EDU-03; Sarah Network publish |
| **EDU-05** | Communication integration — approved guardians in announcement/notification/reminder audience; campus targeting; preference management | EDU-04 |
| **EDU-06** | Acceptance testing — parent subscribes → school verifies → subscription activates → correct campus-aware communications; Discover never exposes learner PII | EDU-01–EDU-05 |

**Architecture locked (product):** one Educare organisation and one portal tenant; two separately managed campuses; parents use existing Sarah App accounts; Sarah subscribe grants **communication preferences only** (not proof of guardianship); learner↔guardian links are private and **pending until verified**; only **approved** guardians enter the school communication audience; reuse Sarah Network subscribe/notification plumbing with school verification and campus targeting added in EDU-03–EDU-05.

**Constraints carried from EDU-00:** no Educare creation before EDU-01 authorization; no `pack-school-ai` until TP-3D-FIX is on the delivery baseline and independently verified; no mutation of Central Motors, Client Zero, Client 0.1, SmileMore, or WhatsApp assignments as part of Educare gates; no production deploy or merge without explicit approval.

First user-visible milestone after EDU-01: **working Educare Company Portal (EDU-02)**, then guardian verification and parent form (EDU-03–EDU-04).

*(Supersedes the earlier EDU-01–EDU-09 draft table in the first EDU-00 draft.)*

---

## 12. Exact recommended next action

1. **EDU-00 accepted** — verdict **READY WITH BLOCKERS**; architecture and constraints in §11.  
2. **Execute EDU-00A** (read-only / controlled — see `EDU_00A_PROVISIONING_RELEASE_HYGIENE_CLOSURE.md`): reconcile TP-3D-FIX onto the intended delivery branch, run verifiers, name a clean baseline SHA — **still no Educare tenant**.  
3. **Authorize EDU-01** only after EDU-00A closure: clean branch or artifact, proposed `companyId`, Educare owner email, `tenantClass`, WhatsApp unassigned unless separately authorised.  
4. Do **not** ship the parent form before **EDU-04**; do **not** invent learner PII schemas ahead of POPIA review in **EDU-03**.

---

## Capability scorecard (summary)

| Capability | Classification |
|------------|----------------|
| Operator tenant provision (Auth owner + workspace) | Implemented but not verified (this audit) |
| Canonical provisioning completeness helper | Implemented and verified (local smoke) |
| TP-3D closed | **Blocked by another dependency** |
| TP-3D-FIX on programme branch | **Not implemented** (exists only in release worktree) |
| Portal modules reusable for school ops | Partially implemented |
| Education industry preset / school CC | Not implemented |
| Two-campus data model | Not implemented |
| Discover publish for schools | Implemented (generic listing) |
| Generic Network Subscribe | Implemented and verified (prior SNET gates) |
| Parent/guardian school form + verification | Not implemented |
| POPIA children’s data controls for school | Not implemented / Partially (generic consent only) |

---

**Final verdict: READY WITH BLOCKERS**

EDU-01 may proceed only after **EDU-00A** closure and under the constraints in §11–§12 and §3 (safe provision route). The full school-to-parent journey remains blocked until **EDU-03–EDU-06** are built.
