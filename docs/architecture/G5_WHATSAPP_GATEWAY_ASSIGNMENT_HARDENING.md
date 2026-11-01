# G5 — WhatsApp Gateway assignment & release hardening

**Status:** **Implemented in repo** (2026-11-01) — code + tests; feature flags default **off** for strict projection and Firestore assign transactions. **No production Firestore migration** in this release.  
**Depends on:** G1 (registry), G2 (reconciliation), G3 (3699 remediation), G4 (registry-first routing, `primary`)  
**Next after G5:** G6 operational readiness (inbound/outbound **behavior**, not config-only checks)

**Scope restrictions (programme):** Do not modify production Firestore, Railway env, Meta, webhook routing, Client Zero (6157), or Central Motors 3699 allocation without separate explicit approval.

---

## 1. Objective

Ensure every operation that **changes managed number ownership** preserves the platform registry (`platform/whatsapp/numbers`) as the **authoritative allocation** and keeps the tenant integration doc as a **consistent projection**—recoverably, audibly, and safely under concurrency.

G4 made the registry authoritative for **routing**. G5 makes assign/release **worthy of that authority**.

---

## 2. Phase A — Read-only audit findings

### 2.1 Core modules (current behavior)

| Module | Role today | G5 relevance |
|--------|------------|--------------|
| `services/platform/whatsappGatewayRegistry.js` | Normalizes allocation fields; builds assign/release/rollback payloads; appends `allocationHistory` (max 100, in-doc array) | **Existing** history is a start; lacks operationId, outcome, phoneNumberId, structured before/after |
| `services/platform/whatsappNumberPoolService.js` | Inventory CRUD, `assignWhatsAppPoolNumberToCompany`, `releaseWhatsAppPoolNumber`, `ensureEnvSeedNumber` | **Primary** assign/release orchestrator; **no transactions** |
| `services/platform/whatsappGatewayService.js` | G4 inbound/outbound registry enforcement | **Downstream consumer** of assign/release correctness; does not fix bad allocations |
| `services/platform/reconcileWhatsAppPhoneAssignments.js` | Read-only drift detection | **Operational** feedback loop post-G5 |
| `services/tenants/platformWhatsAppIntegrationService.js` | Register/configure/activate/deactivate; Embedded Signup apply; `assertNoCrossTenantActivePhone` | **Projection** layer; can **bypass registry** via direct MC APIs |
| `services/tenants/integrationService.js` | `getWhatsAppIntegration` (first provider match), collection-group phone lookup | **Gap:** non-`whatsapp` doc ids; first-match ordering |
| `services/audit/auditLog.js` | In-memory ring buffer + console | **Not durable**; not a compliance audit trail |

### 2.2 API routes that can change managed WhatsApp state

All require `requirePlatformAccess()` unless noted.

| Route | Effect | Registry aware? |
|-------|--------|-----------------|
| `POST /api/platform/whatsapp-numbers` | Upsert pool/registry row | Yes (inventory only) |
| `POST .../assign-pool-number` | Assign + configure (+ optional activate) | **Yes** (primary path) |
| `POST /api/platform/whatsapp-numbers/:numberId/release` | Release registry + deactivate/clear tenant | **Partial** (order risk) |
| `POST .../integrations/whatsapp/register` | Create pending integration | **No** |
| `PUT/PATCH .../integrations/whatsapp` (configure) | Set `phoneNumberId`, metadata | **No** — can assign phone without pool |
| `POST .../integrations/whatsapp/activate` | Set status `active` | **No** — activates without registry check |
| `POST .../integrations/whatsapp/deactivate` | Status `disconnected` | **No** — can desync from registry |
| `POST .../integrations/whatsapp/sync-client-zero` | Client Zero startup sync | **No** — **frozen** tenant; must not alter in G5 rollout |

**Tenant / portal paths (non–Mission Control):**

| Path | Effect | Registry aware? |
|------|--------|-----------------|
| `services/integrations/metaEmbeddedSignupService.js` → `applyEmbeddedSignupIntegration` | BYO or env phone + optional activate | **No** (BYO must stay outside managed assign rules) |
| Portal `js/portal/whatsappConnect.js` | Embedded Signup UX | Indirect via embedded signup service |

