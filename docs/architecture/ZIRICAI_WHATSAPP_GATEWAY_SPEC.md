# ZiricAI WhatsApp Gateway — Architecture & Implementation Specification

**Status:** G1–G4 implemented on production API (registry routing **primary** as of 2026-11-01)  
**Product name:** ZiricAI WhatsApp Gateway  
**Default model:** Hybrid **C** — managed ZiricAI numbers by default; Bring Your Own WhatsApp (BYO) / Embedded Signup as advanced  
**Foundation:** Existing Path B (shared platform token, multiple Phone Number IDs, single webhook, tenant-scoped Sarah)  
**Production evidence:** Phase 0 read-only audit (`scripts/phase0-whatsapp-gateway-audit-readonly.mjs`, run 2026-10-31 UTC)

**Related docs:** [INTEGRATION_HUB.md](./INTEGRATION_HUB.md), [WHATSAPP_TENANT_OPERATIONS.md](../deployment/WHATSAPP_TENANT_OPERATIONS.md), [META_CONSOLE_SETUP.md](../deployment/META_CONSOLE_SETUP.md), [WHATSAPP.md](../deployment/WHATSAPP.md)

---

## Executive summary

ZiricAI already operates a **managed multi-tenant WhatsApp pattern**: one platform Meta integration, one webhook, one `WHATSAPP_TOKEN`, and **per-tenant Phone Number IDs** that route inbound traffic to the correct `companyId`, Sarah, knowledge base, and CRM.

Phase 0 confirmed that this works in production for **central-motors-rtb** (shared token + phone suffix **3699**) and a second managed line (**3700** for demo-econo-funerals). Mission Control can **assign** and **release** pool numbers. The gap is **governance**: the Firestore pool is **inventory**, not the **authoritative allocation system**, and **four tenants** currently have active/connected integration docs claiming the same Phone Number ID suffix **3699** — making collection-group routing **nondeterministic**.

This specification defines how to **formalize** the existing implementation into the **ZiricAI WhatsApp Gateway** without replacing the integration layer. **Registry-first routing must not go live** until duplicate **3699** remediation is designed, operator-approved, and executed.

**Strict boundary (Phase 1):** No implementation in this document. No automatic cleanup of duplicates. **Client Zero (`ziricai`, phone suffix 6157, `credentialsSource: tenant`)** is explicitly out of scope for gateway hardening migrations.

---

## 1. Current architecture (verified)

### 1.1 Platform layer (ZiricAI-owned infrastructure)

| Concern | Current behavior | Code / config references |
|--------|-------------------|---------------------------|
| Meta app & secrets | Server env: `META_APP_ID`, `META_APP_SECRET`, `VERIFY_TOKEN`, optional Embedded Signup config | [META_CONSOLE_SETUP.md](../deployment/META_CONSOLE_SETUP.md), `api/app.js` startup |
| Platform access token | Railway `WHATSAPP_TOKEN` used for managed (`credentialsSource: env`) outbound | `services/integrations/whatsappCredentials.js` |
| Bootstrap phone ID | Railway `PHONE_NUMBER_ID` seeds pool inventory; **not** the only send identity per tenant | `whatsappNumberPoolService.ensureEnvSeedNumber()`, `platformWhatsAppIntegrationService.assessRuntimeReadiness()` |
| Webhook | Single canonical `GET/POST /webhook` | `services/integrations/webhookRouter.js`, `api/app.js` |
| Signature validation | Meta webhook signature on POST | `services/integrations/metaWebhook.js`, `handleWhatsAppWebhook()` |

Phase 0 production snapshot (evidence, suffixes only): `PHONE_NUMBER_ID` suffix **3699**; platform token and webhook env present; `PUBLIC_API_BASE_URL` → Railway.

### 1.2 Inbound path (as implemented today)

