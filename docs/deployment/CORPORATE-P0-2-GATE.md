# CORPORATE-P0-2 — Signup / Tenant Creation / Owner Binding

**Status:** SPEC APPROVED — P0-2a implementation in progress (factory closure + partial verifier)  
**Depends on:** CORPORATE-P0-1 ✅ CLOSED (production tenant isolation proven)  
**Does not replace:** P1 onboarding honesty (partial overlap in P0-2c), P0-3 unified communication write path  

---

## Purpose

P0-1 proves that **existing tenants are isolated** under strict production enforcement.

P0-2 must prove that the platform **cannot create an improperly owned tenant in the first place**.

A generic company must become a **properly isolated tenant** with an **authenticated owner**, **deterministic provisioning**, **its own AI employee and knowledge space**, and **no Central Motors or unintended demo contamination**.

---

## Finish line (gate definition)

> A previously unknown company can be created **only** through an authenticated, server-authoritative signup/provisioning path. The resulting tenant is deterministically provisioned, owned by the Firebase UID represented by the **verified token**, immediately accessible to that owner, isolated from every other tenant, contains its own AI employee and knowledge space, and contains no Central Motors or unintended demo data. Repeating the operation is idempotent. **No unauthenticated endpoint can create or provision a tenant.**

---

## Architectural decision (locked)

**Verified Firebase UID is the sole identity primitive** for corporate signup and tenant creation.

```
Firebase Authentication
        ↓
Authorization: Bearer <verified ID token>
        ↓
server resolveAuthFromRequest → auth.uid (authoritative)
        ↓
create / claim company (server-generated or validated companyId)
        ↓
server upsert users/{uid} profile (companyId, role owner)
        ↓
server upsert companies/{companyId}/users/{uid} membership
        ↓
provisionCompany(companyId, { ownerUid: auth.uid, ... })
        ↓
Portal strict access → GET /api/portal/hub/{companyId} → 200 for owner
```

**Forbidden pattern (must not survive in production paths):**

```
client → uid in JSON body → server trusts body.uid without token match
```

**Rules:**

| Rule | Requirement |
|------|-------------|
| UID authority | Owner UID derived **only** from verified Firebase token |
| UID spoofing | `body.uid` (or any client field) **cannot** override `auth.uid` |
| Synthetic UID | **Removed** from all production provisioning paths (e.g. `owner-${Date.now()}`) |
| Client Firestore writes | May remain for UX during transition, but **server binding is source of truth** for gate close |
| Platform provisioning | `POST /api/platform/provision/company` remains **platform-auth only** (operator path), separate from self-serve signup |

---

## Acceptance contract

| Gate | Required outcome |
|------|----------------|
| Signup authentication | Firebase-authenticated user required **before** any tenant can be created |
| UID authority | Server derives owner UID exclusively from verified Firebase token |
| UID spoofing | `body.uid` cannot override authenticated UID; owner is always token holder |
| Synthetic UID | Completely removed from production provisioning paths |
| `POST /api/companies` | Platform-protected **or** fail-closed in production |
| Onboarding `start` | Authenticated and UID-bound |
| Onboarding `complete` | Authenticated and UID-bound |
| Onboarding `provision` | Authenticated and UID-bound |
| Owner profile | Created/updated **server-side** from verified UID |
| Tenant membership | Created/updated **server-side** from verified UID |
| Provisioning | Continues through canonical `provisionCompany` |
| Idempotency | Repeating provisioning does not duplicate tenant resources |
| Tenant isolation | New owner can access own tenant; **403** for another tenant (P0-1 behavior) |
| Portal access | Works immediately after successful provisioning (strict mode) |
| Central Motors contamination | No CM customer/CRM/KB/AI data in new tenant |
| Demo contamination | No demo tenant data unless **explicitly** part of product contract |
| Unauthenticated factory | No public route can create a tenant |
| Session security | Onboarding session cannot be used by another Firebase user |
| Session durability | Persistent across server restart |
| Honest integration state | Simulated WhatsApp/training cannot be represented as genuinely connected/completed |
| Production verification | Dedicated `verify:corporate-p0-2` passes |

---

## Locked product preferences (implementation planning)

