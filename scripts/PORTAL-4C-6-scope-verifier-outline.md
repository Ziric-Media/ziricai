# PORTAL-4C-6 — Paid-Pack Entitlement & Fulfillment

**Status:** 4C-6A ✅ closed; 4C-6B ✅ closed; **4C-6C locked** until `PORTAL-4C-6C-grant-authority-outline.md` sign-off  
**Baseline:** PORTAL-4C-5 closed @ `bfacd2f`; production Portal deploy `6aa80b803b851e8f5002d2dd` (pre-commit tree; git record at `bfacd2f`)  
**Depends on (closed, do not rewrite casually):** PORTAL-4C-3 Contact Sales UX, PORTAL-4A / 4A-R1 paid-pack security, PORTAL-4C-2 lifecycle, PORTAL-4C-5 updates (post-install only)

---

## Purpose

Close the **commercial fulfillment gap** for Industry Packs:

```text
Paid pack → Contact Sales → entitlement grant → authorized install → durable installed pack → updates (4C-5)
```

Today the **402 wall** exists, but there is **no durable store** for “this company has been granted access to install this paid pack.” Tenant callers cannot bypass payment; only trusted platform actors can (`demoMode` / `skipPayment` via `resolveMarketplacePaymentBypass`).

**4C-6** adds an **authoritative entitlement layer** and wires **install authorization** to it—without payment processors, without review lifecycle work (4C-4C-3), and without expanding Marketplace scope beyond what the charter accepts.

---

## 4C-6A read-only audit — current architecture (verified)

### Where paid vs free is determined

| Layer | Mechanism |
|-------|-----------|
| **Catalog pricing** | `services/platform/marketplaceTemplate.js` — `PACK_PRICING` map + `pack.price`; `buildPackManifest()` sets `isPaid: price > 0`, `isFree: price === 0`, `priceLabel` `"Paid"` / `"Free"` |
| **Representative packs** | `pack-funeral-ai` → **0** (free); `pack-automotive-ai` → **999** (paid) — used in 4A/4C-3 verifiers |
| **Public catalog** | GET catalog/detail exposes `isPaid` / pricing labels; no entitlement field today |

There is **no** `entitlement`, `packAccess`, or similar symbol in the codebase (grep clean as of 4C-6A audit).

### 402 decision path (install only)

```text
POST /api/marketplace/install
  → requireAuthenticatedTenantMember()
  → checkPermission("canManageStaff")   // owner/manager only; sales/support → 403 before install logic
  → resolveMarketplacePaymentBypass(req, { demoMode, skipPayment })  // strips client bypass for tenants
  → runInstallWizard(..., step: "install")
       → executeInstall()
            → if manifest.isPaid && !demoMode && !skipPayment
                 → return { requiresPayment: true, contactSales: true, ... }  // no Firestore install
  → if result.requiresPayment → HTTP 402 + code PAYMENT_REQUIRED
  → else 201/200 install result
```

**Source of truth for the gate today:** `manifest.isPaid` + **trusted bypass flags only** — not grants.

**Wizard steps:** `preview`, `branding`, `integrations` do **not** run the paid gate in `executeInstall` (only `step: "install"` / default). Paid **preview** remains **200** with full checklist.

**Onboarding side channel:** `onboardingService` industry step **skips** paid pack install (`requiresPayment: true`, message to use Portal); free packs call `runInstallWizard` without bypass. Routed through wizard (4A-R1); no direct `installIndustryPack` bypass in onboarding.

**Post-install updates:** `POST /api/marketplace/update` (4C-1/4C-5) does **not** re-check paid status; eligibility is **installed registry + version engine**. 4C-6 should **not** require re-payment for updates on an already-installed pack unless product explicitly demands it (recommend: **no** for v1).

### Payment bypass rules (existing — must remain unless charter amends)

| Actor | `allowMarketplacePaymentBypass` | Body `demoMode` / `skipPayment` honored? | Effect on paid install |
|-------|----------------------------------|------------------------------------------|-------------------------|
| **Unauthenticated** | N/A | N/A | **401** (route auth) |
| **Tenant member** (incl. owner) | **false** | **Forced false** | **402** on install |
| **Wrong tenant** | N/A | N/A | **403** (tenant middleware) |
| **Role without `canManageStaff`** | N/A | N/A | **403** (install route) |
| **Superadmin session** | **true** | **Yes** (per body) | Can install paid if `demoMode` or `skipPayment` true |
| **Platform API key** (`PLATFORM_API_KEY`, `x-platform-api-key` / Bearer) | **true** | **Yes** (same resolver) | Same as superadmin for bypass flags |