```text
Meta POST /webhook
  → validateMetaWebhookSignature(req)
  → extract phone_number_id from body.entry[0].changes[0].value.metadata
  → resolveCompanyFromPhoneNumberId(phoneNumberId)
       └─ findActiveWhatsAppIntegrationByPhoneNumberId(phoneNumberId)
            └─ Firestore collectionGroup(integrations)
                 .where("phoneNumberId", "==", id)
                 .where("provider", "==", "whatsapp")
                 .limit(10)  → first active/connected match
  → whatsappAdapter.receiveMessage(ctx, body)
  → conversationPipeline.ingestBatch → messageWorker → Sarah (tenant-scoped)
```

**Files:** `services/integrations/webhookRouter.js`, `services/tenants/integrationService.js` (`queryFirestoreWhatsAppByPhoneNumberId`), `services/integrations/adapters/whatsappAdapter.js`, `services/integrations/conversationPipeline.js`.

**Important:** Inbound routing **does not** consult `platform/whatsapp/numbers` today.

### 1.3 Outbound path (managed numbers)

For `credentialsSource: env`:

- Bearer token = `process.env.WHATSAPP_TOKEN`
- Graph send identity = tenant integration **`phoneNumberId`**
- Readiness requires both (`assessRuntimeReadiness`)

**Files:** `services/integrations/whatsappCredentials.js`, `services/tenants/platformWhatsAppIntegrationService.js` (shared-token multi-phone comment at `assessRuntimeReadiness`).

For `credentialsSource: tenant` (BYO): tenant-stored OAuth token; platform token not used for outbound.

### 1.4 Tenant integration document (projection today, authority in practice)

- Path: `companies/{companyId}/integrations/whatsapp` (doc id `whatsapp`)
- Lifecycle: register → configure → activate / deactivate
- Cross-tenant guard on configure: `assertNoCrossTenantActivePhone()` → 409 if another tenant is active on same `phoneNumberId`

**Files:** `services/tenants/platformWhatsAppIntegrationService.js`, `services/tenants/integrationService.js`.

### 1.5 Number pool (inventory today)

- Collection: `platform/whatsapp/numbers/{numberId}`  
- Schema helpers: `services/database/schema.js` (`platformWhatsAppNumbersCollectionPath`)
- Service: `services/platform/whatsappNumberPoolService.js`
  - `upsertWhatsAppPoolNumber`, `listWhatsAppPoolNumbers`
  - `ensureEnvSeedNumber()` — creates **AVAILABLE** row from `PHONE_NUMBER_ID`
  - `assignWhatsAppPoolNumberToCompany()` — claim pool → configure → activate tenant
  - `releaseWhatsAppPoolNumber()` — AVAILABLE again; deactivate tenant if phone matches

Phase 0: one pool doc `wa-env-…3699` status **available**, while **central-motors-rtb** is **active** on the same phone suffix — **registry ⊄ routing**.

### 1.6 Mission Control (operator workflow — exists)

- List/create pool: `GET/POST /api/platform/whatsapp-numbers` (`api/app.js`)
- Assign: `POST /api/platform/companies/:companyId/integrations/whatsapp/assign-pool-number`
- Release: `POST /api/platform/whatsapp-numbers/:numberId/release`
- UI: `js/admin/modules/companies.js` — “Use ZiricAI Test Number”, release, configure

### 1.7 Company Portal (customer workflow — BYO-first today)

- Primary CTA: **Connect WhatsApp** → Embedded Signup (`js/portal/whatsappConnect.js`, `js/portal/modules/integrations.js`)
- Edit details / credentials source: `js/portal/whatsappEditDetails.js`

**Proposed (not implemented):** managed activation as default; BYO under Advanced.

### 1.8 Sarah and tenant isolation (exists)

After `companyId` resolution, all conversation, CRM, knowledge, and AI behavior are tenant-scoped through existing services. WhatsApp is transport only.

**Reference:** [INTEGRATION_HUB.md](./INTEGRATION_HUB.md), `services/ai-core/whatsappConversationPrompt.js` (per-`companyId` prompts).

### 1.9 Existing vs proposed (summary)

