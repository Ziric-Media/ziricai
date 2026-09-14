# PORTAL-4C-5 — Marketplace Pack Update UX

**Status:** 4C-5A (scope + verifier contract) — authorized, no implementation yet  
**Baseline:** 4C-4C-2 closed @ `e97d733`; production Portal @ `6aa7d139d4397623d59112ff`  
**Depends on (closed, do not rewrite):** PORTAL-4C-1 / 4C-1B update engine + `POST /api/marketplace/update`

---

## Purpose

Expose **existing** pack update capability to tenants through the **Company Portal only**, with honest success/failure UX and authoritative post-apply refresh.

**4C-1** built and production-validated the engine. **4C-5** wires Portal to that contract—nothing more.

---

## In scope (Portal only)

| Area | Requirement |
|------|-------------|
| **API client** | `applyPackUpdate(companyId, packId, targetVersion)` in `js/portal/api.js` → `POST /api/marketplace/update` (single helper; no duplicate fetch paths in `marketplace.js`) |
| **Permission UX** | Apply control visible only when caller can apply; **`canManageStaff`** enforced server-side (already on route). Viewers/roles without permission see read-only update info + guidance (no disabled fake submit that still POSTs) |
| **Surfaces** | Installed list badge/changelog (existing) + **Installed → Details** apply flow (replace lock-only note). **No Admin apply** in this gate |
| **Confirmation** | Explicit confirm step: target version, changelog summary, additive-merge note |
| **In-flight** | Double-submit guard (mirror 4C-4C-2 review submit): disable apply, no parallel POSTs |
| **Success** | Only on **HTTP 200** + response body indicating success (`success`, `newVersion`, etc.). Show confirmation from **API response**, then refresh |
| **Refresh** | After **proven** success: re-fetch lifecycle + updates (+ hub invalidation if install path does). Displayed version and update badge must come from **refreshed GETs**, not optimistic local bump |
| **Failure** | Map API status/body honestly; **never** show “Updated successfully” on non-200 or ambiguous body |
| **CSS** | Portal styles in shared source + `prepare-sites.js app` mirror (same pattern as 4C-4C-2) |

---

## Out of scope (unless separately authorized)

- Changes to `applyUpdate`, version publishing, curated catalog, Firestore version paths
- Admin Portal apply-update UI
- 4C-4C-3 (reviews/mine, edit/delete, moderation)
- 4C-6 paid-pack entitlement / payment lifecycle
- Downgrade, uninstall-on-failure, automatic drift repair
- Git push (unless explicitly authorized)
- Backend engine rewrite or new update routes

---

## Backend contract (frozen for 4C-5)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/marketplace/installed/:companyId/updates` | tenant member |
| POST | `/api/marketplace/update` | tenant member + **`canManageStaff`** |

**Body:** `{ companyId, packId, targetVersion }`

**Success (200):** e.g. `{ success: true, newVersion, previousVersion, merged, validation, message }`

**Failure (representative):**

| Condition | Typical HTTP | `code` / signal | Portal must |
|-----------|--------------|-----------------|-------------|
| Not greater than installed / repeat apply | 400 | message | Fail honestly; no version bump in UI |
| Version mismatch / registry commit after partial apply | **409** | `MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED`, `MARKETPLACE_VERSION_CONFLICT` | Fail honestly; **do not** treat as success; warn that registry may not match resources (wording TBD, no client repair) |
| Resource apply failed | 400 | `MARKETPLACE_UPDATE_RESOURCE_FAILED` | Fail honestly |
| Post-apply validation failed | 400 | `MARKETPLACE_UPDATE_VALIDATION_FAILED` | Fail honestly |
| Unknown version | 400 | error message | Fail honestly |

**Critical honesty rule:** Portal must **not** infer success from partial responses, optimistic UI, or refresh-after-error assuming the update worked. Success UI is gated on **200 + explicit success payload**; then authoritative GETs must agree (registry version advanced, update badge cleared or shows next target).

---

## Partial-failure emphasis (verifier must prove)

The engine can apply KB/workflows then fail registry commit (`MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED`, HTTP **409**, `applied` IDs in body per 4C-1). Portal UX and tests must treat this as **failure**, not success.

Verifier obligations:

1. **Successful update** → Firestore/registry (or lifecycle GET) shows **advanced version**; GET updates no longer offers same target (or shows up-to-date).
2. **409 registry conflict / commit failed** → Portal shows **failure** state; **no** success card; **no** client-side `version = targetVersion` without 200 success.
3. **Resource failure** → failure UI; registry unchanged (API-level proof in live harness; static checks for error mapping).
4. **Validation failure** → failure UI; no false success.
5. **No force-bump** — static: no PATCH to registry, no local-only version override, no POST body tricks beyond `{ companyId, packId, targetVersion }`.
6. **No false “Updated successfully”** — static grep + behavioral checks on mapped status codes.
7. **Post-success display** — after apply, module re-loads lifecycle + updates; installed detail/list version string matches refreshed lifecycle, not pre-apply cache.

Live/disposable harness may reuse 4C-1 production patterns; UI acceptance on `app.ziricai.com` (same-origin `/api`) in 4C-5E.

---

## Sub-gate chain

```
4C-5A — Scope + verifier contract (this document)
   ↓
4C-5B — Portal API/client wiring (`applyPackUpdate`, permissions probe helper if needed)
   ↓
4C-5C — Apply-update UX (confirm, apply, success block)
   ↓
4C-5D — Error/concurrency handling + authoritative refresh
   ↓
4C-5E — Production acceptance (disposable tenant + Portal deploy if needed)
   ↓
4C-5 CLOSED
```

