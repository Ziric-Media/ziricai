# PORTAL-4C-6I-D — Production Verification Preparation

**Status:** Runner + contract (no deploy, no product scope expansion)  
**Executor:** `scripts/verify-portal-4c-6i-e-production-acceptance.mjs`  
**Legacy alias:** `scripts/verify-portal-4c-6c-e-production-acceptance.mjs` (forwards to 6I-E runner)

---

## Purpose

Prepare **production acceptance** for post-**6I-B** install authorization:

- Entitlement **lifecycle** on production Firestore (unchanged from 6C-E).
- Install **matrix** aligned with 6I-A/6I-B (no universal frozen 402 after grant).

**6I-D is not deployment.** It delivers the reviewed harness and evidence schema for **6I-E** execution after API deploy.

---

## Install authorization matrix (production HTTP target)

| Step | Condition | Expected |
|------|-----------|----------|
| 1 | No entitlement | Tenant POST install → **402** `PAYMENT_REQUIRED` |
| 2 | Platform grant → active | Tenant GET → `entitled: true` |
| 3 | Active entitlement | Tenant POST install → **201/200** (not 402) |
| 4 | After install | Entitlement doc **unchanged** (no consume) |
| 5 | After install | Installed registry lists pack |
| 6 | Expiry set (future) | Tenant GET reflects `expiresAt`; install OK if already installed |
| 7 | Revoked | Tenant GET → not entitled; install → **402** |
| 8 | Expired entitlement (separate disposable co.) | Install → **402** |
| 9 | Policy A bypass (no entitlement) | `runInstallWizard` + `skipPayment` (service path) → allowed |

---

## HTTP vs service fallback (pre-deploy)

When `API_BASE` still runs **pre-6I** installer:

- **Negative** cases (no/revoked/expired) remain **402** on HTTP (valid).
- **Positive** entitled install on HTTP may still **402** until deploy.

Runner behavior:

| Env | Positive install after grant |
|-----|------------------------------|
| Default | HTTP 402 → **service-layer** `runInstallWizard` with local 6I-B code + prod Firestore; records `limitations[]` |
| `PORTAL_6I_E_STRICT_HTTP=1` | HTTP must succeed — **fail** (for 6I-E after deploy) |

Entitlement grant/revoke: HTTP if routes live, else service layer (same as 6C-E).

---

## Evidence

- Primary: `test-results/portal-4c-6i-production-acceptance.json`
- Legacy copy: `test-results/portal-4c-6c-production-acceptance.json` (same payload, `evolution: 6I-D-aligned`)

---

## Boundaries

- Disposable tenants only; **never** `central-motors-rtb` mutations.
- No Portal UX, checkout, Admin UI, commit, push, deploy in 6I-D.

---

## 6I-E gate (after deploy)

Re-run with `PORTAL_6I_E_STRICT_HTTP=1` and `platformEntitlementHttpDeployed: true` expected for full HTTP path:

`Grant → entitlement → paid install (HTTP) → registry durable`
