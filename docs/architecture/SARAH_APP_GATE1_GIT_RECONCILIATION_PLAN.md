# Gate 1B — Safe Git Reconciliation Plan (Assessment Only)

**Programme:** Sarah App & ZiricAI Platform Delivery  
**Gate 1 status:** Phase 0 baseline **accepted** (2026-11-04 stakeholder decision)  
**This document:** Gate 1B assessment; **AP-1–AP-3 executed 2026-11-04** (see § Execution record)  
**Related:** [SARAH_APP_PROGRAMME_READINESS_AUDIT.md](./SARAH_APP_PROGRAMME_READINESS_AUDIT.md)

---

## Executive summary

The repository is in a **high-risk reconciliation state**:

| Signal | Finding |
|--------|---------|
| **Divergence** | `main` at `7b9ddb6` shares merge-base `b084cc1` with `origin/main`, but **local is not a fast-forward** of remote |
| **Behind remote** | **7 commits** on `origin/main` (WhatsApp Gateway G1–G6) are **not** in local `HEAD` |
| **Ahead of remote** | **1 commit** (`7b9ddb6`) on local is **not** on `origin/main` — **duplicate/alternate G5** vs `7ad9f16` |
| **Sarah programme** | U1–U5 + R0 + Phase 0 docs are **mostly uncommitted** (~188 modified tracked, ~310 untracked) |
| **Overlap risk** | **`api/app.js`** and **WhatsApp gateway services** are touched by **both** remote history and local uncommitted work |

**Recommendation:** Do **not** `git pull`, merge, or reset until (1) a **filesystem or branch backup** of the current workspace exists, (2) Sarah/R0 work is **committed on a dedicated programme branch**, (3) **`origin/main` is merged** into that branch with **manual resolution** of `api/app.js` and gateway files, (4) **WhatsApp gateway tests** and **Sarah tests** pass.

**Stakeholder decisions recorded (Gate 1):**

| ID | Decision |
|----|----------|
| D-S0-1 | Accept Phase 0 six deliverables as programme baseline |
| D-S0-2 | Reconciliation plan first — **no merge/commit until reviewed** |
| D-S0-3 | **No U0 sign-off yet** |
| D-S0-4 | **No Phase 1 deployment yet** |
| D-S0-5 | **U5 Firestore persistence required before SmileMore production pilot** |
| D-S0-6 | POPIA legal review before broad consumer launch |
| D-S0-7 | U6 search backend deferred to U6 planning |

**Locked delivery gates (post–Gate 1B):** Gate 2 U0 → Gate 2B U5 hardening → Gate 3 deploy/pilot → Gate 4 U6 → Gate 5 U7 → Gate 6 revenue activation.

---

## Task 1 — Remote divergence (7 commits on `origin/main`)

**Range:** `b084cc1..origin/main` (merge-base → `3d0e132`)

| # | Hash | Message | Files (summary) | Production area | Sarah/R0 overlap |
|---|------|---------|-----------------|-----------------|------------------|
| 1 | `4542a91` | G1/G2 registry and read-only reconciliation | `api/app.js`, `whatsappGatewayRegistry.js`, `whatsappNumberPoolService.js`, G2 scripts/docs | **WhatsApp Gateway / production routing** | **api/app.js** |
| 2 | `677d555` | G2.1 production verification evidence | Docs + audit JSON | Gateway ops evidence | None |
| 3 | `029e983` | G3 duplicate 3699 remediation evidence | G3 scripts, audit JSON, remediation plan | **Client Zero / suffix 3699** ops | None |
| 4 | `05e7533` | G4 registry-first inbound/outbound routing | `whatsappGatewayService.js`, `whatsapp.js`, `integrationConfig.js`, tests | **WhatsApp production** | None |
| 5 | `529c15d` | G4 verification evidence | Audit JSON, spec tweak | Gateway | None |
| 6 | `7ad9f16` | G5 assign/release hardening | `api/app.js`, assignment service, pool IO, registry, tests | **WhatsApp Gateway** | **api/app.js** |
| 7 | `3d0e132` | G6 behavioral readiness and probes | `api/app.js`, readiness services, probe store, tests | **WhatsApp Gateway** | **api/app.js** |

