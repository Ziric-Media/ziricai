# EDU-01 – EDU-06 Working Report

**Date:** 2026-11-12  
**Branch / tree:** `programme/sarah-u1-u5-r0` (working tree; includes Educare programme delivery)  
**Authorisation:** Operator approved EDU-01–EDU-06 implementation and deploy attempt.

---

## Executive summary

| Gate | Status | Notes |
|------|--------|--------|
| EDU-00A | **Partial** | TP-3D-FIX applied via `git checkout 5b3e892…` (9 files); L1 **PASS**; no separate delivery branch SHA committed |
| EDU-01 | **DONE (production)** | `educare-christian-combined` provisioned via `railway run` + Firestore (no pack) |
| EDU-02 | **Implemented** | Campuses, education settings, KB overview via `educareTenantBootstrap.js` |
| EDU-03 | **Implemented** | `schoolGuardianService.js`, portal **Parents & guardians** module |
| EDU-04 | **Implemented** | Sarah App school application form + `/api/education/v1/.../guardian-application` |
| EDU-05 | **Implemented** | Verified-guardian audience + optional `campusId` on subscriber events |
| EDU-06 | **Verified (local)** | `npm run verify:edu-06` → **PASS** (memory) |
| Deploy | **DONE** | Railway API online; Netlify **sarah.ziricai.com** + **app.ziricai.com** production deploys (2026-11-12) |

**Educare `companyId` (intended):** `educare-christian-combined`  
**No `pack-school-ai` installed.** Central Motors / Client Zero / SmileMore / WhatsApp paths untouched.

---

## What was built

### Backend

- **Schema:** `schoolLearners`, `guardianLinks`, `guardianAudit` tenant subcollections.
- **Services:** `services/education/schoolGuardianService.js`, `schoolCommsAudience.js`, `educareTenantBootstrap.js`, `educareDefaults.js`.
- **API:** `services/api/educationRoutes.js` mounted in `api/app.js`.
- **Network:** Schools with `settings.education.requireVerifiedGuardians` (or Education industry) use **approved guardians only** for subscriber audience; `campusId` on subscriber events narrows fan-out.
- **TP-3D-FIX:** `setDefaultAiEmployee`, provisioning/workspace refresh, verifiers on tree.

### Company Portal (EDU-02 / EDU-03)

- Nav item **Parents & guardians** (education tenants only): `js/portal/modules/schoolGuardians.js`.
- Sarah Network subscriber UI: optional **campus audience** for schools (`js/portal/modules/network.js`).

### Sarah App (EDU-04)

- School fields in subscribe modal (`prototype/sarah-app-ux/index.html` + `js/app.js`): learners, campus, competent-person consent; live submit calls guardian application API (no instant subscribe for schools).

### Provisioning (EDU-01)

```bash
# Production (requires Firebase Admin + STORAGE_BACKEND=firestore)
EDUCARE_OWNER_EMAIL=info@educarechristianschool.co.za \
EDUCARE_OWNER_NAME="Educare Administrator" \
node scripts/provision-educare-tenant.mjs
```

Optional: `EDUCARE_SKIP_IF_EXISTS=1` to bootstrap profile only.

After provision: publish Sarah Network listing from portal (Discover profile), then verify owner login.

---

## Verification

| Check | Command | Result |
|-------|---------|--------|
| TP-3D L1 | `npm run verify:tp3d-fix-default-invariant` | **PASS** |
| EDU-06 E2E (memory) | `npm run verify:edu-06` | **PASS** |
| Educare Firestore provision | `railway run node scripts/provision-educare-tenant.mjs` | **PASS** — `educare-christian-combined` |
| Educare Discover publish | `railway run node scripts/publish-educare-listing.mjs` | **PASS** — `sn_org_0DZJEX6ZFX0QEP8J` |
| Static sites | `npm run prepare:sites` | **PASS** |

---

## Deploy

1. **Sites:** `prepare:sites` refreshed `app/`, `admin/`, `users/` from source (portal + Sarah App UX).
2. **API:** Use your normal Railway + Netlify pipeline (push branch or `railway up` from linked project). Confirm `/api/health` after deploy.
3. **Netlify:** Deploy `users/` (Sarah App) and `app/` (portal) so Educare UI reaches production API.

If Railway CLI is linked, run from repo root:

```bash
railway up
```

---

## Operator checklist (post-deploy)

1. ~~Run **EDU-01** provision~~ **Done** — owner: `info@educarechristianschool.co.za` (password reset via Firebase if needed).
2. ~~Publish Discover~~ **Done** via `scripts/publish-educare-listing.mjs` (`sn_org_0DZJEX6ZFX0QEP8J`).
3. **Educare owner login:** [https://app.ziricai.com](https://app.ziricai.com) → **Parents & guardians** queue.
4. **Parent test:** [https://sarah.ziricai.com](https://sarah.ziricai.com) → Discover **Educare** → **Submit application** → owner **Approve** → test subscriber announcement (optional campus).
5. Confirm non-school tenants still use generic subscriber audience (regression spot-check).

---

## Educare Knowledge Base v1.0 (Company Sarah)

| Doc ID | Title | Status |
|--------|--------|--------|
| edu-kb-001 | Identity, ethos, campuses, contacts | Seeded |
| edu-kb-002 | Admissions and enrolment | Seeded (draft) |
| edu-kb-003 | Curriculum and grades | Seeded (confirm with school) |
| edu-kb-004 | Parent/guardian and escalation | Seeded |
| edu-kb-005 | Fees and payments | Seeded (awaiting fee schedule) |
| edu-kb-006 | Hours, calendar, visits, comms | Seeded |
| edu-kb-007 | Privacy and knowledge confidence | Seeded |

**Source:** `services/storage/educareSchoolKnowledge.js`  
**Reseed:** `npm run seed:educare-knowledge` or `railway run node scripts/seed-educare-knowledge.mjs`  
**Test:** `npm run verify:educare-knowledge`  
**Production seed (2026-11-12):** 7 documents on `educare-christian-combined`; Sarah system prompt updated.

---

## Known gaps / follow-ups

- **Firestore L2** TP-3D post-fix readonly not rerun on disposable tenant.
- **Delivery hygiene:** Large WIP working tree — recommend a clean commit/branch for production tag.
- **Discover card:** Public campus blocks not yet merged into `toDiscoverCard` (campuses live on company record + education API).
- **Dedicated school dashboard** widgets are reuse of generic portal modules (EDU-02 MVP).

---

## Architecture compliance

- One org / one tenant; two campuses in `company.campuses`.
- Subscribe ≠ guardianship; approval activates network subscribe + prefs.
- Only **approved** guardians in school comms audience.
- No learner PII on Discover listings.