**Scripts / seeds (operator or deploy-time):**

| Path | Effect | Registry aware? |
|------|--------|-----------------|
| `scripts/g3-execute-3699-remediation.mjs` | Deactivate + assign (one-off) | Uses pool assign API |
| `services/storage/seedDemoTenants.js` | `upsertWhatsAppIntegration` + activate | **Bypasses registry** |
| `services/storage/seedCentralMotorsPilot.js` | Same pattern | **Bypasses registry** |
| `services/clientZero/syncWhatsAppIntegration.js` | Configure/activate Client Zero | **Bypasses registry** |

**Conclusion:** Mission Control **assign-pool-number** is the **intended** managed path, but **configure + activate** and **seeds** can still create registry/projection drift. G5 must **narrow** managed mutations without breaking BYO or frozen Client Zero.

### 2.3 Mission Control UI (`js/admin/modules/companies.js`)

Operator flows exposed:

1. Register integration  
2. Configure (phoneNumberId, display, credentialsSource)  
3. Activate / deactivate  
4. Assign pool number (`assignWhatsAppPoolNumber`)  
5. Release pool number (`releaseWhatsAppPoolNumber`)

Steps 2–3 can attach a managed phone **without** going through assign-pool-number—this predates gateway authority and conflicts with G4 `primary` outbound checks for `credentialsSource: env` when a registry row exists.

### 2.4 Assign flow (`assignWhatsAppPoolNumberToCompany`) — existing vs gaps

**Existing (G1):**

1. Validates company, pool row, not `retired`, not assigned to **another** company.  
2. **Writes registry claim first** (`registryPayloadForAssign`) with `leaseId`, optional `operatorId` / `reason`, history event `assigned`.  
3. Registers integration if missing (`credentialsSource` from pool).  
4. On register failure → **registry rollback** (`registryPayloadForAssignRollback`).  
5. Configures tenant `phoneNumberId`; optional activate.  
6. On configure/activate failure → rollback registry **if** assign claimed for this company.

**Gaps:**

| # | Gap | Risk |
|---|-----|------|
| A1 | **No Firestore transaction** on claim | Two concurrent assigns can both read `available` and both write `assigned` (last writer wins) |
| A2 | **No check** for `allocationStatus` `reserved` / `suspended` | Reserved/suspended numbers could be assigned |
| A3 | **No global** “one active phone → one tenant” at assign time beyond `assertNoCrossTenantActivePhone` at configure/activate | Stale duplicate docs (pre-G3 class) could recur via configure path |
| A4 | Rollback restores prior snapshot but **does not undo** tenant configure partial writes | Tenant doc may hold phone while registry available |
| A5 | **Idempotency** absent | Retries may duplicate history entries; no `operationId` |
| A6 | Re-assign same company + same number is allowed without explicit idempotent operation record | OK functionally; audit noise |

### 2.5 Release flow (`releaseWhatsAppPoolNumber`) — existing vs gaps

**Existing:**

1. Resolve pool row by `numberId` or by `companyId` (via `in_use` list).  
2. **Write registry release first** (`registryPayloadForRelease`), history `released`.  
3. If tenant integration matches phone: deactivate if active; clear `phoneNumberId` / display via configure.

**Gaps:**

| # | Gap | Risk |
|---|-----|------|
| R1 | **Registry released before tenant projection** | If step 3 fails, registry `available` but tenant still **active** on that phone → G4 primary may block outbound; inbound legacy fallback may still route |
| R2 | **No verification** that caller intends to release **current** owner (any super-admin can release any number) | Operational mistake or unauthorized release |
| R3 | **No idempotency** on already-released number | Double release appends duplicate history |
| R4 | Does not invalidate phone cache explicitly (deactivate path invalidates) | Stale cache edge case |
| R5 | Meta registration / pool row **retained** (correct) | Requirement met |

### 2.6 Registry upsert (`upsertWhatsAppPoolNumber`)

**Existing:** Blocks changing `phoneNumberId` while `allocationStatus === assigned`.  
**Gap:** Operator can set `allocationStatus` via input merge (`input.allocationStatus ?? baseAllocation`)—potential manual status tampering without lifecycle rules.