**Functional impact:** These commits are **production-critical** for managed WhatsApp (Central Motors, Client Zero, gateway registry, routing, assignment saga, readiness probes). They do **not** implement Sarah App consumer routes.

**Files changed in combined remote range (`7b9ddb6..origin/main`):** 25 files — see §4 overlap.

---

## Task 1b — Local commit ahead of `origin/main`

| Hash | Message | Parent (via merge-base analysis) |
|------|---------|----------------------------------|
| `7b9ddb6` | feat(whatsapp-gateway): G5 assign/release hardening with saga and idempotency | Child of `b084cc1` (same base as remote chain) |

**Contents (11 files, +2137 / −204 lines):**

- `api/app.js` (+124 lines in commit)
- G5 assignment hardening: `whatsappGatewayAssignmentService.js`, `whatsappGatewayRecovery.js`, pool IO, registry, integration service
- Large `ZIRICAI_WHATSAPP_GATEWAY_SPEC.md` (+619 lines in commit)
- `test/whatsapp-gateway-assignment.test.mjs`

**Dependency analysis:**

- Local `7b9ddb6` is an **alternate G5 implementation path** from `b084cc1`, **not** based on remote `7ad9f16`.
- Comparing `7ad9f16` → `7b9ddb6` shows local commit **lacks** G2–G4 artefacts that exist on `origin/main` (checklists, G3/G4 scripts, `whatsappGatewayService.js`, reconciliation scripts, etc.).
- **Uncommitted** work on top of `7b9ddb6` adds **Sarah App route mounts** and further portal/gateway edits in `api/app.js`.

**Conclusion:** Integrating remote is **not** a trivial fast-forward. The local G5 commit is **superseded in intent** by remote G1–G6 chain; prefer **`origin/main` gateway history** after preserving Sarah uncommitted work.

---

## Task 2 — Uncommitted work inventory

**Counts (2026-11-04 inspection):**

| Class | Count |
|-------|-------|
| Modified tracked files | **~188** |
| Untracked files | **~310** |
| Deleted tracked files | **0** |

### 2.1 Sarah App implementation (uncommitted)

**Backend (untracked unless noted):**

| Area | Paths |
|------|--------|
| U1 Consumer | `services/api/consumerRoutes.js`, `services/auth/consumerAuth.js`, `services/users/consumerProfileService.js` |
| U2 Personal Sarah | `services/api/personalSarahRoutes.js`, `services/sarah/personal/*` |
| U3 My Knowledge | `services/api/personalKnowledgeRoutes.js`, `services/users/personalKnowledgeService.js` |
| U4 Sarah Network | `services/api/sarahNetworkRoutes.js`, `services/sarah/network/*`, `services/users/consentGrantService.js`, `services/users/businessDirectoryService.js` |
| U5 Conversations | `services/api/userConversationRoutes.js`, `services/users/userConversationService.js`, `services/sarah/company/companyReceptionChatService.js` |
| API mount | **`api/app.js` (modified)** — imports/mounts consumer, personal, network, conversations, revenue routes |
| Registry | **`services/api/routeRegistry.js` (modified)** |
| Tenant chat | **`services/storage/tenantStorage.js` (modified)** — `sarah_app` customer id |
| Schema | **`services/database/schema.js` (modified)** — consumer + revenue + sarah network constants |
| SmileMore | `services/dental/smilemorePractice.js` (untracked), dental portal JS (untracked under `app/js/portal/dental/`, `js/portal/dental/`) |

**Frontend:**

- Source: `js/users/**` (untracked), `css/sarah-app.css` (untracked)
- Prepared site: `users/**` (untracked Netlify publish tree)
- Shell: `sarah-app-shell.html`, `users/netlify.toml`

**Tests (untracked):**

- `test/consumer-profile-u1.test.mjs`
- `test/personal-sarah-u2.test.mjs`
- `test/personal-knowledge-u3.test.mjs`
- `test/sarah-network-u4.test.mjs`
- `test/user-conversations-u5.test.mjs`

### 2.2 Revenue Management R0 (uncommitted)

| Path |
|------|
| `services/revenue/*.js` (5 modules) |
| `services/api/revenueRoutes.js`, `platformRevenueRoutes.js` |
| `test/revenue-r0.test.mjs` |

### 2.3 Programme & architecture documentation (uncommitted)