**Portal client:** `js/portal/api.js` does **not** send `demoMode: true` (4A static). Install uses wizard steps only.

**Important messaging debt:** `executeInstall` return message references “enable demo mode” for tenants — **misleading** today because tenants cannot enable it. 4C-6 Portal copy should pivot to **entitlement granted** / Contact Sales.

### Portal UX today (4C-3 — closed)

| State | Behavior |
|-------|----------|
| **Paid, not installed** | Catalog card: Contact Sales + Preview; catalog detail: Contact Sales + Preview; wizard step 1: paid notice + Contact Sales; primary install CTA not offered on card footer |
| **402 on install attempt** | `installErrorMessage` → payment / contact sales copy; `renderPaymentRequiredPanel` with mailto via `buildIndustryPackAccessMailto` (`js/shared/marketplaceSalesContact.js`) |
| **After install** | Same lifecycle/update/review surfaces as free packs |
| **Entitlement status** | **None** — UI infers only from install/lifecycle maps and `isPaid` |

Contact Sales remains the **pre-grant CTA**; 4C-6 should keep it until grant, then shift to **Install** without implying payment bypass.

---

## Install decision table

### Verified today (must stay true or be explicitly changed in 4C-6 charter amendments)

| Scenario | HTTP / outcome | Evidence |
|----------|----------------|----------|
| Free pack + authenticated tenant member + `canManageStaff` + install | **201** (or 200 if already installed) | 4A live, 4C-1 acceptance |
| Free pack + preview step | **200** | Wizard `previewPackForCustomer` |
| Paid pack + same member + install (no bypass) | **402** `PAYMENT_REQUIRED` | 4A J, 4A-R1 A–C, 4C-3 service |
| Paid pack + tenant body `demoMode: true` | **402** (bypass stripped) | 4A, 4A-R1 C |
| Paid pack + tenant body `skipPayment: true` | **402** (bypass stripped) | 4C-3 unit |
| Paid pack + preview | **200** | 4C-3 paid preview |
| Unauthenticated install | **401** | 4A D, 4A-R1 E |
| Wrong-tenant member install/read | **403** | 4A G, 4A-R1 F |
| Viewer / sales (no `canManageStaff`) install | **403** | 4A permission matrix |
| Superadmin + trusted `demoMode` / `skipPayment` | **Install allowed** (bypass) | 4A-R1 unit |
| Platform API key + bypass flags in body | **Allowed** (resolver; no dedicated live matrix in 4A-R1) | `marketplaceAuth.js` + `hasPlatformApiKeyAccess` |
| Onboarding industry step + paid pack | **Skipped** (no install) | `onboardingService.js` |
| Pack update after install (paid or free) | **200** if version valid; **not** gated by 402 | 4C-1 engine |

### Target semantics after 4C-6 (proposal — implement in 6C/6D)

| Scenario | Target outcome |
|----------|----------------|
| Free pack + authorized member | **Allow** install (unchanged) |
| Paid pack + **active entitlement** + authorized member | **Allow** install (**without** tenant `skipPayment`) |
| Paid pack + **no entitlement** | **402** (keep `PAYMENT_REQUIRED` or add specific `ENTITLEMENT_REQUIRED` — decide in 6B) |
| Paid pack + **revoked** entitlement | **402** |
| Paid pack + **expired** entitlement (if v1 supports expiry) | **402** |
| Tenant `demoMode` / `skipPayment` in body | **Must not bypass** (4A contract) |
| Superadmin / platform API key | **Existing bypass policy only** — entitlement grant is the **normal** tenant path; bypass remains break-glass |
| Wrong tenant / unauthenticated | **403** / **401** (unchanged) |

**Open product decision (resolve before 6B):** Should superadmin/platform bypass **also** write an entitlement record for audit parity, or continue to allow “silent” installs with bypass only?

---