| Topic | Decision |
|--------|----------|
| `POST /api/companies` | **Platform-only** — not a public signup route; prove unauthenticated cannot create |
| Demo lead seed | Default **off** in **P0-2b** (clean production tenant; explicit opt-in for demos/tests) |
| Self-serve signup | **`POST /api/onboarding/start`** is the canonical public entry; `/complete` may remain temporarily with **identical auth + owner-binding rules**, not a second factory |

---

## Implementation phases (sequencing)

### P0-2a — Close the factory (security)

**Goal:** Impossible for an unauthenticated caller to manufacture tenants.

| Item | Target behavior |
|------|-----------------|
| `POST /api/companies` | `requirePlatformAccess()` **or** `403`/`404` in `NODE_ENV=production` |
| `POST /api/onboarding/start` | Require valid Bearer; reject unauthenticated |
| `POST /api/onboarding/complete` | Require valid Bearer |
| `POST /api/onboarding/provision` | Require valid Bearer + rate limit |
| `GET /api/onboarding/session/:id` | Auth + session owner (or superadmin); no session id as sole secret |
| Rate limiting | Consistent `authRateLimit` on all onboarding mutation routes |

**Out of scope for 2a:** Firestore session persistence, WhatsApp honesty UI, CRM v1.

### P0-2b — Owner binding (security)

**Goal:** Ownership is completely server-authoritative; no synthetic UIDs.

| Item | Target behavior |
|------|-----------------|
| `onboardingOrchestrator.completeOnboarding` | **No** synthetic `uid`; require token |
| `startOnboarding` | Bind `session.uid = auth.uid`; ignore spoofed body uid |
| Profile + membership | Always written server-side after token verify, before/at provision |
| `provisionCompany` | `ownerUid` must match token when invoked from self-serve paths |
| Identity substitution tests | Verifier proves User A token + body User B → owner is User A |

**Out of scope for 2b:** Session durability (2c), demo lead default (2c/product decision).

### P0-2c — Durability + honest onboarding (stability / honesty)

**Goal:** Real SaaS journey; no misleading connected/trained states.

| Item | Target behavior |
|------|-----------------|
| Onboarding sessions | Persist (e.g. Firestore `platform/onboardingSessions/{id}` or tenant-scoped doc) |
| WhatsApp step | `connected: false` / explicit `simulated` when platform WA not tenant-bound |
| Train step | No fake “complete” with fabricated chunk counts unless labeled simulation |
| Demo lead seed | Default **off** for production corporate signup (or env-gated) |
| Client onboarding UI | Reflect server honest states only |

**Out of scope for 2c:** P0-3 MC/Portal unified outbound path, marketplace entitlement, CRM v1 UI.

---

## HTTP / route contract (target state)

| Method | Path | Auth (target) | Notes |
|--------|------|---------------|--------|
| POST | `/api/companies` | Platform **or** prod fail-closed | Today: open factory |
| POST | `/api/onboarding/start` | Firebase Bearer | Creates session + provision |
| POST | `/api/onboarding/complete-step` | Bearer + session owner | Already partially gated |
| POST | `/api/onboarding/complete` | Firebase Bearer | One-shot chain |
| POST | `/api/onboarding/provision` | Firebase Bearer | Simplified clients |
| GET | `/api/onboarding/session/:id` | Bearer + session owner | No public read |
| POST | `/api/platform/provision/company` | Platform (unchanged) | Operator / MC |

---

## Verifier outline: `verify:corporate-p0-2`

**Script:** `scripts/verify-corporate-p0-2.js`  
**npm:** `verify:corporate-p0-2`  
**Modes:** Local/unit (default), optional live (explicit env — no hardcoded secrets)

### A. Factory closure (unauthenticated)

For each route, **without** `Authorization`:

- `POST /api/companies` (valid body with new `companyId`)
- `POST /api/onboarding/start`
- `POST /api/onboarding/complete`
- `POST /api/onboarding/provision`

**Expected:** HTTP **401** (or **403** where platform-only), **no side effects**.

**Strongest check — zero tenant created:**

- Before/after: assert company doc / provisioning record / platform registry entry **does not exist** for the probe `companyId` (use isolated id prefix `corporate-p0-2-factory-probe-*`).
- If handler runs before auth middleware today, verifier must catch **partial writes** (regression guard).

### B. UID authority and spoofing (authenticated)

Setup: two fixture UIDs (or mocked `resolveAuthFromRequest` in unit mode).

