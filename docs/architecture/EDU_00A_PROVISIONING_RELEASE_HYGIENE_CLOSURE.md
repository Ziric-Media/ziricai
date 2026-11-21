# EDU-00A — Provisioning and Release Hygiene Closure

**Gate:** EDU-00A (read-only / controlled — no tenant creation, no production writes, no deploy, no merge)  
**Date:** 2026-11-12  
**Authorised boundaries honoured:** no Educare provision; no `pack-school-ai`; no Central Motors / Client Zero / Client 0.1 / SmileMore / WhatsApp mutation

---

## Verdict: **PARTIALLY CLOSED** (2026-11-12 programme delivery)

TP-3D-FIX file set applied on the working programme tree; L1 **PASS**. A named clean delivery branch SHA was **not** cut separately — see [EDU_01_06_WORKING_REPORT.md](./EDU_01_06_WORKING_REPORT.md).

---

## Prior verdict (pre-implementation): **NOT CLOSED**

TP-3D-FIX is **identified and locally verified** on its release artifact, but it is **not reconciled** with the programme line that would ship Educare. The programme working tree remains **unsuitable** as a deployment source. EDU-01 must stay **blocked** until the conditions in §7 are met and explicitly approved.

---

## 1. Purpose

Close **Blocker A** (TP-3D-FIX not on delivery branch) and **Blocker B** (release hygiene) from [EDU_00_EDUCARE_TENANT_READINESS_AUDIT.md](./EDU_00_EDUCARE_TENANT_READINESS_AUDIT.md) before any Educare tenant work (EDU-01).

---

## 2. Inspection baseline (2026-11-12)

| Item | Value |
|------|--------|
| Programme branch (tracked tip) | `programme/sarah-u1-u5-r0` @ **`0ca00f7264214704a1cb8b2bd7e25507922631e6`** (`Record Railway deploy id for FCM HTTP v1 release.`) |
| Working tree | **Dirty** — ~176 tracked files with unstaged diff; **383** porcelain entries (includes many untracked worktrees and WIP) |
| TP-3D-FIX commit | **`5b3e8924161b5d78bc947ca82dc77cc9050e73a6`** |
| TP-3D-FIX local branch | `tp-3d-fix-marketplace-default-consistency` (worktree: `.tp-3d-fix-release`) |
| TP-3D-FIX on `origin` | **Not pushed** (no remote ref at time of inspection) |
| Divergence vs programme tip | `git rev-list --left-right --count programme/sarah-u1-u5-r0...5b3e892` → **197** (programme-only) / **1** (FIX-only) |
| Programme contains FIX? | **No** — `setDefaultAiEmployee` / verifiers absent on programme tree |

---

## 3. TP-3D-FIX change manifest

Single commit on `tp-3d-fix-marketplace-default-consistency`:

**Message:** `fix(portal): enforce AI employee default consistency after pack install`

| Path | Role |
|------|------|
| `services/tenants/aiEmployeeService.js` | `setDefaultAiEmployee`, `assertSingleDefaultInvariant`, transactional single-default enforcement; marketplace-safe default resolution |
| `services/platform/industryPackService.js` | Calls default refresh after pack install |
| `services/platform/provisioningService.js` | `refreshAuthoritativeWorkspaceLinks`; provisioning integration |
| `services/tenants/companyService.js` | Workspace link persistence aligned with authoritative agent |
| `services/portal/workspaceService.js` | Knowledge doc counts via `listKnowledgeDocuments` (not KB-shell-only) |
| `scripts/verify-tp3d-fix-default-invariant.js` | Memory-backend invariant smoke |
| `scripts/verify-tp3d-post-fix-readonly.mjs` | Firestore **read-only** post-fix checks (disposable tenant) |
| `scripts/repair-tp3d-disposable-default-workspace.mjs` | **Writes** — disposable `client2-tp2c-accept-20260917` only, gated by `ALLOW_TP3D_DISPOSABLE_REPAIR=1` |
| `package.json` | Adds `verify:tp3d-fix-default-invariant`, `verify:tp3d-post-fix-readonly` |

**Programme branch gap (confirmed):** `services/tenants/aiEmployeeService.js` still resolves default via `agents.find((a) => a.isDefault) || agents[0]` with no single-default invariant or `setDefaultAiEmployee`.

---

## 4. Dependencies and integration notes

1. **Runtime:** Node ≥20; existing storage adapter (`memory` / Firestore).  
2. **Pack install path:** FIX assumes `industryPackService` invokes default refresh — relevant if Educare ever installs marketplace packs (explicitly **out of scope** for EDU-01).  
3. **Provisioning:** `provisioningService` + `companyService` link graph must stay consistent with portal workspace snapshot APIs.  
4. **Verification ladder:**
   - **L1 (local, no Firestore):** `npm run verify:tp3d-fix-default-invariant` — requires FIX code on tree.  
   - **L2 (Firestore read-only):** `CLIENT2_COMPANY_ID=client2-tp2c-accept-20260917 npm run verify:tp3d-post-fix-readonly` — needs Admin/Firestore credentials; historically sensitive to quota.  
   - **L3 (optional repair):** `repair-tp3d-disposable-default-workspace.mjs` — **production write** on disposable id only; requires explicit operator flags; **not run in EDU-00A**.  