## Proposed entitlement model (4C-6B design target — not implemented)

### Relationship

```text
companyId + packId (canonical) → entitlement document (0..1 active grant per pair for v1)
```

Align pack IDs with `resolvePackId` / `resolveCanonicalPackId` used by install registry.

### Storage (recommendation)

**Firestore-backed**, tenant-scoped collection (mirrors install registry pattern):

```text
companies/{companyId}/marketplaceEntitlements/{packId}
```

Alternative considered: platform-global collection keyed by composite id — **reject for v1** unless cross-tenant ops queries dominate (Admin list-by-company is natural on tenant subcollection).

### Suggested fields (v1)

| Field | Purpose |
|-------|---------|
| `companyId`, `packId` | Identity (redundant on doc path but useful for indexes/export) |
| `status` | `active` \| `revoked` \| `expired` (or derive expired from `expiresAt`) |
| `grantedAt` | ISO timestamp |
| `grantedBy` | `{ uid, email?, source: 'admin' \| 'platform_api' \| 'script' }` |
| `expiresAt` | **nullable** — null = perpetual (recommend default for v1 sales motion) |
| `revokedAt`, `revokedBy`, `revokeReason` | Optional audit |
| `salesReference` | Optional opaque string (PO, deal id, manual note) |
| `updatedAt` | Mutation tracking |

**Not in v1:** payment intent ids, Stripe customer, partial entitlements (feature flags), multi-seat licensing.

### Lifecycle

```text
(none) → active → revoked | expired
         ↑ grant (idempotent upsert to active)
```

**Install consumption:** `active` + (`expiresAt` null OR `expiresAt` > now) → treat as **entitled**. Revoked/expired/missing → paid gate.

**Idempotency:** Re-grant same company+pack → refresh metadata, stay active (support corrections).

---

## Grant authority (operational workflow)

### Problem statement

A beautiful entitlement collection is useless without a **defined grant path**. Minimum viable operations:

| Path | Description | 4C-6 priority |
|------|-------------|---------------|
| **A. Platform ops API** | Authenticated `PLATFORM_API_KEY` or superadmin-only route: `POST /api/platform/marketplace/entitlements` (name TBD) | **High** — automatable, auditable, no Admin UI required for first production grants |
| **B. Admin Console UI** | Superadmin selects company + pack → Grant / Revoke | **Medium** — charter allows only if deemed essential; otherwise defer to 6E+ |
| **C. One-off script** | Railway Admin script (pattern: `provision-portal-4b-disposable-acceptance-actor.mjs`) for support | **High for acceptance** — disposable tenant grants in 6E |
| **D. Manual Firestore** | Direct Admin SDK edits | **Break-glass only** — document but not primary workflow |

**Recommended v1:** **A + C** for implementation/acceptance; **B** only if product insists ops cannot use API/script.

### Authorization matrix (grant/revoke — proposal)

| Action | Superadmin session | Platform API key | Tenant owner | Tenant manager |
|--------|-------------------|------------------|--------------|----------------|
| Grant entitlement | **Allow** (if route exists) | **Allow** | **Deny** | **Deny** |
| Revoke entitlement | **Allow** | **Allow** | **Deny** | **Deny** |
| Read own entitlements (Portal) | N/A | N/A | **Allow** (read-only list for UX) | **Allow** or read via install eligibility only |

Tenants must **never** self-grant via POST body flags.

### Audit trail

- Persist `grantedBy` / `revokedBy` on entitlement doc.
- Emit platform audit log entry (pattern: existing `auditLog` usage in `platformAuth.js`) on grant/revoke.
- 4C-6 verifier: static proof that tenant install path cannot mutate entitlements.

---

## 4A / 4A-R1 / 4C-3 regression contract

These assertions **must continue to pass** after 4C-6, except where an explicit charter amendment adds **new** tests for entitled install (disposable tenant).

### `verify-portal-4a-marketplace-auth.js`

- Install route uses `resolveMarketplacePaymentBypass`; no client-only demoMode gate in route body logic.
- Portal does not force `demoMode: true`.
- Live: paid install → **402** without bypass; tenant `demoMode: true` → still **402**.
- `canManageStaff`: owner/manager only.

### `verify-portal-4a-r1-marketplace-security.js`

