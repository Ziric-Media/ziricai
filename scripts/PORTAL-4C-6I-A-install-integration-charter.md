# PORTAL-4C-6I-A — Entitlement-Aware Install Authorization (charter)

**Status:** Read-only charter — **no implementation authorized** until sign-off  
**Parent program:** PORTAL-4C-6 Entitlement Foundation — **CLOSED** (6A → 6E)  
**Risk class:** **High** — modifies paid-pack install authorization (`executeInstall` / HTTP 402). Higher risk than grant/revoke/read.

---

## Purpose

Define **how paid-pack installation** consults the **existing entitlement layer** without weakening 4A / 4A-R1 bypass discipline or tenant isolation.

4C-6 deliberately built entitlement **management** with install **frozen**. This gate decides the **install authorization contract** before any change to `marketplaceInstaller.js`, Portal UX, or payment flows.

```text
CLOSED (4C-6)     grant / read / revoke / expiry / audit on Firestore
THIS CHARTER      how executeInstall uses entitlement + bypass precedence
FUTURE (6I-*)     implement → verify → production acceptance → optional Portal UX
```

---

## Closed foundation (do not rewrite)

| Asset | Role |
|-------|------|
| `companies/{companyId}/marketplaceEntitlements/{packId}` | Authoritative entitlement doc |
| `resolveEntitlementEffectiveStatus()` | `none` \| `active` \| `revoked` \| `expired` |
| `isEntitlementInstallEligible()` | **Proposal:** `effective === 'active'` (same as tenant `entitled`) |
| `toTenantEntitlementView()` | Tenant GET; audit fields stripped |
| Platform grant/revoke/expiry | `/api/platform/marketplace/entitlements*` + `requirePlatformAccess()` |
| `resolveMarketplacePaymentBypass()` | Trusted break-glass only (superadmin / platform API key) |
| `executeInstall()` today | `manifest.isPaid && !demoMode && !skipPayment` → `requiresPayment: true` (no entitlement read) |

**6C-E production evidence (accepted):** lifecycle on production Firestore + **live HTTP install still 402** after grant, expiry, revoke.

**Deployment-alignment (not install integration):** Entitlement **HTTP** routes (6B/C) may be undeployed on Railway. Re-run `verify-portal-4c-6c-e-production-acceptance.mjs` after deploy; expect `acceptanceMode: production_http_entitlements_and_install`. That is **not** permission to change the installer.

---

## Target behavior (must be proven after implementation)

| Scenario | Install outcome |
|----------|-----------------|
| Free pack + authorized tenant installer | **Allow** (unchanged) |
| Paid + **no** entitlement doc | **402** |
| Paid + **revoked** | **402** |
| Paid + **expired** (time) | **402** |
| Paid + **active** entitlement + authorized tenant | **Allow** (no tenant `skipPayment` / `demoMode`) |
| Tenant body `demoMode` / `skipPayment` | **Never trusted** — **402** unless entitlement active |
| Superadmin / platform API key + trusted bypass flags | **Allow** per **Policy A** (break-glass **without** entitlement doc) |
| Unauthenticated / wrong tenant / no `canManageStaff` | **401** / **403** (unchanged) |
| Paid preview / branding / integrations steps | **No install gate change** (install step only) |

---

## 6I-A decisions for sign-off

### 1. Where entitlement is consulted

**Recommendation:** Single decision point inside `executeInstall()` (or a dedicated helper called only from there and from the same code path `runInstallWizard` uses for `step: "install"`).

- **Do not** duplicate entitlement checks in Portal JS.
- **Do not** accept entitlement hints from request body or query.
- **Read** entitlement server-side: `getMarketplaceEntitlementRepository().getEntitlement(companyId, resolvePackId(packId))` then `isEntitlementInstallEligible(record)`.

**Onboarding:** Paid industry step remains “use Portal”; if onboarding ever calls install, same helper applies (no side channel).

**Updates:** `POST /api/marketplace/update` remains **not** gated by entitlement re-check (4C-5 / 4C-1 contract).