5. **TP-3D ledger:** Formal **TP-3D CLOSED** still depends on L2 (and possibly repair + RERUN) on a tenant that reflects post-fix behaviour — separate from Educare.

---

## 5. Proposed reconciliation (requires approval — not executed)

**Intent:** land FIX **on top of** the current programme line, not deploy from the stale FIX parent (197 commits behind programme).

| Step | Action | EDU-00A status |
|------|--------|----------------|
| A | Park WIP: commit to a WIP branch or stash; working tree for delivery work must be **clean** | **Not done** |
| B | Cut delivery branch from programme tip `0ca00f7…` (suggested name: `release/edu-delivery-baseline` or programme-approved equivalent) | **Not done** |
| C | Cherry-pick `5b3e8924161b5d78bc947ca82dc77cc9050e73a6` | **Not done** |
| D | Resolve predicted textual conflicts in `package.json`, `services/platform/provisioningService.js`, `services/tenants/companyService.js` (`git merge-tree` preview: **3** “changed in both”) | **Not done** |
| E | Run L1 verifier on resulting SHA | **Done only on FIX artifact** (see §6) |
| F | Run targeted tenant/provision unit tests already in repo | **Not done on reconciled SHA** |
| G | Push delivery branch + record **exact SHA** as Educare delivery baseline | **Not done** |
| H | Optional: L2 readonly against disposable tenant after deploy of baseline | **Not done** |

**Alternative (weaker for Educare, stronger for TP-3D ledger only):** deploy FIX branch SHA `5b3e892` — **rejected** for Educare because it omits 197 programme commits (SNET, FCM, Discover profile fields, etc.).

---

## 6. Verification results (this gate)

| Check | Environment | Result |
|-------|-------------|--------|
| `node scripts/verify-tp3d-fix-default-invariant.js` | `.tp-3d-fix-release` @ `5b3e892` (memory) | **PASS** |
| `verify-tp3d-post-fix-readonly.mjs` | Not run | **SKIPPED** — requires `CLIENT2_COMPANY_ID` + Firestore; no disposable rerun authorised |
| `repair-tp3d-disposable-default-workspace.mjs` | Not run | **SKIPPED** — write gate; disposable repair not authorised |
| Programme tree L1 verifier | Script missing on programme branch | **N/A** |
| `verify-tenant-provisioning-1.mjs` | Programme tree, local | **Not re-run** (prior audit: `NO_ADMIN_CREDENTIALS` without Admin) |
| Educare / pack-school-ai / production mutation | — | **None performed** |

---

## 7. Remaining blockers

| ID | Blocker | Blocks |
|----|---------|--------|
| **EDU-00A-B1** | TP-3D-FIX not cherry-picked/merged onto programme delivery branch | Safe marketplace behaviour; formal TP-3D closure |
| **EDU-00A-B2** | No clean, named delivery **SHA** on a branch without unrelated WIP | EDU-01 deploy / provision source |
| **EDU-00A-B3** | L2 Firestore post-fix verifier not run on reconciled baseline | TP-3D ledger CLOSED; confidence after merge conflicts |
| **EDU-00A-B4** | TP-3D disposable repair / RERUN incomplete (historical quota + portal profile incident) | TP-3E/TP-3F; not strictly required for Educare if **no pack install** |
| **EDU-00A-B5** | FIX branch not on `origin` — bus-factor / repeatability | Team handoff |

---

## 8. Conditions to open EDU-01 (all required)

1. **EDU-00A verdict → CLOSED** on a written update to this document with the **delivery branch name** and **exact commit SHA**.  
2. Delivery SHA includes TP-3D-FIX capabilities (L1 **PASS** on that SHA).  
3. Working tree used for any deploy artifact is **clean** (or CI build from tagged SHA only).  
4. Explicit operator approval: Educare `companyId`, owner email, `tenantClass`, WhatsApp policy.  
5. EDU-01 constraints unchanged: **no `pack-school-ai`** until TP-3D-FIX verified on baseline **and** pack install explicitly authorised.  
6. No production merge/deploy without separate approval (carried from EDU-00).

---

## 9. Recommended approvals for next session

1. **Approve Step A–D** (WIP park + `release/edu-delivery-baseline` + cherry-pick `5b3e892`) — code change, still no Educare tenant.  
2. **Approve L2 readonly** against disposable `client2-tp2c-accept-20260917` when credentials and quota allow.  
3. **Decline or defer** disposable repair unless TP-3D ledger closure is required before Educare.

---

## 10. Cross-reference

- Parent audit: [EDU_00_EDUCARE_TENANT_READINESS_AUDIT.md](./EDU_00_EDUCARE_TENANT_READINESS_AUDIT.md) §11 (EDU-00A–EDU-06 roadmap).  
- Educare architecture decisions accepted at EDU-00 close (one org/tenant, two campuses, verified guardians only in comms audience).

**EDU-00A status:** **IN PROGRESS — NOT CLOSED** (awaiting reconciled delivery SHA and hygiene closure).