| Capability | Exists | Proposed change |
|------------|--------|-----------------|
| Single webhook + platform token | Yes | Formalize as Gateway contract |
| Multi-phone on one token | Yes | Document + enforce via registry |
| Pool assign/release (MC) | Yes | Registry-first + sync projection |
| Registry authoritative | **No** | **P0** |
| Deterministic inbound routing | **No** (3699 duplicates) | **P0** remediation + registry-first |
| Portal managed onboarding | **No** (BYO default) | **P2** UX |
| Usage/billing per tenant | Partial schema | **P2** attribution |

---

## 2. Official product architecture — three connection methods

### A. Managed ZiricAI WhatsApp (default)

- **Customer experience:** “Activate your ZiricAI WhatsApp line” — no Meta login.
- **Infrastructure:** ZiricAI WABA, platform `WHATSAPP_TOKEN`, numbers registered in Meta and **platform registry**.
- **Tenant record:** `credentialsSource: env`, `phoneNumberId` from allocation.
- **Operator / automation:** Provision number in Meta → upsert pool → assign to `companyId`.

### B. Customer-owned WhatsApp / Embedded Signup (advanced / enterprise)

- **Customer experience:** Portal **Bring your own number** → Meta OAuth / Embedded Signup.
- **Infrastructure:** Customer WABA; `credentialsSource: tenant`; tenant token storage.
- **Routing:** Still single webhook; still `phoneNumberId` → `companyId`.
- **Isolation from managed path:** BYO must not share platform registry rows with managed `env` numbers without explicit `connectionMethod: byo` metadata.

### C. Operator-assisted configuration (controlled exception)

- Manual configure / activate in Mission Control when Meta or customer constraints block self-serve.
- Same technical paths as A or B; audit trail required.

**Principle:** ZiricAI owns and operates **managed** infrastructure. Customers receive **allocations**, not Meta developer projects.

---

## 3. Authoritative number registry

### 3.1 Goal

`platform/whatsapp/numbers/{numberId}` becomes the **system of record** for:

- Which Meta **Phone Number IDs** exist on the platform WABA
- Which number is **available**, **reserved**, or **assigned**
- Which **`companyId`** (if any) holds the active allocation
- Audit history for assign / release / suspend

Tenant integration documents become **projections**: they must match the registry for managed numbers, not the other way around.

### 3.2 Proposed logical schema

Document id `{numberId}` is a **stable platform id** (e.g. `wa-env-1209265748933699` or `wa-prod-{phoneNumberId}`), not necessarily equal to Meta’s phone number id string.

| Field | Role | Authoritative? | Notes |
|-------|------|----------------|-------|
| `phoneNumberId` | Meta Graph phone number id | **Yes** | Unique among non-retired rows |
| `wabaId` | WhatsApp Business Account id | **Yes** (managed) | Platform WABA for managed; customer WABA for BYO |
| `displayPhoneNumber` | E.164 display | Derived / synced | From Meta or operator |
| `metaBusinessId` | Meta Business Portfolio id | Optional ref | For support / console deep links |
| `connectionMethod` | `managed` \| `byo` | **Yes** | Drives credential path |
| `registrationStatus` | Meta registration state | **Yes** | See lifecycle §8 |
| `allocationStatus` | `available` \| `reserved` \| `assigned` \| `suspended` \| `retired` | **Yes** | Replaces informal `status` over time |
| `assignedCompanyId` | Active tenant | **Yes** when assigned | Null when available |
| `assignedSarahId` | Optional AI employee id | Optional | Default Sarah if multi-employee |
| `credentialsSource` | `env` \| `tenant` | **Yes** | Managed → `env`; BYO → `tenant` |
| `registeredAt` | First known Meta registration | **Yes** | Set when number added to WABA |
| `assignedAt` | Current assignment start | **Yes** | Updated on each assign |
| `releasedAt` | Last release timestamp | **Yes** | Audit |
| `createdAt` / `updatedAt` | Audit | **Yes** | |
| `allocationHistory[]` | Append-only events | **Yes** | `{ at, action, companyId, operatorId, reason, leaseId }` |
| `leaseId` | Concurrency token | Operational | Already used in assign flow |
| `kind` | `test` \| `production` | **Yes** | Existing pool field |
| `label`, `notes` | Operator | Optional | |
| `lastHealthCheckAt` | Diagnostics | Derived | |
| `lastRoutingVerifiedAt` | Diagnostics | Derived | Controlled routing test |