- Tenant `resolveMarketplacePaymentBypass` → `{ demoMode: false, skipPayment: false }`.
- Superadmin bypass honored.
- Onboarding install side-channel remediated.
- Live matrix: paid → **402** for RTB owner token (Central Motors — **read-only** in acceptance; do not mutate RTB for entitlement tests).

### `verify-portal-4c-3-marketplace-payment-ux.js`

- Contact Sales helper centralized; no checkout providers in Portal.
- Paid preview allowed; paid install `requiresPayment` at service layer.
- **`marketplaceAuth.js` behavior frozen** unless 4C-6 explicitly extends resolver (prefer: add entitlement check **before** bypass, not weakening bypass).

### Nested regressions (from 4C-3 / 4C-5 chains)

- 4B registry, 4C-1 update, 4C-2 lifecycle, 4C-4C-2 review submit — **no paid-gate changes** on update/review routes.

### Conflicts to resolve in 6B design

| Current assumption | Entitlement system impact |
|--------------------|---------------------------|
| Paid install **always 402** for tenant | Must add **402 → 201** path when entitlement active |
| No GET for “can I install?” | Portal may need **`GET .../entitlements`** or enriched lifecycle/pack detail with `installEligible` |
| `skipPayment` only for platform | Tenant path should use **entitlement**, not rename `skipPayment` in client |

---

## Portal UX direction (4C-6D — proposal)

| Phase | UX |
|-------|-----|
| **Before grant** | Unchanged 4C-3: Contact Sales + Preview; honest 402 panel on install retry |
| **After grant (not installed)** | Show **Install** (same as free) on card/detail; optional subtle “Access granted” badge sourced from **GET entitlement or install-eligibility API** — not localStorage |
| **After install** | Unchanged lifecycle/updates/reviews |
| **Revoked after install** | **Do not uninstall** in v1; block **new** installs/reinstalls only (charter default — confirm in 6B) |

Prefer **install eligibility from API** over a dedicated “Entitlements” page for v1.

---

## Explicit non-goals (4C-6)

- Stripe, PayFast, Paystack, Flutterwave, or any checkout / payment capture
- Invoice generation or billing plan linkage (Enterprise billing stays separate)
- PORTAL-4C-4C-3 (reviews/mine, edit/delete, moderation, Admin review tools)
- Admin Marketplace **pack update apply** (4C-5 deferred Admin scope)
- Rewriting 4C-1 update engine or version catalog
- Automatic uninstall on revoke
- Tenant self-service purchase
- Git push / production deploy (unless separately authorized per sub-gate)
- **Implementation during 4C-6A** (this document only)

---

## Sub-gate chain (proposed)

```text
4C-6A — Charter + read-only audit (this document) ✅
   ↓
4C-6B — Entitlement persistence + repository + read API ✅
   ↓
4C-6C — Grant/write authority — see `PORTAL-4C-6C-grant-authority-outline.md` (6C-A…6C-E); **install hook still frozen inside 6C**
   ↓
4C-6D — Install authorization integration (executeInstall + 402 semantics) — **separate authorization after 6C CLOSED**
   ↓
4C-6E — Portal UX (post-grant install) + production acceptance (disposable tenant; not RTB)
   ↓
4C-6 CLOSED
```

Optional **4C-6F** later: Admin UI grant panel — only if 6C API is insufficient for ops.

Each sub-gate: focused commit when user authorizes commits; extend `verify-portal-4c-6-*` without breaking 4A/R1/4C-3/4C-5.

---

## Anticipated touchpoints (implementation reference — do not edit in 6A)

| Path | Role |
|------|------|
| `services/platform/marketplaceEntitlementRepository.js` (new) | Firestore CRUD + status |
| `services/platform/marketplaceEntitlementService.js` (new) | Grant/revoke/check |
| `services/platform/marketplaceInstaller.js` | `executeInstall` — entitlement check alongside `isPaid` |
| `services/platform/marketplaceAuth.js` | Keep bypass; document interaction with entitlement |
| `api/app.js` | Install route; new platform/tenant entitlement routes |
| `services/database/schema.js` | Path helpers for entitlements collection |
| `js/portal/api.js` | Optional `fetchPackEntitlements` / eligibility |
| `js/portal/modules/marketplace.js` | Post-grant Install CTA |
| `js/shared/marketplaceSalesContact.js` | Unchanged mailto; still pre-grant |
| `scripts/verify-portal-4c-6-marketplace-entitlement.js` (new) | Static + memory behavioral |
| `scripts/verify-portal-4c-6-production-acceptance.mjs` (new) | Disposable grant → install → lifecycle |
| `package.json` | `verify:portal-4c-6-*` scripts |

