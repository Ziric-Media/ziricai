# Tenant taxonomy & classification policy

**Gate:** MC-U-0.2 — DOCUMENTATION / POLICY ONLY  
**Status:** AUTHORITATIVE POLICY (no production writes in this gate)  
**Evidence basis:** MC-U-0.1 production census (`test-results/mc-u-0.1-tenant-census-2026-09-18.json`)  
**Related gates:** MC-U-0.1 (census, CLOSED), MC-U-1 (Mission Control Tenants UI, not started)

---

## Purpose

ZiricAI stores **tenant root records** in Firestore `companies/{companyId}`. Mission Control currently lists **all** of those records. Without an explicit classification policy, operators and dashboards can misread **tenant count** as **customer count**.

This document defines **what each tenant is** (classification) separately from **how it is billed or operated** (status and billing). Implementation of durable metadata and UI changes belongs to later gates (MC-U-1 onward).

### Core principle

> **A tenant’s classification describes its business/operational role in the platform. It must never be inferred merely from the absence of a test-looking name, from rich CRM data, or from production activity.**

---

## 1. Authoritative classes

These are the **only** tenant classification values for platform reporting, census, and (future) Mission Control filters.

| Class | Meaning | Typical evidence (one or more required) |
|-------|---------|----------------------------------------|
| **TEST** | Created for engineering, QA, disposable verification, automated acceptance harnesses, or regression fixtures. Not a customer-facing account. | `companyId` / name matches known harness patterns (e.g. `portal-4b-*`, `portal-4c*`, `*-test-*`); created by documented gate scripts; `@ziricai.com` harness owners; operator registry marking TEST. |
| **ACCEPTANCE** | Created **specifically** to validate a release or gate (provisioning, Portal, Marketplace, etc.). May be fully provisioned and behave like production, but **purpose** is verification—not commercial relationship. | Known acceptance `companyId`s; gate documentation; disposable actor provisioning scripts; operator registry. |
| **DEMO/SHOWCASE** | Demonstrations, sales presentations, sample environments, or public showcasing—not a paying customer relationship. | Known demo ids (`demo-*`); seed/demo documentation; operator registry. |
| **PILOT** | A **real-world business** used to validate ZiricAI in production, designated as pilot—not yet formally classified as a commercial **PRODUCTION CUSTOMER**. | Operator policy assignment; pilot program documentation; explicit registry—**not** “has WhatsApp + CRM + users”. |
| **PRODUCTION CUSTOMER** | A **genuine external customer** account that ZiricAI has **formally designated** as a customer through authorized operator or commercial onboarding flow. | **Explicit** operator action or future audited commercial flow; `settings.tenantClass` (future); `CENSUS_KNOWN_REAL_CUSTOMER_IDS` (interim registry)—**never** inference from activity alone. |
| **UNKNOWN** | Classification cannot yet be established from authoritative evidence. | No matching rules; incomplete records; pending operator review. |

### What is **not** a classification

Do **not** use these as `tenantClass` values (they belong on other dimensions):

- **Trial / paid / past due** → billing (`billing.status`, `planId`, `trialEndsAt`)
- **Active / suspended / archived** → company operational status (`company.status`)
- **Marketplace installed / entitled** → marketplace install registry
- **Provisioning complete** → provisioning record under tenant settings

**SUSPENDED** is an **operational status** (and billing may also reflect suspension). A tenant may be `tenantClass: PRODUCTION CUSTOMER` and `status: suspended` simultaneously. Suspension does not reclassify a pilot into a test tenant.

---

## 2. Classification vs operational state

### Dimensions (orthogonal)

| Dimension | Authoritative source (today) | Examples |
|-----------|------------------------------|----------|
| **tenantClass** | *Future:* `companies/{id}.settings.tenantClass`. *Interim:* operator registry, census policy, gate docs | `PILOT`, `TEST`, `PRODUCTION CUSTOMER` |
| **company.status** | `companies/{id}.status` | `active`, `trial`, `suspended`, `archived` |
| **billing.planId** | `companies/{id}/billing/*` via `getTenantBilling()` | `trial`, `starter`, `professional`, … |
| **billing.status** | same | `trialing`, `active`, `past_due`, … |
| **billing.trialEndsAt** | same | ISO date |
| **Marketplace** | `companies/{id}/marketplaceInstalls/*` | `installed`, `failed`, pack ids |
| **Provisioning** | settings `provisioning` / `getProvisioningLinks()` | `complete`, resources[], links |