### 2. Effective entitlement (install-eligible)

Reuse 4C-6 model — **no second definition**:

| Stored / effective | Install-eligible? |
|--------------------|-------------------|
| Doc missing | **No** (`none`) |
| `status: active`, `expiresAt` null or future | **Yes** |
| `status: active`, `expiresAt` in past | **No** (effective `expired`) |
| `status: revoked` | **No** |
| `status: expired` (if ever stored) | **No** |

Tenant GET `entitled: true` must align with install-eligible for the same doc (no drift).

### 3. Precedence (evaluation order)

For **paid** packs at install time:

```text
1. Free manifest (price 0)     → allow install (skip entitlement)
2. Trusted bypass              → allow if resolveMarketplacePaymentBypass → demoMode/skipPayment true
   (superadmin session OR platform API key ONLY)
3. Entitlement install-eligible → allow
4. Otherwise                   → requiresPayment / 402
```

**Policy A (accepted in 6C-A):** Break-glass bypass does **not** require an entitlement doc and does **not** auto-create one.

**Explicit:** Tenant-supplied bypass flags are stripped **before** precedence step 2 (existing 4A-R1).

### 4. HTTP semantics (tenant install route)

Route unchanged: `POST /api/marketplace/install` with `step: "install"`.

| Condition | HTTP | `code` (proposal) | `requiresPayment` |
|-----------|------|-------------------|-------------------|
| Not entitled / none / revoked / expired | **402** | **`PAYMENT_REQUIRED`** (default) **or** `ENTITLEMENT_REQUIRED` | **true** |
| Entitled active | **201/200** | — | — |
| Free | **201/200** | — | — |

**Recommendation for v1:** Keep **`PAYMENT_REQUIRED`** for all tenant 402 cases to avoid Portal churn; optional **`ENTITLEMENT_REQUIRED`** sub-code in JSON body for future UX (decide at sign-off).

**Contact Sales:** Remain **true** on 402 when pack is paid and install blocked for commercial reasons.

**Message copy:** Replace misleading “enable demo mode” tenant string with entitlement / Contact Sales language (Portal charter sub-gate).

### 5. Re-read immediately before install

**Recommendation:** **Yes** — read entitlement **once** at the start of `executeInstall` for paid packs (after bypass resolution), immediately before proceeding to `installIndustryPack`.

- Not a Firestore transaction with install claim unless concurrency testing demands it (see §6).
- If read fails (repository unavailable): **503** or fail closed **402** — **recommend fail closed 402** with log + `ENTITLEMENT_REPOSITORY_UNAVAILABLE` for ops (charter pick).

### 6. Concurrency / races

| Race | Recommended behavior |
|------|----------------------|
| Grant then install (happy path) | Install sees active doc |
| Revoke between read and install | **Recommendation:** single read at install start; if revoked/expired at read → **402**. Accept small TOCTOU window for v1; document for 6I-D tests |
| Two concurrent installs same pack | Existing install registry / `INSTALL_IN_PROGRESS` unchanged |
| Entitlement consumed on install? | **No** — entitlement is **reusable** (supports reinstall after uninstall if product allows reinstall) |

**No “consume entitlement” flag** in v1 unless product explicitly requires one-time grants (defer).

### 7. Audit on entitlement-authorized install

When install proceeds **because of entitlement** (not free, not bypass):

| Event | Recommendation |
|-------|----------------|
| `auditLog()` | e.g. `marketplace_install_entitlement_authorized` with `companyId`, `packId`, `uid`, effective status snapshot |
| Entitlement doc | **No mutation** on successful install (grant lineage unchanged) |
| Bypass install | Existing behavior; **no** entitlement write (Policy A) |

### 8. Client spoofing protection

| Vector | Control |
|--------|---------|
| Body `entitled: true` | **Ignore** — not a field today |
| Body `skipPayment` / `demoMode` | Stripped for tenants via `resolveMarketplacePaymentBypass` |
| Forged entitlement doc | Tenants cannot write `marketplaceEntitlements` (Firestore rules + no API) |
| Cross-tenant install | `requireAuthenticatedTenantMember` + `companyId` match |