| Case | Setup | Expected |
|------|--------|----------|
| Spoof body uid | Token User A, body `uid: User B` | Owner = **A**; membership for **A**; **B** not owner |
| Wrong tenant access | Token User A, `GET /api/portal/hub/{User B company}` | **403** |
| Own tenant | Token User A, hub `{A company}` | **200** (after successful provision fixture) |

Unit mode may inject auth deps; live mode uses `CORPORATE_P0_2_TOKEN_A`, `CORPORATE_P0_2_TOKEN_B`, company ids from env.

### C. Synthetic UID removal

- Static/code probe: `onboardingOrchestrator.js` must not contain `owner-${Date.now()}` fallback on production paths.
- Runtime: `complete` without token → **401**, no company created.

### D. Idempotency

- Double `provisionCompany(sameCompanyId, …)` → second call `alreadyProvisioned: true`; resource counts stable (agent id, kb id unchanged).

### E. Contamination guards (smoke)

- New tenant CRM customers: no `demo-central-motors`, `central-motors-rtb` ids in **new** probe tenant.
- Default agent name/kb titles tenant-scoped; no CM inventory doc titles in starter KB (heuristic string checks in verifier).

### F. Session security (post-2c)

- User A creates session; User B token → `complete-step` → **403**.
- Restart simulation: reload session from persistence store → session retrievable (integration test with memory/firestore adapter).

### G. Honest state (post-2c)

- With WA simulate env: onboarding whatsapp step response must not claim `connected: true` without `simulated: true` or equivalent honest flag.

### Live mode env (optional)

| Variable | Purpose |
|----------|---------|
| `CORPORATE_P0_2_BASE_URL` | Production or staging API |
| `CORPORATE_P0_2_TOKEN_A` | Firebase ID token user A |
| `CORPORATE_P0_2_TOKEN_B` | Firebase ID token user B |
| `CORPORATE_P0_2_COMPANY_A` | User A tenant id (after signup) |

Never print tokens in verifier output.

---

## Production close checklist (after deploy)

1. `npm run verify:corporate-p0-2` (local CI).
2. Live factory probe: all four POST routes **401/403**, **zero** new probe tenants in Firestore directory.
3. End-to-end: new `@ziricai.com` or disposable acceptance user → signup → Portal hub **200** → wrong tenant **403**.
4. Confirm P0-1 matrix still passes (no regression on strict enforcement).
5. Central Motors golden tenant smoke unchanged (read-only spot check).

---

## Explicitly out of scope (P0-2)

- Central Motors pilot behavior changes  
- Sarah / WhatsApp worker / message pipeline (P0-3)  
- MC inbox unified write path (P0-3)  
- Legacy route migration (`/api/customers?companyId=`)  
- Marketplace entitlement production routes  
- Portal CRM v1 UI  
- Voice  
- Governance / Political  
- Railway variable changes unless required for a separate ops ticket  

---

## Evidence for gate close

| Artifact | Required |
|----------|----------|
| This spec approved | Yes |
| Implementation PR(s) scoped to 2a → 2b → 2c | Yes |
| `verify:corporate-p0-2` green | Yes |
| Production factory + spoofing + E2E signup smoke | Yes |
| P0-1 regression matrix | Yes |

**Gate status:** OPEN — specification only; implementation prompts require explicit authorization after spec review.

---

## Reference (current codebase — audit baseline)

| Area | Current behavior (pre-P0-2) |
|------|-----------------------------|
| `POST /api/companies` | Unauthenticated, no rate limit |
| Onboarding start/complete/provision | Unauthenticated; optional body `uid` |
| `completeOnboarding` | Synthetic `owner-${Date.now()}` if uid omitted |
| Sessions | In-memory `Map` |
| Platform provision | `requirePlatformAccess()` ✅ |
| `provisionCompany` | Idempotent canonical provisioning ✅ |
| Marketing wizard | Firebase register + Bearer on steps; API does not enforce uid match on `start` |

---

## Roadmap position

```
CORPORATE-P0-1 ✅ CLOSED
        ↓
CORPORATE-P0-2 (this gate) ← SPEC
        ↓
CORPORATE-P0-3 Unified Communication Write Path
        ↓
P1 Onboarding / Portal / CRM / Billing
        ↓
Corporate Audit #2 → REAL CUSTOMER #1
```