### Valid combinations (examples)

| tenantClass | billing.planId | billing.status | company.status | Interpretation |
|-------------|----------------|----------------|----------------|----------------|
| PRODUCTION CUSTOMER | starter | active | active | Paying or subscribed customer |
| PRODUCTION CUSTOMER | trial | trialing | active | **Customer on trial**—class ≠ trial |
| ACCEPTANCE | trial | trialing | active | Gate verification tenant |
| PILOT | starter | active | active | Real business, pilot designation |
| TEST | starter | active | active | Harness tenant (status active ≠ customer) |

**Rule:** Never map “trialing” billing to ACCEPTANCE or TEST automatically. Billing describes **commercial state**; class describes **platform role**.

---

## 3. Central Motors (pilot)

| Field | Value |
|-------|--------|
| **companyId** | `central-motors-rtb` |
| **Display name** | Central Motors Rustenburg |
| **Policy classification** | **PILOT** |
| **Must not be classified as** | PRODUCTION CUSTOMER (unless explicit authorized business decision) |

Central Motors runs real production workloads (WhatsApp, CRM, knowledge, live inventory). That activity supports **pilot validation**; it does **not** by itself confer **PRODUCTION CUSTOMER**.

**Transition to PRODUCTION CUSTOMER** requires:

1. Explicit authorized business decision (documented operator action), and  
2. Future: durable metadata + audit trail (see §7).

Until then, all platform analytics must count Central Motors under **Pilots**, not **Production customers**.

---

## 4. Client #2 (acceptance)

| Field | Value |
|-------|--------|
| **companyId** | `client2-tp2c-accept-20260917` |
| **Display name** | TP-2C Acceptance Client 2 |
| **Policy classification** | **ACCEPTANCE** |

This tenant is **fully functioning and independently provisioned** (TP-3D validated). Its **purpose** remains acceptance of provisioning, Portal, Marketplace, and isolation—not a commercial customer relationship.

**Must not** be counted as a real customer because it has agents, KB, pack install, or Portal access.

Related acceptance tenant from census:

| companyId | Policy class |
|-----------|----------------|
| `client2-tp1-accept-20260915` | **ACCEPTANCE** |

---

## 5. Demo / showcase tenants

| companyId | Name | Policy class |
|-----------|------|----------------|
| `demo-central-motors` | Central Motors | **DEMO/SHOWCASE** |
| `demo-econo-funerals` | Econo Funerals | **DEMO/SHOWCASE** |

Demo tenants may contain sample CRM, knowledge, and integration stubs. They are **not** production customers.

---

## 6. Test tenants (69 from MC-U-0.1)

All **69** tenants classified **TEST** in MC-U-0.1 remain **TEST** under this policy.

**This gate does not:**

- delete, archive, or mutate any test tenant  
- run TENANT-CLEANUP  

Test tenants are **evidence** of development and gate history. A future **TENANT-CLEANUP** gate may define archive/delete/fixture rules separately.

---

## 7. PRODUCTION CUSTOMER rule

### Definition

A tenant is a **PRODUCTION CUSTOMER** only when ZiricAI has **explicitly designated** it as a genuine external customer account.

### Not sufficient evidence (alone or combined)

- Populated CRM or conversations  
- WhatsApp connected  
- Billing record present  
- Active for N days  
- Portal users or memberships  
- Does not match test naming patterns  
- “Looks like” a real business name  

These may inform **operator investigation**; they **do not** establish class.

### Authorized establishment (initial)

| Mechanism | Role |
|-----------|------|
| **`CENSUS_KNOWN_REAL_CUSTOMER_IDS`** | Interim **operator-controlled** registry for census and read-only tooling (comma-separated env var). |
| **Operator policy + audit** | Human decision recorded outside Firestore until metadata exists. |
| **Future commercial onboarding** | System-of-record flow that sets class only on successful commercial designation. |

