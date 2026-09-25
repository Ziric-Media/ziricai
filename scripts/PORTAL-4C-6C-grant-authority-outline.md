# PORTAL-4C-6C — Grant / Write Authority

**Status:** 4C-6C-A (grant authority contract) — **this document**; **no implementation authorized** until sign-off  
**Baseline:** 4C-6B closed (entitlement persistence + tenant GET read); install hook **frozen** (`marketplaceInstaller.js` not entitlement-aware)  
**Parent charter:** `scripts/PORTAL-4C-6-scope-verifier-outline.md`

---

## Purpose

Introduce **controlled write authority** for Marketplace pack entitlements: who may grant, revoke, and audit access—**without** yet changing paid-pack install authorization (402 / `requiresPayment`).

6B proved entitlements can exist **without** becoming an install bypass. 6C must preserve that invariant until a **separately authorized** install-integration gate.

```text
6B (CLOSED) — read + durable store
6C (THIS GATE) — grant / revoke / audit (platform ops only)
6? (LOCKED)   — entitlement-aware install (402 → allow when entitled)
6? (LOCKED)   — Portal UX after grant (Install CTA)
```

---

## Closed foundation (6B — do not rewrite)

| Asset | Role |
|-------|------|
| `companies/{companyId}/marketplaceEntitlements/{packId}` | Authoritative doc path |
| `buildMarketplaceEntitlementRecord` / effective status | `active` \| `revoked` \| `expired` (+ `none` on read) |
| `toTenantEntitlementView` | Tenant DTO — **no** `grantedBy`, `salesReference`, `revokeReason` |
| `GET /api/marketplace/entitlements/:companyId[/:packId]` | Tenant read; `requireAuthenticatedTenantMember()` |
| `repository.saveEntitlement()` | Internal/test today — **not** HTTP in 6B |

**Critical invariant (must hold through all of 6C):**  
`runInstallWizard(..., step: "install")` on a paid pack **still** returns `requiresPayment: true` for tenant callers until the **install-integration gate** is explicitly authorized.

---

## 4C-6C-A — Grant authority contract (sign-off decisions)

The following are **proposals for product/security approval** before 6C-B implementation. Where “Recommendation” appears, that is the default if the user accepts the charter as-is.

### 1. Grant surface (v1)

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **Platform ops API** | `POST`/`PATCH`/`DELETE` under `/api/platform/...` with `requirePlatformAccess()` | **Required in 6C-B** |
| **Acceptance script** | Railway Admin script calling service layer or ops API (disposable tenants) | **Required for 6C-E** |
| **Admin Console UI** | Superadmin form: company + pack → Grant/Revoke | **Defer** unless ops cannot use API/script in v1 |

Tenants **must not** receive grant/revoke routes on `/api/marketplace/*`.

### 2. Who may grant / revoke

| Actor | Grant | Revoke | Read any tenant entitlement |
|-------|-------|--------|------------------------------|
| **Unauthenticated** | Deny | Deny | Deny |
| **Tenant member** (any role) | Deny | Deny | Own company only (existing GET) |
| **Superadmin session** | **Allow** | **Allow** | Allow (ops/debug; not Portal) |
| **Platform API key** | **Allow** | **Allow** | Allow |

**Recommendation:** Mirror existing trusted bypass trust model (`marketplaceAuth.js` / `platformAuth.js`) — same actors that may set `skipPayment`, but **writes go through entitlement service** with audit, not install-body flags.

**Explicit deny:** Tenant owner/manager cannot grant self or peers via Portal.

### 3. Superadmin bypass vs entitlement record

| Policy | Behavior | Recommendation |
|--------|----------|----------------|
| **A — Break-glass only** | Superadmin/API may still use `demoMode`/`skipPayment` on install **without** entitlement doc | Keep 4A behavior; grants are **normal** fulfillment path |
| **B — Mirror every install** | Bypass installs also write entitlement | Heavier audit; defer unless compliance requires |

**Recommendation: Policy A for v1.**  
Entitlement records represent **sales-approved access**; bypass remains exceptional (support/engineering), unchanged from 4A-R1.