**Storage note:** Large `allocationHistory` may move to subcollection `platform/whatsapp/numbers/{id}/history/{eventId}` if document size grows; spec treats history as **required logically**, physical layout is implementation choice.

### 3.3 Registry ↔ tenant integration relationship

**Managed number invariant (target):**

```text
registry.allocationStatus == "assigned"
  ⇒ registry.assignedCompanyId == C
  ⇒ companies/C/integrations/whatsapp.phoneNumberId == registry.phoneNumberId
  ⇒ companies/C/integrations/whatsapp.credentialsSource == "env"
  ⇒ companies/C/integrations/whatsapp.status == active
```

**Available number invariant:**

```text
registry.allocationStatus == "available"
  ⇒ registry.assignedCompanyId == null
  ⇒ no active tenant integration references registry.phoneNumberId
```

**BYO invariant:**

- Registry row may exist for inventory/audit with `connectionMethod: byo`, or BYO may use tenant-only docs until Phase 2+ — **open decision** (see §14).

### 3.4 Sync direction (target)

| Operation | Registry | Tenant integration |
|-----------|----------|-------------------|
| Assign managed | Write first (claim) | Configure + activate projection |
| Release | Clear assignment | Deactivate + clear phone fields |
| BYO Embedded Signup complete | Optional register row | Tenant token + phone ids |
| Inbound routing (future) | **Read registry first** | Validate projection matches |

---

## 4. Assignment invariants

### 4.1 Enforceable rules

1. **One active Phone Number ID → at most one `companyId`** (platform-wide).
2. **One managed number → at most one assigned company** at a time.
3. **`available` ⇒ no active tenant** holds that `phoneNumberId`.
4. **Assign and release are auditable** (history + operator id where applicable).
5. **Release does not delete** the Meta phone number — only platform allocation.
6. **BYO numbers** use `credentialsSource: tenant`; managed assign must not overwrite BYO tenant tokens without explicit migration workflow.
7. **Failed assign must rollback** pool claim (partially implemented in `assignWhatsAppPoolNumberToCompany` catch block).

### 4.2 Concurrency

Current pattern: write pool `in_use` + `leaseId` before tenant configure (`whatsappNumberPoolService.js`).

**Target:**

- Firestore transaction: registry claim + verify no other active integration on same `phoneNumberId` (collection group query or maintained index).
- Idempotent assign API keyed by `leaseId` or operator request id.

### 4.3 Status vocabulary alignment

Today: pool `status` (`available`, `in_use`, …) vs integration `status` (`active`, `connected`, `pending_configuration`, …).

**Spec:** map `in_use` → `allocationStatus: assigned`; treat integration `connected` as active for routing until legacy data is normalized.

---

## 5. Duplicate routing incident — Phone Number ID suffix 3699

### 5.1 Phase 0 findings (production evidence)

**Full Meta Phone Number ID (from codebase seed):** `1209265748933699` (`services/storage/seedDemoTenants.js` — `CENTRAL_MOTORS_PHONE_NUMBER_ID`).

**Pool registry:**

| poolId | allocation | assignedCompanyId |
|--------|------------|-------------------|
| `wa-env-1209265748933699` | **available** | null |

**Active / connected tenant integrations claiming suffix 3699:**