Includes Phase 0 audit deliverables:

- `SARAH_APP_PROGRAMME_READINESS_AUDIT.md`
- `SARAH_APP_U0_ACCEPTANCE_CHECKLIST.md`
- `SARAH_APP_PRODUCTION_DEPLOYMENT_READINESS.md`
- `SARAH_APP_SMILEMORE_PILOT_ACCEPTANCE.md`
- `SARAH_APP_U6_U7_IMPLEMENTATION_READINESS.md`
- `ZIRICAI_REVENUE_IMPLEMENTATION_READINESS.md`
- Full Sarah architecture set (`SARAH_APP_*`, `SARAH_NETWORK_*`, `ZIRICAI_REVENUE_*`, `U0_ACCEPTANCE_CHECKLIST.md`)
- `docs/audit/sarah-app-u*.json`

### 2.4 Other significant uncommitted areas (non-Sarah)

| Area | Modified / untracked examples | Notes |
|------|------------------------------|--------|
| Company Portal | `app/js/portal/*`, `js/portal/*`, `company-portal.html`, finance/automotive modules | Large surface — **production** |
| Mission Control / Admin | `admin/*`, `js/admin/*`, whatsapp-gateway module (untracked) | **Production** |
| WhatsApp Gateway (local) | `services/platform/whatsappGatewayRegistry.js`, `whatsappNumberPoolService.js`, `services/whatsapp.js` (modified); G6 services **untracked** | **Overlaps remote G1–G6** |
| Marketing site | Many `marketing/**` modified | Low Sarah overlap |
| Firestore rules | **`firestore.rules` (modified)** — consumer `userProfiles`, `personalSarah`, `personalKnowledge` | **Deploy-sensitive** |
| Billing mirrors | `billingPlans.browser.js` across sites | Low risk if unchanged logic |
| Worktrees | `.p0-*`, `.g2-1-wt`, etc. (untracked dirs) | **Do not delete** — historical snapshots |

### 2.5 Dependency of Sarah work on current baseline

- Sarah routes are wired in **uncommitted `api/app.js`** — depends on **local `7b9ddb6` + WIP** gateway edits.
- U5 tenant mirror depends on **uncommitted `tenantStorage.js`**.
- Consumer auth depends on **Firestore/memory** via existing adapters; rules in **modified `firestore.rules`** not proven deployed.
- **No dependency** on remote G6 for Sarah logic, but **merged API must include both** Sarah mounts and remote gateway routes.

---

## Task 3 — Production protection assessment

### 3.1 High-conflict files (remote G1–G6 ∩ local modified)

| File | Risk if merge mishandled |
|------|---------------------------|
| **`api/app.js`** | **Critical** — lose Sarah mounts or gateway G4–G6 routes |
| `services/platform/whatsappGatewayRegistry.js` | Wrong registry state → **WhatsApp routing failures** |
| `services/platform/whatsappNumberPoolService.js` | Pool assignment regressions |
| `services/whatsapp.js` | Inbound/outbound webhook behavior |
| `docs/architecture/ZIRICAI_WHATSAPP_GATEWAY_SPEC.md` | Doc-only but indicates parallel edits |

### 3.2 Tenant / client sensitivity

| Concern | Evidence |
|---------|----------|
| **Central Motors** | `admin/workspace-centralmotors.html` modified |
| **Client Zero WhatsApp** | `services/clientZero/syncWhatsAppIntegration.js` modified; G3 commits on remote reference **3699** remediation |
| **SmileMore** | Untracked dental services + portal modules — pilot tenant |
| **Finance** | `financeRoutes.js`, `financeTransactionService.js`, portal finance JS modified — **tenant business ledger** |
| **Automotive** | Command centre modules modified |

### 3.3 Firebase rules & billing

| Item | Risk |
|------|------|
| `firestore.rules` | Consumer rules added locally — must **not** accidentally remove tenant protections when merging |
| Billing | No payment activation in Sarah R0; existing `billingPlans.js` copies modified — verify no accidental price logic drift |

### 3.4 Sarah-specific security (pre-persistence)

| Gap | Gate 2B requirement |
|-----|---------------------|
| Conversations in-memory | Restart data loss |
| Consent grants in-memory | **Unacceptable for production pilot** — stakeholder mandate |
| No `userConversations` rules | Server-only OK if API-only |