### 2.7 Tenant integration guards

**Existing:** `assertNoCrossTenantActivePhone` on register/configure/activate/embedded signup (collection-group active lookup).  
**Gaps:**

- Does not consult **registry** assignment.  
- `getWhatsAppIntegration` returns **first** WhatsApp doc from list—not necessarily doc id `whatsapp`.  
- `upsertWhatsAppIntegration(companyId, config, docId)` in seeds can create **parallel** docs.

### 2.8 Firestore transaction patterns elsewhere

**Existing:** `services/database/firestoreClient.js` → `runAdminFirestoreTransaction()` wrapper; used in marketplace install/review repos.  
**Pool service:** uses plain `read` → `writePoolDoc` **merge**—**not transactional**.

### 2.9 G4 interaction (production)

- **Inbound (`primary`):** Managed …3699 → `central-motors-rtb` via registry.  
- **Client Zero …6157:** Registry miss → legacy fallback (unchanged).  
- **Outbound (`primary`):** Managed sends require registry assign alignment; BYO `tenant` skipped.

G5 must **not regress** these paths; hardening should **reduce** drift that would force fallback or block sends.

---

## 3. Phase B — Required invariants (design target)

| ID | Invariant | Enforced today? | G5 target |
|----|-----------|-----------------|-----------|
| I1 | One active Phone Number ID → at most one tenant | Partial (`assertNoCrossTenantActivePhone`) | **Registry + collection-group check in assign transaction** |
| I2 | One managed number → at most one `assignedCompanyId` | Partial (pre-write read) | **Atomic claim** |
| I3 | Registry allocation ↔ tenant projection agree | Reconciliation read-only | **Assign/release saga + optional strict configure gate** |
| I4 | Assign rejects unavailable, suspended, reserved, retired, assigned-to-other | Partial (retired + other tenant) | **Explicit allocationStatus matrix** |
| I5 | Release verifies current owner | No | **`assignedCompanyId` match** (and optional `companyId` param) |
| I6 | Release does not delete Meta number | Yes | Keep |
| I7 | Failed ops leave no inconsistent state | Partial (assign rollback only) | **Two-phase saga + recovery job** |
| I8 | BYO (`credentialsSource: tenant`) outside managed assign | De facto | **Explicit bypass** in all new guards |
| I9 | Client Zero (`ziricai`, …6157) untouched | Programme | **Denylist + tests**; no sync-client-zero changes without approval |
| I10 | Central Motors …3699 operational | Post-G3 | **Regression tests** only; no prod data edits in G5 |

### 3.1 Managed vs BYO boundary (G5)

| `credentialsSource` | Assign via pool | Registry required for activate/configure? |
|---------------------|-----------------|-------------------------------------------|
| `env` (managed) | **Yes** (target) | **Yes** when `WHATSAPP_GATEWAY_STRICT_PROJECTION=on` |
| `tenant` (BYO) | **No** | **No** — Embedded Signup path unchanged |

---

## 4. Phase C — Concurrency and recovery strategy

### 4.1 Atomic assignment (recommended)

**Pattern:** Single Firestore **transaction** on registry document:

1. `tx.get(platformWhatsAppNumberPath(numberId))`  
2. Verify `allocationStatus ∈ { available }` (and not `retired`).  
3. Verify optional global invariant: no other registry row with same `phoneNumberId` and `assigned` (should be 1:1 doc per phone).  
4. Conditional update: set `assigned`, `assignedCompanyId`, `leaseId`, `operationId`, bump `assignAttempt` or use **create-if-absent lease field** (`claimToken`).  
5. Commit.

If transaction aborts → return `409 NUMBER_NOT_AVAILABLE`.

**Second phase (projection)** — outside transaction (Firestore cross-collection):

1. Configure + activate tenant integration.  
2. On failure → **compensating** registry release using **same `operationId`** marked `failed` + `assign_rollback` history (extend G1 rollback).

**Why not one big transaction:** Tenant integration lives under `companies/{id}/integrations/*`; cross-doc transactions are supported in Firestore but increase contention and document size. **Registry claim in TX + saga** matches existing G1 intent and limits blast radius.

