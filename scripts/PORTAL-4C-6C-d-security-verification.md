# PORTAL-4C-6C-D — Security + Regression Verification

**Status:** Verification gate (no feature implementation)  
**Executor:** `scripts/verify-portal-4c-6-marketplace-entitlement.js`  
**Fast leaf:** `PORTAL_ACCEPTANCE_LEAF=1` skips nested 4A/R1/4C scripts

---

## Security matrix (must pass)

| Control | Proof |
|---------|--------|
| Platform grant auth | `POST /api/platform/marketplace/entitlements` + `requirePlatformAccess`; unauthenticated → 401 |
| Platform revoke auth | `DELETE` + `PATCH action:revoke` + `requirePlatformAccess`; unauthenticated → 401 |
| Platform expiry auth | `PATCH expiresAt` + `requirePlatformAccess` |
| Tenant cannot grant | No `POST/PATCH/DELETE` under `/api/marketplace/entitlements` |
| Tenant cannot revoke / set expiry | Same static surface; tenant GET only |
| Cross-tenant read | `assertAuthenticatedTenantMemberAccess` → 403 |
| Unauthenticated tenant read path | 401 on tenant member gate |
| Missing entitlement | Tenant GET → `none` / not entitled; platform revoke → 404 `ENTITLEMENT_NOT_FOUND` |
| Effective states | `active`, `revoked`, `expired` (time) on tenant DTO |
| Audit DTO isolation | No `grantedBy`, `salesReference`, `revokedBy`, `revokeReason` on tenant views |
| Idempotent grant / revoke | Service + HTTP semantics (200/201 grant; 200 revoke) |
| Restart durability | Re-fetch repository singleton after writes |
| Install frozen | `requiresPayment: true` after grant, expiry update, revoke |
| No uninstall | Entitlement service static deny uninstall/installer hooks |
| Installer frozen | No entitlement wiring in `marketplaceInstaller.js` |

---

## Regressions (6C-D full run)

When `PORTAL_ACCEPTANCE_LEAF` is not `1`:

- `verify-portal-4a-marketplace-auth.js`
- `verify-portal-4a-r1-marketplace-security.js`
- `verify-portal-4c-3-marketplace-payment-ux.js`
- `verify-portal-4c-2-marketplace-lifecycle.js`
- `verify-portal-4c-5-marketplace-pack-update-ux.js`

---

## Boundary

Findings about **future** install authorization (entitlement → allow install) are **recorded only** — do not modify `marketplaceInstaller.js` in 6C-D.

Install-integration gate: separate authorization after 4C-6C CLOSED.