---

## Task 4 — Recommended reconciliation strategy (do not execute yet)

### Phase A — Preserve state (approval point **AP-1**)

1. **Full workspace backup** (zip or robocopy) to external path — includes uncommitted + untracked.
2. Optionally: create read-only tag name **`backup/pre-gate1b-2026-11-04`** from current `HEAD` **after** AP-1 (requires `git tag` — execute only when approved).

*Avoid* `git stash` as sole backup — untracked Sarah tree is too large.

### Phase B — Commit Sarah programme in isolation (approval point **AP-2**)

1. Create branch **`programme/sarah-u1-u5-r0`** from current `HEAD` (requires checkout — **only after AP-2**).
2. Stage **only** Sarah/R0/programme docs/tests (see §5 commit groups 1–6) — **exclude** unrelated portal/marketing churn initially OR split into follow-up commits after review.
3. Run tests: Sarah U1–U5 + R0 + existing WhatsApp tests on branch.

**Rationale:** Sarah work must not be lost during gateway merge.

### Phase C — Integrate `origin/main` (approval point **AP-3**)

**Preferred:** `git merge origin/main` into `programme/sarah-u1-u5-r0` (not rebase — preserves audit trail).

**Conflict resolution policy:**

| File | Resolution policy |
|------|-------------------|
| `api/app.js` | **Three-way merge** — keep **all** remote G4–G6 route registrations **and** Sarah `mount*` calls; manual verify line-by-line |
| Gateway services | Prefer **`origin/main`** version unless local diff shows Sarah-unrelated fix — then port fix explicitly |
| `ZIRICAI_WHATSAPP_GATEWAY_SPEC.md` | Merge both; prefer remote structure + local Sarah notes if any |
| Local-only commit `7b9ddb6` | Treat as **obsolete** once remote G5/G6 merged; do not cherry-pick unless diff review finds unique hunks |

**Avoid:** `git reset --hard origin/main` — would **destroy** uncommitted Sarah work.

**Avoid:** Blind `git pull` on current dirty `main`.

### Phase D — Reconcile non-Sarah local modifications (approval point **AP-4**)

Separate workstreams (portal, finance, dental, admin gateway UI):

- Review diffs against `origin/main` **per module**
- Either commit on dedicated branches or discard if superseded by remote
- **Do not** mix with Sarah programme commit without review

### Phase E — Verification (approval point **AP-5**)

| Test bundle | Purpose |
|-------------|---------|
| `test/whatsapp-gateway-*.test.mjs` | Gateway G4–G6 |
| `test/consumer-profile-u1.test.mjs` … `user-conversations-u5.test.mjs` | Sarah |
| `test/revenue-r0.test.mjs` | R0 |
| Finance/dental/automotive tests if portal commits included | Regression |
| Manual: WhatsApp probe readiness (staging) | Client Zero / Central Motors |

### Phase F — Integrate to `main` and push (approval point **AP-6**)

1. Merge programme branch → `main` via PR or local merge after CI.
2. Push only when stakeholder approves **Gate 1B complete**.

---

## Task 5 — Proposed commit groups (order matters)

| Order | Group | Paths (representative) | Depends on |
|-------|--------|------------------------|------------|
| **C1** | Programme & Phase 0 docs | `docs/architecture/SARAH_*`, `ZIRICAI_REVENUE_*`, `SARAH_APP_GATE1_*`, `docs/audit/sarah-app-*.json` | None |
| **C2** | Sarah consumer foundation U1 | `consumerAuth.js`, `consumerProfileService.js`, `consumerRoutes.js`, `firestore.rules` (consumer section), `js/users` auth/shell, `prepare-sites.js`, `users/netlify.toml` | C1 optional |
| **C3** | Personal Sarah + My Knowledge U2–U3 | `services/sarah/personal/*`, `personal*Routes.js`, `personalKnowledgeService.js`, profile UI | C2 |
| **C4** | Sarah Network + conversations U4–U5 | `services/sarah/network/*`, `services/sarah/company/*`, `userConversation*`, `consentGrant*`, `businessDirectory*`, `tenantStorage.js` (sarah_app), dental pilot refs | C2 |
| **C5** | Revenue R0 | `services/revenue/*`, `revenue*Routes.js`, `schema.js` (revenue paths) | C2 (entitlement on bootstrap) |
| **C6** | API integration | **`api/app.js`**, **`routeRegistry.js`**, `schema.js` remainder | **After** merge with origin/main ideally, or immediate with merge conflict expected |
| **C7** | Tests | `test/consumer-*`, `personal-*`, `sarah-network-*`, `user-conversations-*`, `revenue-r0.test.mjs` | C2–C6 |

