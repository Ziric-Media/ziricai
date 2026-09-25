# PORTAL-4C-6I-C — Installer Integration Verification

**Status:** Verification gate (no feature implementation)  
**Baseline:** 6I-B closed — `executeInstall` entitlement-aware  
**Executor:** `scripts/verify-portal-4c-6-marketplace-entitlement.js`  
**Fast leaf:** `PORTAL_ACCEPTANCE_LEAF=1` skips nested 4A/R1/4C scripts

---

## Matrix (must pass)

| Area | Proof |
|------|--------|
| **Free pack** | Installs without entitlement lookup (`manifest.isPaid` gate) |
| **Paid + active** | Install proceeds (`requiresPayment` not true) |
| **Paid + none / expired / revoked** | `requiresPayment: true` |
| **Policy A** | `skipPayment` / `demoMode` trusted options bypass without entitlement doc |
| **Tenant bypass stripped** | `resolveMarketplacePaymentBypass` denies tenant body flags |
| **No client entitlement hint** | Install route / installer do not read body `entitled` |
| **Server-side read** | `getMarketplaceEntitlementRepository` + `isEntitlementInstallEligible` in paid path only |
| **Integrity** | Entitlement doc unchanged after install (no consume) |
| **Audit** | `marketplace_install_entitlement_authorized` on entitled path |
| **Fail closed** | Simulated repository read error → `requiresPayment` |
| **Updates** | `applyUpdate` / update route not entitlement-gated |
| **RTB** | All install-integration tests use disposable company ids |
| **Regressions** | 4A, R1, 4C-2, 4C-3, 4C-5 nested scripts |

---

## Historical note

`verify-portal-4c-6c-e-production-acceptance.mjs` documents **pre-6I frozen install** evidence. Update only in **6I-E** production gate — do not weaken 6I-B/C verifiers to satisfy it.

---

## Out of scope

Portal UX, checkout, Admin UI, commit, push, deploy, installer feature changes.