**Do not modify in early sub-gates:** review services, update engine, Central Motors production data.

---

## Verifier contract (`verify-portal-4c-6-marketplace-entitlement.js` — outline)

**Environment:** `STORAGE_BACKEND=memory` for unit sections; Firestore Admin for repository integration tests (optional leaf).

### Static — security

- Tenant install path cannot set `skipPayment`/`demoMode` via body (4A regression grep preserved).
- No Stripe/checkout strings in Portal module.
- Grant routes require platform/superadmin auth — not `requireAuthenticatedTenantMember` alone.

### Static — install integration (6D+)

- `executeInstall` (or dedicated helper) references entitlement check for paid packs.
- 402 response still includes honest `PAYMENT_REQUIRED` or documented successor code when not entitled.

### Behavioral — memory

- Grant → active → install succeeds for paid pack (memory adapter).
- Revoke → install returns requiresPayment/402 equivalent.
- Free pack unaffected.

### Regressions (nested)

- `verify-portal-4a-marketplace-auth.js`
- `verify-portal-4a-r1-marketplace-security.js`
- `verify-portal-4c-3-marketplace-payment-ux.js`
- `verify-portal-4c-2-marketplace-lifecycle.js`
- `verify-portal-4c-5-marketplace-pack-update-ux.js`
- `verify-portal-4c-4c-2-marketplace-review-submit.js`

---

## Production acceptance (4C-6E) — outline

**Tenant:** Disposable company (`provision-portal-4b-disposable-acceptance-actor.mjs` pattern); **never** Central Motors / RTB for grant/install mutations.

**Matrix (minimum):**

| Step | Check |
|------|--------|
| 1 | Paid pack install **402** without entitlement (same-origin `/api` on `app.ziricai.com`) |
| 2 | Grant entitlement via **6C ops path** (script or platform API) |
| 3 | GET eligibility/entitlements reflects **active** |
| 4 | Portal shows install path (static or browser supplement) |
| 5 | POST install → **201**; lifecycle **installed** |
| 6 | 4C-5-style update still works if version published (optional same tenant) |
| 7 | Revoke entitlement → **new** install blocked **402**; existing install remains |
| 8 | Tenant cannot grant self; wrong tenant **403** |
| 9 | Reviews regression smoke (GET public reviews) |
| 10 | Deployed bundle contains entitlement wiring markers |

**Evidence:** `test-results/portal-4c-6-production-acceptance.json` (untracked artifact pattern).

**Credentials:** `test-results/portal-4c6-disposable-credentials.json` (pattern from 4C-5).

---

## Open decisions (resolve before authorizing 4C-6B)

1. **HTTP code for “not entitled”** — keep `402` + `PAYMENT_REQUIRED` vs introduce `ENTITLEMENT_REQUIRED` (client mapping in Portal).
2. **Expiry in v1** — recommend optional `expiresAt`; default perpetual.
3. **Grant surface for v1** — API + script vs mandatory Admin UI.
4. **Superadmin bypass vs entitlement record** — break-glass only or always mirror grant in Firestore.
5. **Reinstall after revoke** — block only (recommended) vs soft-warning.
6. **Entitlement read API shape** — dedicated collection GET vs augment `GET /api/marketplace/lifecycle` or pack detail with `installEligible`.

---

## Acceptance criteria for 4C-6 CLOSED

- All sub-gates 6B–6E complete; verifiers green locally.
- Production: disposable tenant demonstrates grant → install → lifecycle; RTB untouched.
- 4A/R1 paid-pack security intact for **non-entitled** tenants.
- No checkout, no 4C-4C-3, no review engine changes.
- Operational grant path documented and exercised in acceptance.

---

*Document version: 4C-6A — charter only; no code changes. Review before authorizing 4C-6B.*