**Note:** `users/` generated tree may be **gitignored** or committed per policy — prefer **source `js/users` + Netlify build**; confirm `.gitignore` before C2.

**Separate branches recommended for:** portal finance/automotive/dental WIP, admin whatsapp-gateway UI, marketing churn.

---

## Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Lose uncommitted Sarah work | **Critical** | Backup + programme branch commits first |
| WhatsApp production regression | **Critical** | Merge origin/main; run gateway tests; staged deploy |
| Duplicate G5 history confusion | **High** | Abandon local `7b9ddb6` as canonical; use remote chain |
| `api/app.js` merge error | **Critical** | Manual merge checklist + smoke tests |
| Commit unrelated portal noise | **Medium** | Split commits; review diffs |
| Firestore rules partial deploy | **High** | Rules diff review before `firebase deploy` (Gate 3) |
| Worktree deletion | **Medium** | Do not clean untracked `.p0-*` / `.g2-1-wt` without owner |

---

## Approval points (exact)

| ID | Action | Approver |
|----|--------|----------|
| **AP-1** | Workspace backup confirmed | Product owner + technical lead |
| **AP-2** | Create programme branch + commit Sarah/R0 groups C1–C7 | Technical lead |
| **AP-3** | Merge `origin/main` into programme branch | Technical lead |
| **AP-4** | Plan for non-Sarah modified files (portal/finance/admin) | Product owner |
| **AP-5** | Test matrix green | Technical lead |
| **AP-6** | Merge to `main` / push remote | Product owner |
| **Gate 1B complete** | Declares repository safe for Gate 2 (U0) work | Stakeholder |

---

## What this plan explicitly does NOT authorize

- U0 sign-off, production deploy, U6/U7 implementation, revenue activation  
- U5 hardening implementation (Gate 2B — **Firestore persistence for conversations + consent + audit**) — specified as **prerequisite to Gate 3** per stakeholder  

---

## Next step after Gate 1B approval

Execute **AP-1** only, then **AP-2** with commit groups — still **no deploy** until Gate 2 / 2B / 3 sequence.

---

## Execution record (AP-1 – AP-3, authorised 2026-11-04)

| Step | Status | Evidence |
|------|--------|----------|
| **AP-1** | Done | Filesystem backup: `C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai-backup-pre-gate1b-20261104` (robocopy, `node_modules` excluded; **refreshed** on stakeholder AP-1+2+3 authorisation). Tag `backup/pre-gate1b-2026-11-04` on `7b9ddb6`. |
| **AP-2** | Done | Branch **`programme/sarah-u1-u5-r0`**: C1 docs → C5 revenue → C2 U1 → C3 U2–U3 → C4 U4–U5 → C6 API → C7 tests (8 commits on branch before merge). |
| **AP-3** | Done | Merged **`origin/main`** (`3d0e132`); `api/app.js` = origin G1–G6 gateway + Sarah mounts; gateway spec from origin. Follow-up commit **`5618d0a`** adds consumer Firestore path helpers omitted from staged set. |
| **AP-4** | Pending | Portal/finance/admin/marketing WIP in stash **`gate1b-ap4-wip pre-merge`** — not restored. |
| **AP-5** | Partial | Sarah U1–U5 + R0 + `whatsapp-gateway-routing` + `whatsapp-gateway-readiness` tests **pass** on programme branch. |
| **AP-6** | **Not authorised** | `main` unchanged; **no push**. |

**Merge blockers handled:** Untracked gateway artefacts that duplicated `origin/main` were moved to  
`…\gate1b-untracked-merge-blockers\` under the AP-1 backup tree before merge.

**Next approval:** AP-4 (WIP triage), AP-5 (full matrix if portal commits included), AP-6 (merge programme branch → `main` / push).

---

*End of Gate 1B plan and AP-1–AP-3 execution record.*