### Future durable metadata (not implemented in MC-U-0.2)

Proposed field on company root settings (names illustrative):

```json
{
  "settings": {
    "tenantClass": "production_customer",
    "tenantClassSetAt": "2026-…",
    "tenantClassSetBy": "uid-or-operator-id",
    "tenantClassReason": "Signed starter agreement …"
  }
}
```

Requirements for a future implementation gate:

- Writes only via **platform auth** (superadmin / API key) or commercial onboarding  
- **Audit log** entry on every change  
- **No backfill inference** from census heuristics  
- Census script may **read** `settings.tenantClass` as fact; census must not **write** it  

Canonical stored values (future implementation should normalize):

| Policy label | Suggested stored token |
|--------------|-------------------------|
| TEST | `test` |
| ACCEPTANCE | `acceptance` |
| DEMO/SHOWCASE | `demo_showcase` |
| PILOT | `pilot` |
| PRODUCTION CUSTOMER | `production_customer` |
| UNKNOWN | `unknown` |

---

## 8. Classification evidence model

Designed for Mission Control visibility and census exports. **MC-U-0.2 does not persist this to production.**

### Per-tenant evidence record (logical schema)

```json
{
  "companyId": "central-motors-rtb",
  "classification": "PILOT",
  "classificationSource": "operator_policy",
  "classificationConfidence": "HIGH",
  "evidence": [
    {
      "type": "policy",
      "ref": "docs/architecture/TENANT_TAXONOMY.md §3",
      "summary": "Designated golden pilot tenant",
      "at": "2026-09-18T00:00:00.000Z"
    }
  ],
  "operatorAction": null,
  "censusVersion": "MC-U-0.1"
}
```

### Field definitions

| Field | Description |
|-------|-------------|
| **classification** | One of the authoritative classes (§1). |
| **classificationSource** | How the class was determined: `gate_harness`, `census_heuristic`, `operator_policy`, `operator_registry`, `stored_tenant_class`, `commercial_onboarding`, `manual_review`. |
| **classificationConfidence** | `HIGH` \| `MEDIUM` \| `LOW` — operator-facing safety hint. |
| **evidence[]** | Machine- and human-readable reasons (patterns matched, policy refs, registry ids). |
| **operatorAction** | When class set by person: `{ uid, at, reason }` (future). |
| **timestamp** | When this classification snapshot was produced. |

### Confidence examples (MC-U-0.1 aligned)

| Tenant | classification | classificationSource | classificationConfidence |
|--------|----------------|----------------------|---------------------------|
| `central-motors-rtb` | PILOT | operator_policy | HIGH |
| `client2-tp2c-accept-20260917` | ACCEPTANCE | operator_policy | HIGH |
| `portal-4b-registry-test-*` | TEST | gate_harness | HIGH |
| Unreviewed odd id | UNKNOWN | manual_review | LOW |

Heuristic census (MC-U-0.1 script) may set `classificationSource: census_heuristic` with confidence **HIGH** only when multiple independent signals agree; otherwise **MEDIUM** or **LOW**.

---

## 9. Mission Control semantics

### Terminology

| Term | Meaning |
|------|---------|
| **Tenant** | Any Firestore root `companies/{companyId}` record listed in Mission Control. |
| **Production customer** | Tenant with class **PRODUCTION CUSTOMER** only. |
| **Customer (CRM)** | End consumer of a tenant’s business (CRM contact)—**not** the tenant itself. |

### Forbidden business metrics

Mission Control and ZiricAI platform analytics **must never** present:

> **“74 tenants = 74 customers”**

or equivalent without explicit class breakdown.

### Required platform metric breakdown (future MC-U-2)

Report separately, from authoritative class + billing/status:

- Total tenant records  
- Production customers  
- Pilots  
- Acceptance tenants  
- Demo / showcase tenants  
- Test tenants  
- Unknown  

Optional cross-tabs (not substitutes for class):

- Tenants with `billing.status = trialing`  
- Tenants with `company.status = suspended`  
- WhatsApp-connected tenants (integration-derived)  

---

## 10. Billing separation (examples for MC-U-2 / MC-U-3)