### 4. Entitlement lifecycle (v1)

| Transition | Trigger | Stored `status` | Tenant read `entitled` |
|------------|---------|-----------------|------------------------|
| **Grant** | Ops grant API/script | `active` | `true` (if not expired) |
| **Revoke** | Ops revoke API/script | `revoked` | `false` |
| **Expire** | `expiresAt` in the past | effective `expired` | `false` |
| **Re-grant** | Grant on revoked/expired doc | `active` (merge/overwrite fields) | `true` |

**Recommendation:** Support optional `expiresAt` on grant (null = perpetual). No automatic uninstall when revoked (installed packs stay; block **new** install/reinstall only — unchanged from 6A).

**Idempotency:** Grant same `companyId`+`packId` twice → upsert to `active`, refresh metadata, same doc id.

### 5. Not-entitled / install HTTP semantics (decision for *install gate*, document now)

Install hook is **out of scope for 6C**, but grant charter should fix the target for the later gate:

| Condition | Recommended install outcome (future gate) |
|-----------|-------------------------------------------|
| Free pack | Allow (unchanged) |
| Paid + active entitlement | Allow (no tenant `skipPayment`) |
| Paid + no / revoked / expired entitlement | **402** |
| HTTP `code` | **Recommendation:** keep `PAYMENT_REQUIRED` for tenant UX continuity **or** add `ENTITLEMENT_REQUIRED` with Portal mapping — decide at install gate; 6C grants do not change install yet |

### 6. Audit requirements (6C writes)

Every grant/revoke via ops API must:

| Field | Requirement |
|-------|-------------|
| `grantedBy` / `revokedBy` | `{ uid?, email?, source: 'platform_api' \| 'superadmin' \| 'script' }` |
| `updatedAt` | ISO timestamp |
| Platform audit log | `auditLog()` entry: action, `companyId`, `packId`, actor, optional `salesReference` |
| Response to ops | May return full record including internal fields |
| Tenant GET | **Unchanged** — still stripped DTO |

**Recommendation:** Require non-empty `salesReference` or `reason` on grant for production ops (verifier can enforce in 6C-D for API path; script passes explicit marker).

---

## Authorization matrix (grant/revoke — target for 6C-B)

```text
POST   /api/platform/marketplace/entitlements          → grant (upsert active)
PATCH  /api/platform/marketplace/entitlements/:companyId/:packId → revoke | extend expiry (subset)
DELETE /api/platform/marketplace/entitlements/:companyId/:packId → revoke (soft: status=revoked)
```

Exact paths and verbs are **implementation detail**; verifier must prove:

- Routes use **`requirePlatformAccess()`** (or stricter), **not** `requireAuthenticatedTenantMember()` alone.
- Body validates `companyId`, `packId` (canonicalized via `resolvePackId`).
- No route under `/api/marketplace/` accepts grant/revoke from tenants.

---

## Sub-gate chain (4C-6C)

```text
4C-6C-A — Grant authority contract (this document) — sign-off before code
   ↓
4C-6C-B — Write API / ops surface (platform-only grant + revoke)
   ↓
4C-6C-C — Revocation + lifecycle (expiry, re-grant, idempotency proofs)
   ↓
4C-6C-D — Security + regression verification (extend verify-portal-4c-6-*)
   ↓
4C-6C-E — Production acceptance (grant disposable tenant → GET shows entitled; install STILL 402)
   ↓
4C-6C CLOSED
```

**After 4C-6C CLOSED** (separate authorization):

```text
4C-6D (or renamed) — Install authorization integration (executeInstall + 402 semantics)
4C-6E (or renamed) — Portal UX (Install after grant) + end-to-end acceptance
```

Naming aligns with parent doc; renumber only if user prefers strict 6C/6D/6E/6F sequence at program level.

---

## 4C-6C scope boundaries

### In scope (6C-B through 6C-E)

- Platform/superadmin **grant** and **revoke** (and optional expiry update)
- `marketplaceEntitlementService` write layer (uses existing repository `saveEntitlement`)
- Ops API routes + route registry entries
- Audit logging on writes
- Verifier: tenant **cannot** POST grant; grant → GET tenant read shows `entitled: true`; **install still requiresPayment**
- Production acceptance: disposable tenant grant; **no RTB mutation**; install remains 402