| companyId | integration status | credentialsSource | Classification (TBD by operator) |
|-----------|-------------------|-------------------|----------------------------------|
| **central-motors-rtb** | active | env | **Likely legitimate backbone consumer** (sample tenant on platform line) |
| p0-2-final-muaguvq8-usmg | connected | null | Likely test / legacy P0 run |
| p0-2-final-muagwqwu-wnn1 | connected | null | Likely test / legacy P0 run |
| p0-2c-live-muag3zbz-3vzt | connected | null | Likely test / legacy P0 run |

**Routing behavior today:** `findActiveWhatsAppIntegrationByPhoneNumberId` returns the **first** active doc from an unordered collection group query (limit 10) — **nondeterministic** among four matches.

**Mismatch:** Pool says **available**; routing says **at least one active tenant** (central-motors-rtb).

### 5.2 Read-only reconciliation report (G2 — implemented)

A future script/report (operator-only) should output:

1. All integration docs with `phoneNumberId` = X (status, company, credentials, updatedAt).
2. Registry row for X (allocation, assignedCompanyId).
3. Pool vs routing alignment flag.
4. **Recommended classification** per row: `keep_active`, `deactivate_candidate`, `needs_review`.
5. **No auto-fix** — export JSON/CSV for Mission Control review.

Reuse/extend: `scripts/phase0-whatsapp-gateway-audit-readonly.mjs`.

### 5.3 Operator-approved remediation process (mandatory before registry-first routing)

| Step | Action | Auto? |
|------|--------|-------|
| 1 | Run reconciliation report | No |
| 2 | Product/ops classify each of the four tenants | No |
| 3 | Confirm **single canonical owner** for 3699 (expected: central-motors-rtb until reallocation) | No |
| 4 | For each **deactivate_candidate**: schedule deactivate + clear phone fields (or full release if pool-assigned) | **Operator approval** |
| 5 | Update registry: `assigned` + `assignedCompanyId` aligned with canonical owner | **Operator approval** |
| 6 | Run controlled routing test (§7) | No |
| 7 | Enable registry-first routing feature flag | **Explicit go-live approval** |

**Phase 1 constraint:** **Do not** deactivate, reassign, delete, or modify any of these records without following the above.

---

## 6. Inbound and outbound routing

### 6.1 Target inbound flow (Gateway)

```text
Meta POST /webhook
  → signature validation
  → extract phone_number_id
  → Gateway.resolveTenant(phoneNumberId):
       1) Read platform/whatsapp/numbers where phoneNumberId == id
          AND allocationStatus == assigned
          → companyId = assignedCompanyId
       2) Validate tenant integration projection matches (phone + active)
       3) If mismatch → log CRITICAL, optional safe fallback (see below)
  → ingest → Sarah pipeline for companyId
  → 200 OK to Meta
```

**Non-goal:** Permanent reliance on collection-group “first match”.

### 6.2 Migration fallback (safe introduction)

Feature flag e.g. `WHATSAPP_GATEWAY_REGISTRY_ROUTING=shadow|primary|off`.

| Mode | Behavior |
|------|----------|
| `off` | Current: integration collection group only |
| `shadow` | Compute registry route + legacy route; log disagreements; serve legacy |
| `primary` | Registry authoritative; legacy only if registry miss + explicit allowlist |

**Gate:** `primary` only after 3699 remediation complete and shadow period clean.

### 6.3 Outbound (managed)

Unchanged mechanism, explicit contract:

- Token: `resolveWhatsAppCredentials(companyId)` → `env` → `WHATSAPP_TOKEN`
- Graph phone id: tenant integration `phoneNumberId` must equal registry assignment for managed numbers
- Pre-send check (future): registry confirms assignment before Graph POST

### 6.4 Outbound (BYO)

- Token: tenant OAuth only
- Registry optional; integration doc authoritative for credentials until BYO registry design locked

---

## 7. Readiness and diagnostics

### 7.1 Layered readiness (not binary “token present”)