### 4.2 Concurrent assign prevention

| Approach | Notes |
|----------|--------|
| **Registry transaction (recommended)** | Two operators: one wins, one gets `409` |
| Optimistic locking | Add `version` field on registry doc; increment on each write |
| Idempotency key | Client sends `Idempotency-Key` / `operationId`; server returns same result for replay |

### 4.3 Safe release ordering (recommended change)

**Current:** registry release → tenant deactivate/clear (**risk R1**).

**Target saga:**

1. Validate owner (`assignedCompanyId` matches `companyId` or explicit admin override with reason).  
2. **Deactivate + clear tenant projection** (or mark `pending_release` on integration).  
3. **Release registry** to `available`.  
4. If step 3 fails after step 2 → registry still assigned but tenant inactive → **recovery** marks `allocationStatus: suspended` + alert (reconciliation flags).

Alternative (stricter routing): set registry to `suspended` first (G4 treats as assigned/in_use legacy mapping)—blocks new inbound via registry—then clear tenant, then `available`.

### 4.4 Partial failure recovery

| State | Detection | Recovery |
|-------|-----------|----------|
| Registry assigned, tenant missing phone | Reconciliation / G6 probe | Operator assign configure or automated repair job |
| Registry available, tenant active on managed phone | Reconciliation | **Critical** — deactivate tenant or re-claim registry |
| Registry assigned, tenant active **wrong** phone | Reconciliation | Block assign; operator fix |

**Deliverable in G5 code:** `services/platform/whatsappGatewayRecovery.js` (read-only **scan** first; **mutating repair** behind explicit operator API in later approval).

### 4.5 Idempotency

- Every assign/release accepts `operationId` (UUID).  
- Store last successful `operationId` on registry doc or subcollection `platform/whatsapp/operations/{operationId}`.  
- Retry with same id → return cached outcome (HTTP 200/201), no double history spam.

---

## 5. Phase D — Audit history (target schema)

### 5.1 Existing

- `allocationHistory[]` on registry doc: `at`, `action`, `companyId`, `operatorId`, `reason`, `leaseId`.  
- `auditLog()` for API routes: ephemeral, no phone suffix consistency.

### 5.2 G5 target event (assign, release, rollback, failed)

```json
{
  "operationId": "uuid",
  "action": "assigned | released | assign_rollback | release_failed | assign_failed",
  "phoneNumberIdSuffix": "3699",
  "previousAllocationStatus": "available",
  "newAllocationStatus": "assigned",
  "previousCompanyId": null,
  "newCompanyId": "central-motors-rtb",
  "operatorId": "superadmin:uid or api_key",
  "reason": "operator supplied",
  "at": "ISO-8601",
  "outcome": "success | failed | partial",
  "failure": { "code": "...", "message": "..." },
  "recoveryHint": "rollback_applied | manual_reconcile_required"
}
```

**Never store:** `accessToken`, `WHATSAPP_TOKEN`, full phoneNumberId in client-visible API (keep masked in logs/responses).

**Persistence:** Prefer append-only subcollection `platform/whatsapp/numbers/{id}/allocationEvents/{operationId}` for queryability; keep rolling summary on parent doc for MC UI.

---

## 6. Phase E — Proposed implementation (code-only scope)

When G5 implementation is **authorized** (separate from this plan):

| Step | Files (proposed) | Notes |
|------|------------------|-------|
| 1 | `services/platform/whatsappGatewayAssignmentService.js` | Orchestrates assign/release sagas, idempotency, owner checks |
| 2 | Refactor `whatsappNumberPoolService.js` | Thin wrapper calling assignment service |
| 3 | `whatsappGatewayRegistry.js` | Extended history + `operationId`; optional `version` |
| 4 | `platformWhatsAppIntegrationService.js` | Optional gate: managed configure/activate requires registry match when `WHATSAPP_GATEWAY_STRICT_PROJECTION=on` |
| 5 | `api/app.js` | Pass `operationId` from header; release body `{ companyId, reason }` owner check |
| 6 | `js/admin/api.js` + `companies.js` | Surface reason + operation id; discourage raw configure for managed |
| 7 | `test/whatsapp-gateway-assignment.test.mjs` | Memory + mocked transaction tests |
| 8 | `scripts/g5-audit-assignment-paths-readonly.mjs` | CI-safe inventory of routes (extends Phase A) |