Each sub-gate should land a **focused commit** (when user authorizes commits) and extend the verifier without breaking 4C-1/4C-4C-2 regressions.

---

## Anticipated touchpoints (implementation reference)

| Path | Role |
|------|------|
| `js/portal/api.js` | `applyPackUpdate` |
| `js/portal/modules/marketplace.js` | Wire apply in `openInstalledDetailModal`; optional badge refresh via existing `loadMarketplace` / lifecycle index |
| `css/admin-dashboard.css` (Portal marketplace styles) | Apply button, in-flight, success/error blocks |
| `app/js/portal/*`, `app/css/*` | Via `prepare-sites.js app` |
| `scripts/verify-portal-4c-5-marketplace-pack-update-ux.js` | Static + contract verifier (new) |
| `scripts/verify-portal-4c-5-production-acceptance.mjs` | Optional live matrix (new, 4C-5E) |
| `package.json` | `verify:portal-4c-5-*` scripts when verifiers exist |

**Do not modify:** `services/platform/marketplaceVersioning.js` (except if a separate bugfix is authorized), `api/app.js` update route semantics, Admin marketplace apply.

---

## Verifier contract (`verify-portal-4c-5-marketplace-pack-update-ux.js`)

**Environment:** `STORAGE_BACKEND=memory`, `PORTAL_ACCEPTANCE_LEAF=1` for nested regressions (same as 4C-4C-2).

### Static — API surface

- `applyPackUpdate` exported from `js/portal/api.js`; POST only to `/api/marketplace/update`.
- `marketplace.js` does **not** embed raw `fetch('/api/marketplace/update')` or duplicate POST helpers.
- No Admin path changes required (Admin remains read-only for updates).

### Static — UX wiring

- Apply UI lives in **installed-detail** flow only (not catalog detail wizard).
- Lock-only placeholder text removed or replaced by apply UX where update available.
- `submitting` / in-flight guard on apply action.
- Success renderer consumes **200 response fields** (`newVersion`, `merged`, etc.), not invented state.
- Error mapper handles at least: 400 (generic + known codes), **409** (registry/commit), 401/403 (auth/permission).
- **Forbidden patterns (assert.doesNotMatch):**
  - Optimistic `version = targetVersion` before success
  - Success UI on `res.error` or missing `success`/equivalent
  - Client-side registry/version PATCH
  - `targetVersion` omitted or client-chosen without using GET updates payload

### Static — permissions

- Apply button wired only when UI has determined manage capability (pattern aligned with existing Portal permission checks—exact mechanism to match codebase conventions, e.g. profile role / permission helper).
- Document in verifier comment if capability is inferred from role until a dedicated permission API exists.

### Static — refresh

- After success path: calls existing marketplace reload or lifecycle+updates refetch (grep for `fetchMarketplaceLifecycle`, `fetchPackUpdates`, `indexLifecycle`).
- No success path that skips refresh.

### Behavioral (memory / optional local API)

Where feasible without Firestore Admin, use mocked `request()` outcomes to assert error mapper returns terminal failure HTML, not success (optional section; may defer to 4C-5E live harness).

### Regressions (nested)

- `verify-portal-4c-1-marketplace-update.js` (engine unchanged)
- `verify-portal-4c-4c-2-marketplace-review-submit.js`
- `verify-portal-4a-marketplace-auth.js` (update route auth unchanged)

---

## Production acceptance (4C-5E) — outline

**Tenant:** Disposable company (provision script); **`pack-funeral-ai`** installed at **1.0.0** with published **1.1.0** (production already seeded).

**Matrix (minimum):**

| Step | Check |
|------|--------|
| 1 | GET updates shows 1.1.0 available |
| 2 | Portal UI: confirm + apply (owner with canManageStaff) |
| 3 | Single POST update → 200; success UI |
| 4 | Registry/lifecycle version **1.1.0**; KB/WF counts +1 (API or read-only admin tools) |
| 5 | GET updates: no longer pending same bump (up to date) |
| 6 | Repeat apply → 400/409; UI failure, version stays 1.1.0 |
| 7 | Deployed `marketplace.js` contains apply wiring; no Admin apply |
| 8 | Optional: viewer role sees no apply (if disposable viewer provisioned) |

**Evidence file:** `test-results/portal-4c-5-production-acceptance.json` (untracked artifact pattern).

**Deploy:** Netlify Portal only when authorized; no Git push unless authorized.

---

## Acceptance criteria for 4C-5 CLOSED

- All sub-gates complete; verifiers green locally.
- Production API apply path unchanged and still passes 4C-1 regression.
- Portal on `app.ziricai.com` allows apply for eligible staff, honest failures for 409/400, authoritative refresh on success.
- No scope creep into 4C-4C-3, 4C-6, Admin apply, or engine rewrite.

---

## Open decisions (resolve in 4C-5B/C, not in engine)

1. Exact copy for **409 registry drift** (support-oriented, no false success).
2. Whether apply appears on installed **list** row or **Details only** (recommend Details + keep list badge).
3. Hub invalidation: mirror `installMarketplacePack` prefetch invalidation after successful update.

---

*Document version: 4C-5A — implementation authorized; code changes begin at 4C-5B per user gate sequence.*