| Layer | Meaning | Checks |
|-------|---------|--------|
| L1 Meta registered | Number exists on WABA | Meta API / operator attestation |
| L2 Pool inventory | Row exists in registry | Firestore |
| L3 Available | `allocationStatus: available` | Registry |
| L4 Assigned | Registry assignedCompanyId set | Registry + tenant doc |
| L5 Integration configured | phoneNumberId, credentialsSource | Tenant doc |
| L6 Platform credentials | WHATSAPP_TOKEN (managed) | Env |
| L7 Webhook path | Verify token + recent POST | Logs / health |
| L8 Outbound | Test template or session message | Controlled test |
| L9 Inbound + Sarah | End-to-end Hi → reply | Pilot checklist |

**Current `assessRuntimeReadiness`:** L5–L6 partial only (`platformWhatsAppIntegrationService.js`). Spec expands to L1–L9 for Gateway SLA.

### 7.2 Controlled routing test

- Operator triggers from MC with `phoneNumberId` (or companyId).
- Server resolves **expected** `companyId` via registry (then projection).
- Optional: inject synthetic webhook payload in **staging only**; production uses “send test message from Meta” + log correlation id.
- Report: expected vs actual `companyId` in ingest logs — **no customer message content** in report.

---

## 8. Number lifecycle

```text
Registration → Available → Reserved → Assigned → Active → Suspended → Released → (Available | Retired)
```

| State | Meaning | Meta op? | Firestore op? | Operator approval? |
|-------|---------|----------|---------------|-------------------|
| **Registration** | Number added to WABA in Meta | Yes | Create registry row | Often yes |
| **Available** | In pool, unassigned | No | Registry | No |
| **Reserved** | Held for pending onboarding | No | Registry | Optional |
| **Assigned** | Linked to companyId | No | Registry + tenant configure | Yes (MC) |
| **Active** | Messaging enabled | Maybe (Meta status) | activate integration | Yes |
| **Suspended** | Billing/policy pause | Maybe | Registry + deactivate | Yes |
| **Released** | Tenant unbound | No | Registry available + tenant cleared | Yes |
| **Retired** | Number removed from service | Meta delete optional | Registry retired | Yes |

**Offboarding:** Release allocation → deactivate tenant integration → retain registry row and Meta registration unless number is permanently retired.

**Reallocation:** Only from **Available**; never skip **Released** when moving between tenants unless explicit hot-swap procedure with audit.

---

## 9. Client Zero protection and migration

### 9.1 Current state (Phase 0 evidence)

| Attribute | ziricai |
|-----------|---------|
| Phone suffix | **6157** |
| credentialsSource | **tenant** |
| displayPhoneNumber | +27 63 685 2131 |
| WABA suffix (integration doc) | **683197** |
| embeddedSignupCompletedAt | present (2026-10-31) |
| Railway `PHONE_NUMBER_ID` | suffix **3699** (backbone — **different** from Client Zero phone) |

Client Zero is on a **separate Meta path** from the working managed backbone (3699 / central-motors-rtb).

### 9.2 Explicit prohibitions during gateway hardening

- No automatic migration to managed pool
- No credential replacement on `ziricai`
- No reassignment of 6157 without separate approved migration project
- No changes to `ensureClientZeroWhatsAppIntegration()` behavior without explicit spec + approval (`services/clientZero/syncWhatsAppIntegration.js`)
- No Embedded Signup flow changes targeted at Client Zero until migration project

### 9.3 Future migration (separate authorization)

Requires: written approval, preflight (Graph token valid, WABA subscribe, webhook messages), choose target managed number or keep BYO, cutover window, rollback (restore tenant doc + registry), post-cutover routing test.

---

## 10. Usage, billing, and tenant isolation

### 10.1 Isolation (non-negotiable)

Shared webhook and token **must not** imply shared:

- Conversations / threads
- CRM records
- Knowledge bases
- Sarah memory / prompts
- End-user PII across companies

Isolation key: **`companyId`** resolved before any ingest or outbound send.

### 10.2 Usage attribution (proposed)

On each inbound/outbound WhatsApp event after tenant resolution, emit platform intelligence event:

- `companyId`, `phoneNumberId` (masked in logs), `channel: whatsapp`, direction, timestamp, message id (wamid), optional conversation id

**Schema reference:** `PLATFORM_INTELLIGENCE` in `services/database/schema.js` (message events / rollups — wire in Phase P2).

### 10.3 Billing

Aggregate per `companyId` per period: conversation counts, template vs session messages, failed sends. Map to plan quotas in billing service (future).

---

## 11. Mission Control and Company Portal (proposed UX — not Phase 1 implementation)

### Mission Control

- Number inventory (registry): registration, allocation, kind, display
- Assign / release / reserve with history
- Duplicate/conflict dashboard (3699-style reports)
- Readiness L1–L9 per number or per company
- Controlled routing test trigger
- No secrets in UI

### Company Portal

- **Default:** “Activate ZiricAI WhatsApp line” (status: pending provisioning → active)
- Show assigned display number and readiness
- **Advanced:** “Bring your own WhatsApp” → existing Embedded Signup
- Hide Meta developer jargon on default path

---

## 12. Implementation roadmap

Each phase is independently reviewable. Programme milestones below supersede the original G5–G11 numbering (see document history).

### Gateway implementation status (programme view)

| Milestone | Status | Notes |
|-----------|--------|--------|
| G1 — Registry schema & authority | **Merged** | Normalization, allocation fields, history, operator attribution, API sanitize |
| G2 — Read-only reconciliation | **Merged** | Service, CLI, `GET …/reconciliation`, MC API helper |
| G2.1 — Production deploy & verification | **Pending** | See `ZIRICAI_WHATSAPP_GATEWAY_G2_1_CHECKLIST.md` |
| G3 — Operator-approved remediation | **Not authorized** | No deactivations; no registry assign to Central Motors |
| G4 — Registry-first routing | **Complete** | `WHATSAPP_GATEWAY_REGISTRY_ROUTING=primary` on Railway (post-deploy) |
| Client Zero (6157) | **Frozen** | Tenant-token integration untouched |

**Next recommended step:** **G2.1** (not G3).

### Phase G0 — Specification (this document)

- **Dependencies:** Phase 0 audit  
- **Deliverable:** This file  
- **Acceptance:** Stakeholder sign-off  

### Phase G1 — Registry schema & authority (P0)

**Status:** **Merged** — `services/platform/whatsappGatewayRegistry.js`; pool read/write in `whatsappNumberPoolService.js`.

- Extend pool model to full registry fields; migration for existing `wa-env-*` doc  
- **Acceptance:** Single writer path for allocation; docs match production row  

### Phase G2 — Duplicate reconciliation tooling (P0)

**Status:** **Merged** — `reconcileWhatsAppPhoneAssignments.js`, CLI, authenticated reconciliation endpoint, MC helper. **No auto-deactivate.**

- **Acceptance:** 3699 classified; evidence baseline stored (see §13)

### Phase G2.1 — Production deployment & verification (P0 gate)

**Status:** **Pending** — deploy not confirmed on Railway.

- Checklist: `docs/architecture/ZIRICAI_WHATSAPP_GATEWAY_G2_1_CHECKLIST.md`  
- Parity script: `scripts/g2-1-verify-reconciliation-parity.mjs`  
- **Acceptance:** HTTP report matches CLI for suffix 3699 (four integrations, registry misaligned); baseline archived  

### Phase G3 — Duplicate remediation & registry alignment (P0, operator-driven)

**Status:** **Not authorized.**

- Plan: `docs/architecture/ZIRICAI_WHATSAPP_GATEWAY_G3_REMEDIATION_PLAN.md`  
- Deactivate duplicates **first**; registry assign **last**  
- **Acceptance:** Exactly one active tenant on 3699; pool row **assigned** to approved tenant  

### Phase G4 — Registry-first inbound & outbound routing (P0)

**Status:** **Implemented** — `whatsappGatewayService.js`; inbound via `resolveCompanyFromPhoneNumberId`; outbound registry assert in `whatsapp.js`.