### Out of scope (locked until separate gates)

- **`marketplaceInstaller.js` / 402 decision changes**
- Portal Install CTA / entitlement badge UX
- Stripe / checkout / payment capture
- 4C-4C-3 reviews
- Admin Console UI (unless explicitly added in 6C sign-off amendment)
- Tenant self-grant
- Git push / deploy (unless authorized per sub-gate)

---

## Anticipated touchpoints (6C implementation reference)

| Path | Role |
|------|------|
| `services/platform/marketplaceEntitlementService.js` (new) | `grantEntitlement`, `revokeEntitlement` |
| `services/platform/marketplaceEntitlementRepository.js` | Already has `saveEntitlement` |
| `api/app.js` | Platform routes only |
| `services/api/routeRegistry.js` | Platform entitlement mutations |
| `services/audit/auditLog.js` | Grant/revoke events |
| `scripts/provision-portal-4c6-grant-acceptance.mjs` (new, 6C-E) | Disposable grant helper |
| `scripts/verify-portal-4c-6-marketplace-entitlement.js` | Extend 6C sections |

**Do not modify in 6C:** `marketplaceInstaller.js`, `marketplaceAuth.js` (unless audit-only import), review/update engines.

---

## Verifier contract extensions (6C-D)

Extend `verify-portal-4c-6-marketplace-entitlement.js`:

### Static — write surface

- Platform grant/revoke routes exist; `requirePlatformAccess` on each.
- No `app.post('/api/marketplace/entitlements` for tenants.
- `marketplaceInstaller` still `doesNotMatch` entitlement install wiring.

### Behavioral — memory

- Platform grant → repository active → tenant GET `entitled: true`.
- Tenant attempt to call grant handler → 401/403.
- After grant, **paid install still `requiresPayment: true`** (6B invariant).
- Revoke → GET `entitled: false`; install still blocked.
- Re-grant idempotent.
- Expired `expiresAt` → effective not entitled.

### Regressions

- `verify-portal-4a-marketplace-auth.js`
- `verify-portal-4a-r1-marketplace-security.js`
- `verify-portal-4c-3-marketplace-payment-ux.js`
- 4C-6B read tests remain green

---

## Production acceptance (4C-6C-E) — outline

| Step | Check |
|------|--------|
| 1 | Disposable company; paid pack install → **402** (unchanged) |
| 2 | Grant entitlement via **ops API or script** (not tenant) |
| 3 | Tenant GET entitlements → `active`, `entitled: true` |
| 4 | **Install still 402** (proves 6C did not wire install) |
| 5 | Revoke → GET `entitled: false` |
| 6 | Audit log or doc fields present server-side (evidence JSON) |
| 7 | RTB / Central Motors not used for grant mutation |

**Evidence:** `test-results/portal-4c-6c-production-acceptance.json`

---

## Acceptance criteria for 4C-6C CLOSED

- Sign-off decisions in §4C-6C-A accepted (or amended inline in this doc).
- Ops grant/revoke works in production for disposable tenant.
- Tenant isolation and 6B read contract unchanged.
- **Install path unchanged** — 402 matrix still passes for non-entitled **and** entitled tenants until install gate.
- Verifiers green; no push unless authorized.

---

## Sign-off checklist (user)

Before authorizing **4C-6C-B** implementation, confirm:

- [ ] Grant surface: platform API + script (Admin UI deferred?)  
- [ ] Grant actors: superadmin + platform API key only  
- [ ] Bypass policy A (break-glass without mandatory entitlement mirror)  
- [ ] Lifecycle: perpetual default + optional `expiresAt`; revoke soft; no uninstall on revoke  
- [ ] Audit: `grantedBy`/`revokedBy` + `auditLog`; optional required `salesReference` on grant  
- [ ] Install gate deferred; 6C-E must assert install still 402 after grant  

---

*Document version: 4C-6C-A — grant authority contract only; no code changes.*