All examples use **tenantClass** (policy dimension) separate from **billing** (commercial dimension).

**Example A — Acceptance on trial**

- tenantClass: **ACCEPTANCE**  
- billing.planId: `trial`  
- billing.status: `trialing`  
- billing.trialEndsAt: `2026-10-01`  
- company.status: `active`  

**Example B — Pilot on starter**

- tenantClass: **PILOT** (`central-motors-rtb`)  
- billing.planId: `starter`  
- billing.status: `active`  
- company.status: `active`  

**Example C — Future production customer on trial**

- tenantClass: **PRODUCTION CUSTOMER**  
- billing.planId: `trial`  
- billing.status: `trialing`  

Platform billing console (MC-U-3) aggregates **billing** across tenants; platform dashboard (MC-U-2) aggregates **class** counts. UI must label axes clearly.

---

## 11. MC-U-0.1 snapshot (current production classification)

As of census **2026-09-18** (74 tenant records):

| Class | Count |
|-------|------:|
| PILOT | 1 |
| ACCEPTANCE | 2 |
| DEMO/SHOWCASE | 2 |
| TEST | 69 |
| PRODUCTION CUSTOMER | 0 |
| UNKNOWN | 0 |

**Production customers (commercial designation):** **0**

This snapshot is **policy-aligned** with §3–§6. Re-run census to refresh counts; policy classes for named tenants remain unless explicitly changed via §7.

---

## Operator authorization rules

| Action | Who | Requirement |
|--------|-----|-------------|
| Designate **PRODUCTION CUSTOMER** | Authorized platform operator | Documented decision; interim: `CENSUS_KNOWN_REAL_CUSTOMER_IDS` or future `settings.tenantClass` + audit |
| Designate **PILOT** | Authorized platform operator | Policy doc + registry (Central Motors pre-defined) |
| Reclassify TEST → archived | Future TENANT-CLEANUP gate | Not in MC-U-0.2 |
| Infer class from CRM/WhatsApp | **Forbidden** | — |

---

## Migration considerations (future gates)

1. **MC-U-1** — UI: “Tenants” not “Customers”; show class badges and filters; no Firestore writes required if class derived from policy registry + heuristics + read of future `settings.tenantClass`.  
2. **Metadata gate** — Implement `settings.tenantClass` writes with audit; backfill **only** operator-approved rows (CM stays PILOT until explicit promotion).  
3. **Census tooling** — Decide whether `mission-control-tenant-census-readonly.mjs` becomes permanent operator toolkit after taxonomy is stable.  
4. **Analytics** — Platform KPIs consume class dimension; tenant KPIs remain tenant-scoped Portal/CRM analytics.

---

## Fields future implementation may use

| Field | Location | Purpose |
|-------|----------|---------|
| `settings.tenantClass` | `companies/{id}` | Durable classification token |
| `settings.tenantClassSetAt` | same | Audit |
| `settings.tenantClassSetBy` | same | Audit |
| `settings.tenantClassReason` | same | Operator note |
| Census export | `classification`, `classificationSource`, `classificationConfidence`, `evidence[]` | Read-only inventory |
| Env `CENSUS_KNOWN_REAL_CUSTOMER_IDS` | Operator runtime | Interim PRODUCTION CUSTOMER registry |

---

## Explicit: do not modify (locked / out of scope)

Until authorized by a specific gate, **do not change** for MC-U-0.2 purposes:

| Area | Reason |
|------|--------|
| TP-3D / `client2-tp2c-accept-20260917` provisioning architecture | CLOSED |
| `services/core/tenantContext.js` strict enforcement | Regression risk |
| Portal auth, hub metrics (PORTAL-METRICS-1) | Separate backlog |
| Production Firestore tenant records | No writes in policy gate |
| Mission Control UI | MC-U-1 |
| Deploy / Railway / Netlify env | Not authorized |

---

## Gate closure

| Item | Status |
|------|--------|
| MC-U-0.2 policy artifact | **COMPLETE** |
| Production data modified | **No** |
| Implementation code | **No** |

**Next authorized product gate:** **MC-U-1 — Mission Control Tenants** (terminology, class breakdown header, filters; TP-3D remains untouched).