- Resolve tenant via registry; shadow → primary; outbound pre-send registry check for managed numbers  
- **Files:** `webhookRouter.js`, gateway service (proposed)  
- **Acceptance:** Shadow zero disagreements; Hi → correct company; cannot send from unassigned `phoneNumberId`  

### Phase G5 — Assignment/release hardening (P1)

- Transactions, idempotency, history subcollection  
- **Acceptance:** Concurrency test; failed assign leaves no orphan claim  

### Phase G6 — Readiness, diagnostics & operational monitoring (P1)

- L1–L9 surfaced in MC API  
- **Acceptance:** Operator can see why a line is not “operational”  

### Phase G7 — Mission Control Gateway management (P2)

- Inventory + reconciliation + routing test UI  

### Phase G8 — Company Portal managed-number onboarding (P2)

- Default activate flow; BYO under Advanced  

### Phase G9 — Second-tenant pilot (P2)

- New company, assign from pool without per-customer Meta OAuth  

### Phase G10 — Optional BYO WhatsApp pathway (P2)

- Embedded Signup; document separation from managed registry  

---

## 13. Verification & audit artifacts

| Artifact | Purpose |
|----------|---------|
| `scripts/phase0-whatsapp-gateway-audit-readonly.mjs` | Repeatable read-only production snapshot |
| `scripts/reconcile-whatsapp-phone-assignments-readonly.mjs` | Per-phone conflict report (G2) |
| `GET /api/platform/whatsapp-numbers/reconciliation` | MC/API read-only reconciliation (G2); `requirePlatformAccess()` |
| `scripts/g2-1-verify-reconciliation-parity.mjs` | G2.1 CLI vs HTTP parity check |
| `docs/audit/whatsapp-reconciliation-baseline-suffix-3699-2026-10-31.json` | G3 evidence baseline (pre-remediation) |
| `docs/architecture/ZIRICAI_WHATSAPP_GATEWAY_G2_1_CHECKLIST.md` | G2.1 gate |
| `docs/architecture/ZIRICAI_WHATSAPP_GATEWAY_G3_REMEDIATION_PLAN.md` | G3 controlled-operation draft (not authorized) |
| `services/platform/whatsappGatewayRegistry.js` | Allocation schema, history payloads, API sanitize (G1) |
| `docs/deployment/WHATSAPP_TENANT_OPERATIONS.md` | Operator runbook (update after implementation) |

---

## 14. Key unresolved decisions

1. **BYO registry:** Must every BYO number have a `platform/whatsapp/numbers` row, or only managed?  
2. **Legacy status `connected`:** Normalize to `active` in data migration or treat as equivalent in routing?  
3. **Feature flag storage:** Railway env vs Firestore platform config.  
4. **Canonical owner of 3699** after remediation: confirm central-motors-rtb vs rename sample tenant.  
5. **New number provisioning:** Manual Meta UI only vs Graph API automation in MC.  
6. **Client Zero end state:** permanent BYO vs eventual managed number on platform WABA.  
7. **Test tenants (`p0-2-*`):** archive vs delete integration docs after remediation.

---

## 15. Implementation dependencies

- Firestore collection group index on `integrations` (`phoneNumberId`, `provider`) — already required for current routing  
- Operator access to Meta Business Manager for number registration  
- Railway secrets unchanged for managed path (`WHATSAPP_TOKEN`, `META_APP_SECRET`, `VERIFY_TOKEN`)  
- Mission Control platform auth for assign/release APIs  
- Approval workflow for remediation (human, not automated)  
- No dependency on Client Zero migration for G1–G4  

---

## Document history

| Date | Change |
|------|--------|
| 2026-11-01 | Phase 1 initial specification from Phase 0 audit |
| 2026-11-01 | G1/G2 merged; G2.1 gate + G3 plan docs; roadmap renumbered G5–G10; 3699 baseline archived |
| 2026-11-01 | G2.1 production deploy; G3 3699 remediation; G4 registry-first routing |