### 9. Already-installed paid pack

**Recommendation (align 6C):** If pack already installed, existing **alreadyInstalled** path unchanged. Revoke/expiry blocks **new** install/reinstall only; **no auto-uninstall**.

Clarify at sign-off: first-time install vs reinstall after manual uninstall — both require active entitlement when `manifest.isPaid`.

---

## Regression requirements (6I-D must run)

Must remain green unless charter explicitly amends:

- `verify-portal-4a-marketplace-auth.js`
- `verify-portal-4a-r1-marketplace-security.js`
- `verify-portal-4c-3-marketplace-payment-ux.js`
- `verify-portal-4c-2-marketplace-lifecycle.js`
- `verify-portal-4c-5-marketplace-pack-update-ux.js`
- `verify-portal-4c-6-marketplace-entitlement.js` (extend with **entitled install allowed** cases; keep revoked/expired/no-doc → 402)

**4A invariant:** Tenant cannot bypass via body flags.

**6C invariant:** Grant/revoke APIs unchanged; tenant cannot grant.

---

## Central Motors / RTB protection

- All **entitlement mutations** and **install integration acceptance** use **disposable tenants** only.
- Verifiers must assert test company id **≠** `central-motors-rtb`.
- No production acceptance scripts may grant/revoke entitlements on RTB.

---

## Production acceptance outline (6I-E — after implementation)

Disposable tenant on production (HTTP preferred when deployed):

| Step | Check |
|------|--------|
| 1 | Paid install → **402** (no entitlement) |
| 2 | Platform grant → tenant GET `entitled: true` |
| 3 | Paid install → **success** (201/200) |
| 4 | Optional: revoke → install → **402** again |
| 5 | Bypass: superadmin/API key + `skipPayment` without entitlement → **allow** (Policy A spot check) |
| 6 | RTB not mutated |

Evidence: `test-results/portal-4c-6i-production-acceptance.json` (name TBD at 6I-E).

---

## Proposed sub-gate chain (install integration)

```text
4C-6I-A — This charter (sign-off)
   ↓
4C-6I-B — executeInstall + route wiring only (minimal diff)
   ↓
4C-6I-C — Verifier extensions + memory behavioral proofs
   ↓
4C-6I-D — Security + full marketplace regressions
   ↓
4C-6I-E — Production acceptance (disposable tenant)
   ↓
4C-6I-F — Portal UX (Install after grant, badges) — optional separate gate
   ↓
4C-6I CLOSED
```

**Deploy note:** Shipping 6B/C HTTP routes to Railway is **deployment alignment** for 6C-E HTTP re-run; **6I-B** may ship on same or later deploy but must not conflate evidence claims.

---

## Out of scope (until separately authorized)

- Stripe / checkout / payment capture
- Entitlement UI in Admin Console (grant UI)
- 4C-4C-3 review management
- Auto-uninstall on revoke
- Policy B (mirror bypass installs to entitlement docs)
- Changing update engine payment behavior
- Git push / deploy (unless authorized per sub-gate)

---

## Sign-off checklist (6I-A)

- [ ] Precedence: free → trusted bypass → entitlement → 402  
- [ ] Policy A break-glass unchanged  
- [ ] Effective status uses existing `resolveEntitlementEffectiveStatus` / `isEntitlementInstallEligible`  
- [ ] HTTP code strategy: `PAYMENT_REQUIRED` vs `ENTITLEMENT_REQUIRED`  
- [ ] Fail-closed if entitlement repository unavailable  
- [ ] Reusable entitlement (not consumed on install)  
- [ ] Audit event for entitlement-authorized install  
- [ ] No tenant body trust; no Portal-side gate  
- [ ] Updates remain ungated  
- [ ] RTB / disposable-only acceptance  
- [ ] Regression list accepted  

**After sign-off:** authorize **4C-6I-B** implementation only (installer integration + tests), not Portal UX unless folded into charter amendment.