**Feature flags (Railway, default off until G5 verification):**

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_GATEWAY_STRICT_PROJECTION` | Block managed configure/activate without registry assign |
| `WHATSAPP_GATEWAY_ASSIGN_TRANSACTIONS` | Enable Firestore TX claim (fallback: current read/write) |

**Explicitly out of G5 code deploy without approval:** seed script changes touching prod tenants, Client Zero sync, Meta, G4 routing mode.

---

## 7. Test plan (automated)

| # | Scenario | Expect |
|---|----------|--------|
| T1 | Successful assign available → assigned | Registry + tenant phone match; history + operationId |
| T2 | Duplicate assign same number two companies | Second `409` |
| T3 | Concurrent assign (simulated parallel TX) | Exactly one winner |
| T4 | Assign suspended/reserved number | `409` |
| T5 | Release by owning tenant context | Registry available; tenant disconnected |
| T6 | Release with wrong `companyId` | `403/409` |
| T7 | Release already available | Idempotent success |
| T8 | Assign fails at configure | Registry rolled back; tenant not active on phone |
| T9 | Release fails at tenant step | Registry **not** available OR suspended + recovery flag |
| T10 | Reconciliation clean for single assign | `registryVsTenantsAligned: true` |
| T11 | BYO configure/activate without registry | Allowed; outbound/inbound BYO paths unchanged |
| T12 | Client Zero company id guards | No assign-pool / strict gate bypass for `ziricai` in tests |
| T13 | Central Motors 3699 fixture | Assign/release integration tests use **mock** ids; no prod mutation |

Existing scripts to extend:

- `scripts/verify-mission-control-whatsapp-integration-mutations.js`  
- `test/whatsapp-gateway-routing.test.mjs` (G4 mode flags)

---

## 8. Acceptance criteria (G5 complete)

1. **Atomic claim:** No two companies can hold the same managed registry assignment under concurrent assign (transaction or equivalent proof in tests).  
2. **Lifecycle:** Assign rejects `reserved`, `suspended`, `retired`, and assigned-to-other; released numbers cannot receive traffic via G4 primary without re-assign.  
3. **Release safety:** Owner verification; Meta pool row retained; tenant deactivated without doc delete.  
4. **Recovery:** Documented saga + rollback for assign; release ordering fixed or compensating suspended state; read-only recovery scan shipped.  
5. **Audit:** Every mutating assign/release writes durable event with operationId, operator, reason, outcome (no secrets).  
6. **BYO / Client Zero:** Tests demonstrate isolation; no programme-mandated prod changes to 6157 or BYO pathways.  
7. **3699 backbone:** Regression tests pass; production allocation unchanged unless separately approved.  
8. **No production deploy** of strict flags until G5 test plan green in CI and operator review.

---

## 9. G6 preview (operational readiness — user direction)

G6 should measure **behavior**, not configuration alone:

| Signal | Meaning |
|--------|---------|
| Inbound probe | Test message or correlated webhook log → **expected** `companyId` |
| Outbound probe | Controlled send → Graph success from **assigned** phoneNumberId |
| Reconciliation | Scheduled G2 report; zero `duplicateActiveRouting` on managed lines |
| Registry vs projection | Aligned for all `assigned` managed numbers |

A number is **“live”** only when G6 probes pass—not when `status: active` alone.

---

## 10. Programme milestones (confirmed ordering)

| Milestone | Objective |
|-----------|-----------|
| **G5** | Harden assignment, release, ownership invariants |
| **G6** | Operational readiness, diagnostics, health monitoring (behavioral) |
| **G7** | Mission Control Gateway management |
| **G8** | Customer Portal managed-number onboarding |
| **G9** | Second-tenant live pilot |
| **G10** | Enterprise BYO WhatsApp |

---

## 11. Document history

| Date | Change |
|------|--------|
| 2026-11-01 | Initial G5 read-only audit and implementation plan (post-G4) |
