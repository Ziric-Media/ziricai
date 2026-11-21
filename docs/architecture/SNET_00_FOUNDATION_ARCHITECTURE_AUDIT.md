# SNET-00 — Sarah Network Foundation Architecture Audit

**Programme:** SNET (Sarah Network) — **Phase SNET-00** (read-only audit; documentation only)
**Date:** 2026-11-08
**Branch audited:** `programme/sarah-u1-u5-r0` @ `7da7dd4` (in sync with `origin/programme/sarah-u1-u5-r0`; **44 commits ahead of `origin/main`**)
**Method:** grep/read of repo + non-destructive git (`status`, `branch -a`, `stash list`, `worktree list`, `rev-list`). **No tests were run, no deploys, no Firestore/production inspection.** Everything below is a static-code claim unless marked otherwise.
**Related documents:** [SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md) (master functional specification — **source of truth for programme phasing and product intent**)

**Companion docs:** [SARAH_NETWORK_PROTOCOL.md](./SARAH_NETWORK_PROTOCOL.md), [SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md](./SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md), [COMPANY_PORTAL_C1_IDENTITY_EVENTS_PLAN.md](./COMPANY_PORTAL_C1_IDENTITY_EVENTS_PLAN.md), [SARAH_APP_DATA_ARCHITECTURE.md](./SARAH_APP_DATA_ARCHITECTURE.md), [SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md), [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md), [../discover/DISCOVER-01-IMPLEMENTATION-NOTES.md](../discover/DISCOVER-01-IMPLEMENTATION-NOTES.md)

> ### Scope note — audit vs SNET-01 master spec
> This audit was drafted when the SNET-01 master spec was **not yet in the repo** (see exit checklist §13 item 17). **[SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md)** now captures the approved vision (sections 1–24, SNET-00–SNET-12 programme, Mission Control module map, data ownership §17, Network API sketch §21).
>
> **Reconciliation still needed:** §3 phase labels here use a **compressed** mapping (e.g. verification folded into later phases) that does not match the spec’s SNET-04 verification / SNET-05 search split one-to-one. §5 maps ownership boundaries to spec §17; implementers should treat the spec as authoritative and update this audit’s gap table when SNET-01 implementation starts.

### Audit vs spec alignment

The audit’s headline gaps align with the spec’s foundational layers: in-memory control plane and missing SN-ID map to **spec §4** (Network Identity Registry) and **§17** (logical services and ownership); mock Discover vs **§6** (search engine) and **§13** (MC search administration); synthetic Company Sarah vs **§8** (AI Agent Registry); Portal onboarding without network publish vs **§3** (registration) and **§18** (end-to-end flow). The audit’s Mission Control module map (**§8**) mirrors **spec §10–§14** (Sarah Network Administration, verification, trust). The proposed `/api/network/v1/…` surface (**audit §9**) is a concrete version of **spec §21**’s Network API. The audit’s **SNET-01a** hardening slice remains valid pre-work before **spec §19**’s SNET-01 identity foundation, because durability and consumer-facing tool policy must land before registry work at scale.

---

## 1. Executive summary

**Bottom line:** A "Sarah Network" already exists as a **protocol + a thin vertical slice** (consumer ↔ one tenant's Company Sarah, plus a single-hop Personal→Company enquiry). It is **not yet a network**: there is **no network entity, no SN-ID, no durable directory, no agent registry, no durable consent, no Discover search backend, no Portal onboarding-to-network flow, and no Mission Control admin surface for any of it.** SNET-01 is therefore mostly **greenfield on top of working chat plumbing**, and the first job is to make the existing slice durable and safe, not to add features.

| # | Headline | Evidence |
|---|----------|----------|
| 1 | **The network control plane is in-memory.** Directory, consent grants, and network requests/audit are JS `Map`s; they vanish on every Railway restart/redeploy and are per-instance (broken with >1 replica). Firestore paths exist only as constants in `schema.js`. | `services/users/businessDirectoryService.js`, `consentGrantService.js`, `services/sarah/network/sarahNetworkStore.js`, `services/database/schema.js` (`SARAH_NETWORK`, `BUSINESS_DIRECTORY`) |
| 2 | **Discover is a mock in the app users actually see.** The rich Sarah App (`users/`, built from `prototype/sarah-app-ux/`) filters 8 hard-coded fixtures client-side (`MOCK_DISCOVER_COMPANIES`); it never calls `GET /api/discover/companies`. The only live endpoint is a pilot list (env IDs → in-memory directory), with no query, no images, no search. Only **SmileMore** is wired end-to-end; the **Central Motors** card points at chat id `central-motors`, which is **not a tenant** (real ids are `demo-central-motors` / `central-motors-rtb`). | `users/js/app.js` (`discoverCompaniesSource`, L7573), `users/js/mock-data.js` (L1177+), `services/api/userConversationRoutes.js` L23, `users/js/live-bridge.mjs` (no discover fetch) |
| 3 | **Company Sarah is synthetic and over-privileged for consumer traffic.** There is no registered agent: `companySarahAgentId` is the string `company_sarah:{companyId}`. The consumer-facing reception context runs the orchestrator with persona `COMPANY_RECEPTION`, which falls through to the **TENANT tool policy** (`toolPolicyForPersona`, `getToolsForContext`), role `"agent"`, and only the `requiredPermissions` filter. ~15 tenant tools declare `requiredPermissions: []` and are not `platformOnly`, so they are model-callable from a consumer chat. The reception KB digest also includes **every non-archived KB doc** (no public/private flag). *Static finding — not dynamically exploited; verify before SNET-01.* | `services/sarah/sarahPersona.js`, `services/sarah/toolRegistry.js`, `services/sarah/permissions.js`, `services/sarah/network/companyReceptionContext.js`, `services/tenants/knowledgeService.js` (no visibility field) |
| 4 | **Conversation data is dual/triple-written with fire-and-forget mirroring and partial durability.** Each message goes to (a) a process `Map`, (b) the tenant CRM thread (`channel: sarah_app`), and (c) Firestore `userConversations` only when `USER_CONVERSATIONS_BACKEND=dual|firestore`; Firestore failures are `console.warn` only (no outbox/retry). **Lists never read Firestore** (`listConversationsByUserId` is unused), so after restart Chats is empty until each thread is reopened. P2P, groups, network-linked threads, blocks, preferences, reactions, media, work links are **memory-only**. | `services/users/userConversationService.js`, `userConversationFirestoreStore.js`, `personToPersonConversationService.js`, `groupConversationService.js`, `sarahNetworkChatLinkService.js`, `chatUxService.js`, `personBlockService.js`, `chatWorkLinkService.js` |
| 5 | **Company onboarding has no "join the network" step, and Mission Control has no network module or role model.** Portal/MC provisioning creates the tenant, a default agent, KB, CRM; nothing publishes a listing or asks consent to appear in Discover (`upsertBusinessDirectoryEntry` has **no callers**). MC is a 17-page console gated by a single `superadmin` role (no sub-roles). Tenant classification (production/pilot/demo/test) exists only as a **browser-side heuristic** — there is no server-side eligibility gate. Also: a probable **defect** — network-linked AI-to-AI threads read `response.reply|summary`, but real dispatch returns `payload.naturalLanguage`, so the company's answer never appears in the thread (the unit test hand-crafts `response.reply`). | `services/platform/onboardingService.js`, `provisioningService.js`, `admin/js/admin/core/moduleRegistry.js`, `admin/js/admin/auth-guard.js`, `js/shared/tenantClassification.js`, `services/users/sarahNetworkChatLinkService.js` L84–103 |

**Recommendation:** approve SNET-00, then run a short **pre-SNET hardening slice ("SNET-01a")** to close findings 1, 3, 4 and the AI-to-AI defect, and only then build the network entity/SN-ID/registry foundation (SNET-01) on a durable store. Details in §12.

---

## 2. Existing reusable components (with file paths)

Legend: **Reuse** = adopt as-is · **Extend** = build on · **Replace** = superseded by SNET · **Caution** = works but has a known limitation.

### 2.1 Identity, auth, consumer account

| Component | Path | Status |
|-----------|------|--------|
| Firebase token → auth resolution | `services/auth/authService.js`, `requireFirebaseAuth.js` | **Reuse** |
| Consumer scope gate (verified token **and** `userProfiles/{uid}` must exist) | `services/auth/consumerAuth.js` (`requireConsumerScope`) | **Reuse** — the network consumer gate |
| Consumer profile bootstrap (`userProfiles`, `userPreferences`, `users.accountKinds += consumer`) | `services/users/consumerProfileService.js`, `services/api/consumerRoutes.js` | **Reuse** — natural mint point for a person SN-ID. Memory fallback when `STORAGE_BACKEND=memory` |
| Identity contracts: `personId ≡ Firebase uid`, `uc_{companyId}_{personId}`, UUID message ids | `services/users/identityContracts.js` | **Reuse / Extend** (add `snId` aliasing, don't change existing ids) |
| Messaging foundation (types, participants, handover states) | `services/users/messagingContracts.js`, `services/database/schema.js` (`CHAT_*`) | **Reuse** — `PARTICIPANT_KINDS` already has `company_sarah`, `personal_sarah`, `employee` |
| Platform auth (superadmin session **or** `PLATFORM_API_KEY`) | `services/auth/platformAuth.js` (`requirePlatformAccess`) | **Reuse** for `/api/platform/network/*` |
| Tenant scope + RBAC (owner/manager/hr/sales/support/reception/marketing/finance/viewer) | `services/auth/permissionsService.js`, `app/js/portal/permissions.js`, `services/tenants/teamMemberService.js` | **Extend** (needs a `canManageNetwork` permission + route mapping in `ROUTE_PERMISSIONS`) |

### 2.2 Tenant (company) registration and provisioning

| Component | Path | Status |
|-----------|------|--------|
| Self-serve onboarding (`startOnboarding`: `companyId = {slug}-{base36 time suffix}`, trial plan, owner binding) | `services/platform/onboardingService.js` L196–295 | **Extend** — add network step |
| Provisioning orchestration (company, departments, default agent, KB, CRM, billing, workflows) | `services/platform/provisioningService.js`, `tenantBootstrap.js` | **Extend** — emit `network.org.provisioned` hook |
| Operator provisioning (MC) | `services/platform/operatorTenantProvisionService.js`, `services/api/*` `POST /api/platform/provision/company` | **Extend** |
| Tenant model fields (`organisationType`, `sector`, `subSector`, `environment`, `country/region/city`, `plan`, `status`) | `services/database/schema.js` `FIELD_SCHEMA.company` | **Reuse** as directory source fields |
| Industry presets (for category facets) | `services/platform/industryPresetRegistry.js`, `industryPresetContext.js`, `js/shared/organisationTaxonomy.js` | **Reuse** (spec says facets must come from presets, not hard-coded chips) |
| Tenant classification (PRODUCTION/CLIENT ZERO/PILOT/ACCEPTANCE/DEMO/TEST/UNKNOWN) | `js/shared/tenantClassification.js` (mirrored to `app/`, `admin/`), `services/clientZero/clientZero.js` | **Caution** — browser-side heuristic only; refers to `docs/architecture/TENANT_TAXONOMY.md`, which **does not exist** in the repo |

### 2.3 Sarah Network protocol slice (U4) and Company Reception

| Component | Path | Status |
|-----------|------|--------|
| Network request orchestration, per-user rate limit (in-process map, 30/hr default) | `services/sarah/network/sarahNetworkService.js` | **Extend**; **Caution**: rate limit is per-instance |
| Request/response store + audit | `services/sarah/network/sarahNetworkStore.js` | **Replace** with Firestore-backed store (same function surface) |
| Company Reception dispatch (sync, OpenAI or canned fallback) | `services/sarah/network/dispatchCompanyReception.js` | **Extend** (queue/worker + allowlisted tool subset) |
| Company Reception context | `services/sarah/network/companyReceptionContext.js` | **Extend** (see Risk R3) |
| Consumer routes (`/api/sarah-network/grants|enquiries|requests`) | `services/api/sarahNetworkRoutes.js` | **Extend** → versioned (§9) |
| Consent grants (in-memory, 24h default expiry, scope + company + disclosedFields) | `services/users/consentGrantService.js` | **Replace/Extend** (durable, revocable, per-field) |
| Discoverability gate (`assertCompanyDiscoverable`) | `services/users/businessDirectoryService.js` | **Replace** with durable directory; **keep the gate function name/contract** |
| Network → Chat thread link (`ai_to_ai`) | `services/users/sarahNetworkChatLinkService.js` | **Extend** (fix reply mapping, make durable) |
| Protocol doc (envelope, anti-spoofing, API sketch) | `docs/architecture/SARAH_NETWORK_PROTOCOL.md` | **Reuse** as protocol v1 baseline (`protocolVersion: 1` already stamped) |

### 2.4 Consumer chat plumbing (CHAT-01, CH1–CH9 delivered as MVP)

| Component | Path | Status |
|-----------|------|--------|
| Person ↔ Company Sarah thread (open/send/handover pause/sync from tenant) | `services/sarah/company/companyReceptionChatService.js`, `services/users/userConversationService.js` | **Reuse**; **Caution**: memory-first |
| Firestore mirror `userConversations/{id}` + `messages/` | `services/users/userConversationFirestoreStore.js`, indexes in `firestore.indexes.json` | **Reuse** |
| Federated chat index (business, P2P, group, network) | `services/users/chatConversationIndexService.js`, `services/api/chatIndexRoutes.js` (`GET /api/chat/conversations`) | **Reuse** — this is the **CHAT-01 "federated index"**; it is a process-local merge of in-memory stores, **not** a persisted/queryable index |
| P2P (open by `targetPersonId` = uid; no person directory/handle), groups, blocks, media, reactions | `services/users/personToPersonConversationService.js`, `groupConversationService.js`, `personBlockService.js`, `chatMediaService.js`, `chatUxService.js`, `services/api/chatPersonRoutes.js`, `chatGroupRoutes.js`, `chatUxRoutes.js` | **Extend** (needs person discoverability before "find a person" exists) |
| Handover state machine (consumer) and portal assignment queue | `services/users/handoverStateService.js`, `services/tenants/sarahInboxHandoverService.js`, `services/api/chatHandoverRoutes.js`, `customerOpsRoutes.js` (`/assign` etc.) | **Reuse** |
| Chat → Work links (stubs) | `services/users/chatWorkLinkService.js`, `chatWorkRoutes.js` | **Caution** (memory) |
| Portal Sarah Inbox (`sarah_app` channel label, Sales workspace tab) | `app/js/portal/modules/inbox-ui.js`, `conversations.js`, `salesWorkspace.js` | **Reuse** |

### 2.5 Events, analytics, audit, integrations

| Component | Path | Status |
|-----------|------|--------|
| Integration event envelope v1 (types: `integration.conversation.opened`, `integration.message.user|assistant`, `integration.tenant.mirrored`, `integration.identity.link.proposed`) | `services/events/integrationEventContract.v1.json`, `services/events/publishIntegrationEvent.js` | **Extend** (add `network.*` types; gated by `INTEGRATION_EVENTS_SARAH_APP=1`, **unset in prod** per C2 doc) |
| Idempotent publish (Firestore `integrationIdempotencyKeys` + memory) | `publishIntegrationEvent.js`, `schema.js` `INTEGRATION_IDEMPOTENCY_KEYS` | **Reuse**; **Caution**: the "`sarahNetwork/audit` copy" is `auditMemory` (a `Map`) |
| Tenant event bus / store / handlers (analytics, automation, portal notifications, BOS) | `services/events/eventBus.js`, `eventStore.js`, `eventTypes.js`, `*Handler.js` | **Reuse**; `EventTypes` has no network events |
| Audit log | `services/audit/auditLog.js` | **Reuse** (verify sink durability before relying on it for SNET audit) |
| Platform Intelligence rollups (end-user/communication analytics) | `services/platformIntelligence/*`, MC `platformDashboardPi.js` | **Reuse** for network KPIs. **Naming conflict:** PI "user network" (`getPlatformUserNetwork`, `viewPlatformUserNetwork`, `GET /api/operations/platform-user-network`) means *channel end-user rollups*, not Sarah Network |
| Revenue/Entitlements (R0, in-memory ledger, `commercialActivation` all false) | `services/revenue/*`, `services/api/revenueRoutes.js` | **Reuse** later (sponsored slots RS04, network entitlements) |
| Subscription/Billing plans | `services/platform/billingPlans.js`, `services/payments/billingService.js` | **Reuse** for network plan gates |

### 2.6 Mission Control

| Component | Path | Status |
|-----------|------|--------|
| Console shell + router + module registry | `admin/index.html`, `admin/js/admin/router.js`, `core/moduleRegistry.js`, `main.js`; mirrors: `ziric-superadmin-console.html`, `js/admin/*` (generated via `scripts/prepare-sites.js`) | **Extend** — add pages in 4 places (see §8) |
| MC auth gate (Firebase + `isSuperAdminRole`, active status) | `admin/js/admin/auth-guard.js`, `admin/js/auth.js` | **Caution**: binary superadmin; no module/role scoping |
| Companies module (tenant list/detail, classification chips, WhatsApp gateway) | `admin/js/admin/modules/companies.js` (72 KB), `whatsapp-gateway.js` | **Extend** (Network tab per tenant) |
| MC Sarah operator + navigation targets | `services/sarah/mcNavigation.js`, `admin/js/admin/modules/sarah-mc.js`, `services/sarah/tools/navigateMissionControl.js` | **Extend** (register new page ids) |
| Platform APIs facade (`/api/operations/*`, `/api/platform/*`) | `api/app.js`, `services/api/routeRegistry.js` | **Extend** |

### 2.7 Sarah App front-ends (two code paths — resolve before SNET-04)

| Code path | Path | What it does |
|-----------|------|--------------|
| **Rich app (what the UX team iterates on)** | source `prototype/sarah-app-ux/` → generated `users/` via `npm run prepare:users` (`scripts/prepare-sites.js users`); `users/js/app.js` (354 KB), `mock-data.js`, `live-bridge.mjs` | Mock Discover/Status/Profile/Wallet/Pay/My Orgs; live bridge only for Personal Sarah, consumer profile, Chats/company messages |
| **Earlier live-only shell** | `js/users/*` (`main.js`, `router.js`, `modules/discover.js`, `modules/chats.js`, `companyChat.js`) | The **only** code that calls `GET /api/discover/companies`; small, API-driven |

> **Open question (not provable from the repo):** which of the two is served at `sarah.ziricai.com` today. Evidence points to `users/` (publish folder; `Express` serves `/users`), but `js/users/*` is where live Discover lives. SNET-04 must pick one.

---

## 3. Gaps / missing services mapped to SNET phases

**Provisional phase labels** (reconcile with spec): 01 Foundation · 02 Org network onboarding · 03 Directory & profile publishing · 04 Discover search · 05 Agent registry · 06 Consent & permissions · 07 Routing/sessions/dispatch · 08 Mission Control admin · 09 Portal network console · 10 Events/audit/analytics · 11 Commerce integrations (Pay/My Orgs/Work) · 12 Hardening, scale, launch.

| Capability | Exists today | Gap | Phase |
|------------|--------------|-----|-------|
| Network entity model + SN-ID | None. Tenant = `companyId`, person = Firebase uid, agent = synthetic string | Entity collection, SN-ID minting, reverse index (ref → snId), backfill | **01** |
| Durable network store | In-memory Maps (directory, grants, requests, audit); Firestore constants only | Firestore repos behind existing function surfaces; memory adapter for tests (mirror `USER_CONVERSATIONS_BACKEND` pattern) | **01** (01a hardening) |
| Rules & indexes | Rules cover `userProfiles`, `userPreferences`, `personalKnowledge`, `personalSarah`, tenant subcollections. **No rules** for `userConversations`, `businessDirectory`, `sarahNetwork`, `consents`, `personLinks` (client = default deny; server Admin SDK bypasses). Indexes: `userConversations` ×2, `conversations(channel,updatedAt)` only | Rules for any client-readable directory docs; indexes for directory/request/grant queries | **01**, **03** |
| Org onboarding to network | None. Onboarding creates tenant/agent/KB, never a listing; `upsertBusinessDirectoryEntry` has zero callers | Consent-to-list step, listing draft from tenant fields, verification workflow, eligibility gate (server-side classification) | **02** |
| Directory / public profile | `GET /api/discover/companies` (env pilot IDs; 6 fields) | Directory docs, profile sections (services/products/hours/location/media), publish/unpublish, sync job from tenant `settings/publicProfile`, `searchTokens`, `geohash`, `verified`, `sponsoredRank` | **03** |
| Discover search | Client-side substring + keyword-expansion over 8 mock fixtures (`DISCOVER_NL_KEYWORDS`) | Server search API, index, ranking, facets from presets, geo, pagination, sponsored slots (RS04), wire app to API with mock only behind a dev flag | **04** |
| Agent registry | None. Company Sarah synthetic; AI employees under `companies/{id}/aiEmployees` with `channels: {whatsapp, websiteChat}` (no `sarahApp`) and name like `"{First} (AI)"`; Personal Sarah = per-uid sessions | `networkAgents` registry, capability/policy cards, tool allowlist, status, link to tenant `aiEmployees`, personal agent per person | **05** |
| Consent & permissions | `consentGrantService` (in-memory; `sarah_network_enquiry`, per-company, 24 h); `allowPersonalSarahReadChats` pref; trust spec | Durable `consents/{uid}/grants`, scopes, revoke, field-level disclosure, per-org connection permissions, consumer consent UI, org-side permissions (BP-01G dual-sided auth) | **06** |
| Routing / sessions / dispatch | Sync dispatch; `ensureNetworkChatThread` (in-memory); handover & assign APIs; no queue | Worker/queue dispatch, retries, idempotency per request, multi-company batch, `networkConnectionId` lifecycle (called out as a gap in CHAT-01 §9) | **07** |
| Mission Control network admin | None (17 pages, none network). `viewOrganisationNetwork` / PI "user network" are unrelated analytics | Network pages, verification queue, agent registry view, request/audit explorer, kill-switches | **08** |
| Portal network console | Sarah Inbox tab only (C2) | Listing editor, visibility, Company Sarah network settings, inbound request log, connection list, public-profile preview | **09** |
| Events / audit / analytics | Integration envelope v1 (opt-in, 5 types), tenant events; audit copy is memory | `network.*` event types, durable `sarahNetwork/audit`, KPIs, abuse signals | **10** |
| Commerce integrations | Pay (MW-01/SYP-01), My Organisations (SUB-01) are **prototype + `localStorage` only** (`sarah.prototype.*` keys); no backend | Follow/subscription graph (`userCompanies`), org→person delivery via network, Pay merchant link | **11** |
| Hardening / scale | Single Express (`api/app.js`), in-process rate limit/caches | Distributed rate limiting, load tests, search at scale, DR/backfill, security review, pen-test | **12** |

### 3.1 Delivery status of CHAT-01 vs. its own audit (stale doc warning)
`SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md` (CH0) lists P2P, groups, handover, federation etc. as "not implemented"; HEAD has CH1–CH9 MVP code and tests (`npm run test:sarah-chat-ch2-ch9`). Treat the CH0 gap table as **historical**; the CHn progress docs (`CH1…CH9_*_PROGRESS.md`) are current, with their own "Remaining" notes (e.g., durable handover queue, Firestore directory parity, Playwright harness). `docs/architecture/U0_ACCEPTANCE_CHECKLIST.md` is flagged stale by `SARAH_APP_PROGRAMME_READINESS_AUDIT.md`.

---

## 4. Proposed network entity & SN-ID model (fit to existing tenant IDs)

### 4.1 What the current IDs look like (constraints)

| Thing | Current id | Notes |
|-------|-----------|-------|
| Tenant | `companyId` — self-serve: `{slugified-name}-{4 base36 chars}`; hand-provisioned: free-form (`smilemore-demo`, `central-motors-rtb`, `demo-central-motors`, `ziricai`, `company-zero`, many `portal-4*`/`client2-tp*` test ids) | Non-uniform; encodes **environment semantics** (test/pilot/demo) that must not leak into a public identifier |
| Same business, 2 tenants | Central Motors: `demo-central-motors` (showcase) and `central-motors-rtb` (production pilot) | Proves tenant:entity can be **N:1** |
| Person | Firebase `uid`; `personId ≡ uid` (C1) | Stable; PII-free |
| Consumer thread | `uc_{companyId}_{personId}` | Derivable; keep |
| Tenant CRM customer for Sarah App | `sarah_app::{sanitizedUid}` | Keep |
| Company Sarah | `company_sarah:{companyId}` (string, not a doc) | Needs registry |
| AI employee | `agent-{ts}-{rand}` under tenant | Tenant-internal |
| Network request | `snr_{ts}_{uuid8}`; response `snr_res_*` | Keep |

### 4.2 Recommendation: SN-ID is a **new, opaque, platform-minted, immutable** identifier — never a re-labelled `companyId`

```
SN-ID   := "sn_" + kind + "_" + base32(10 bytes)         e.g. sn_org_7K2M9QXH4T3VWB5D, sn_per_..., sn_agt_...
kind    := org | per | agt | grp          (grp reserved; MVP: org, per, agt)
handle  := optional human-readable, unique, mutable: "smilemore"   (vanity; NOT the identity)
```

Why not reuse `companyId`: (1) test/demo semantics baked into ids; (2) N:1 tenants per business; (3) `companyId` is also the Firestore path key for tenant data and appears in webhooks/URLs — public exposure widens the attack surface; (4) personal and agent entities need the same namespace.

### 4.3 Collections (new; server-written, Admin SDK)

```
networkEntities/{snId}                     # canonical record
  snId, kind, status, createdAt, updatedAt, version
  refs: { companyId? , uid? , agentRef? }  # exactly the existing ids — the join to today's world
  displayName, handle?, verification { state, by, at, evidence? }
  eligibility { tenantClass, environment, listable:boolean, reasons[] }   # computed server-side
networkRefs/{kind}__{refKey}  -> { snId }  # reverse index; doc id = e.g. "org__smilemore-demo"
                                           # create-if-absent in a transaction => idempotent backfill
networkDirectory/{snId}                    # published, denormalized card (see §6); subset of entity
networkAgents/{agentSnId}                  # see §7
networkConnections/{connId}                # person <-> org relationship (consent anchor)
consents/{uid}/grants/{grantId}            # as already specced in DATA_ARCHITECTURE
sarahNetwork/requests/{requestId}          # existing path constant, now durable
sarahNetwork/audit/{eventId}               # existing path constant, now durable + immutable
```

### 4.4 Entity kinds and how they attach to existing IDs

| Kind | `refs` | Mint point | Backfill |
|------|--------|-----------|----------|
| `org` | `companyId` | Provisioning hook (`provisionCompany`) → `status: draft`; **not listable** until onboarding consent + verification + eligibility | Script over `companies/*` (dry-run default; classifies; skips test/acceptance/UNKNOWN) |
| `per` | `uid` | `bootstrapConsumerProfile` (lazy) | **No bulk backfill**; mint lazily on first network action |
| `agt` | `{companyId, aiEmployeeId?}` or `{uid}` | Company Sarah: on org entity creation (virtual→registered); Personal Sarah: with `per` | Same script |

### 4.5 Rules

- `companyId → snId` is **N:1 allowed** (Central Motors) via `networkEntities.refs.companyIds[]` **or** one org entity per tenant plus an optional `parentSnId` — decide in SNET-01 (recommend **one org entity per tenant + `parentSnId`**: simpler isolation and per-tenant consent).
- SN-IDs appear in public/consumer APIs; `companyId` remains the tenant API key and is **never** accepted from consumers for authorization (server resolves `snId → companyId`).
- Existing ids (`uc_*`, `sarah_app::*`, `snr_*`) are **unchanged**; add `snId` fields alongside (dual-key period), no rewrites.
- Sanity: SN-ID is **not** a secret and **not** proof of authorization.

---

## 5. Data ownership & security boundaries (aligned to existing spec; map to SNET-01 §17 when attached)

### 5.1 Ownership (current + proposed)

| Data | Owner | Writer | Reader | Path |
|------|-------|--------|--------|------|
| Firebase identity, `users/{uid}`, `userProfiles`, `userPreferences` | User | Server + user (rules) | User | existing |
| Personal Sarah sessions/memories/tasks, My Knowledge | User | Server + user (rules) | User only | existing |
| Consumer chat view `userConversations/**` | User (view) / Tenant (CRM SoT) | **Server only** | User via API | existing, no client rules |
| Tenant CRM/KB/conversations | Tenant | Tenant members (rules) + server | Tenant members + superadmin | `companies/{id}/…` |
| **`networkEntities`, `networkRefs`** | **Platform** | **Server only** | Server; MC read | **new** |
| **`networkDirectory`** (published card) | **Tenant publishes; platform stores** | **Server only** (sync job/API) | **Public read via API/CDN** (never direct tenant write) | **new** |
| **`networkAgents`** | Platform (registry) with tenant-controlled config | Server only | Public card subset; full to tenant/MC | **new** |
| **`consents/{uid}/grants`** | **User** | Server on user action | User; tenant sees only *effective* scope, not the grant doc | planned in TRUST doc |
| **`sarahNetwork/requests|audit`** | Platform | Server only; audit append-only | MC; user sees own requests | existing constants |
| `networkConnections` | Shared (person↔org), both can revoke | Server | Both parties (own side) | **new** |

### 5.2 Boundary rules SNET must enforce (checklist, each testable)

1. **Tenant isolation:** no network API returns tenant-internal data (CRM, finance, internal KB, staff) to consumers. *Today at risk — see R3.*
2. **Public-by-explicit-publish only:** only fields flagged public in the listing leave the tenant boundary; KB docs need a `visibility: public|private` flag before reception/network can use them.
3. **Server authors identity:** `destination.companyId`/`snId` and `source.userId` are server-resolved (already stated in the protocol; keep).
4. **Consent before disclosure:** Personal→Company enquiries require a durable, unexpired, unrevoked grant bound to the org and disclosed fields (exists, but in-memory and not revocable).
5. **No tenant→tenant calls:** forbidden by protocol; add a test.
6. **Eligibility gate server-side:** test/acceptance/demo/UNKNOWN tenants cannot be `listed` in production Discover.
7. **Client rules:** keep `userConversations`, `networkAgents`, `networkEntities`, `sarahNetwork` **default-deny**; if directory docs are client-readable, add an explicit read-only rule (`allow read: if resource.data.status == 'listed'; allow write: if false`) — or keep it API-only (recommended for MVP).
8. **MC access:** `requirePlatformAccess` on every `/api/platform/network/*`; every mutation writes an audit event with actor.
9. **Retention/deletion:** account deletion anonymises `userConversations` and revokes grants (DATA_ARCHITECTURE "Sync" table); define the same for `networkConnections`.
10. **Secrets:** `.env`, `.env.local-staging`, `.portal-*-credentials.json` are present in the working tree (credential JSON is gitignored; `.env.local-staging` shows as untracked). SNET work must not add secrets to docs/tests. *(Noted only — not opened during this audit.)*

---

## 6. Search architecture proposal (Firestore vs dedicated index — pragmatic MVP)

### 6.1 Honest current state

| Layer | Reality |
|-------|---------|
| Sarah App UI search (`users/`) | **Mock + client-side only.** `filterDiscoverListings` over `MOCK_DISCOVER_COMPANIES` (8 items), substring match on name/category/description/address/tags/product text, plus a tiny hand-written synonym map (`DISCOVER_NL_KEYWORDS`: dentist→dental…). Offline-capable, no auth, no server |
| Live endpoint | `GET /api/discover/companies` — **auth required**, no `q`/filters/pagination, returns pilot env IDs (`SARAH_NETWORK_PILOT_COMPANY_IDS`, default `smilemore-demo`) joined to the **in-memory** directory seeded at boot with hard-coded SmileMore copy ("Rustenburg, South Africa", verified=true) |
| Fixtures masquerading as data | SmileMore Dental card (Sandton address, Unsplash images, rating 4.8/312) ≠ live SmileMore tenant (Rustenburg, per `smilemorePractice.js`); Central Motors card has `chatId: 'central-motors'` (no such tenant); 6 others have `chatId: null` |
| Directory in production code depends on a demo fixture | `businessDirectoryService.js` and `userConversationRoutes.js` import `SMILEMORE_DEMO_COMPANY_ID` from `services/dental/smilemorePractice.js` |
| Docs | DISCOVER-01 notes are candid: "no Discover list fetch", "Typesense/Algolia per architecture docs" for later |

### 6.2 Recommendation (stage it; don't buy infrastructure first)

**Stage A (MVP, SNET-03/04): Firestore as the source of truth + in-process search over a small, cached directory.**
- `networkDirectory/{snId}` holds a denormalized card: `name, nameTokens[], categoryIds[] (from presets), tags[], shortDescription, city/region/country, geohash(7), lat/lng, verified, status='listed', ratingAvg, ratingCount, hasCompanySarah, sponsoredRank?, updatedAt`.
- The API (`GET /api/network/v1/directory/search?q&category&near&radiusKm&verified&cursor&limit`) loads **listed** docs into a process cache invalidated by a Firestore snapshot listener (or version doc), scores in memory (token/prefix match, synonyms from presets, verified boost, distance), returns cursor pages. Facets/geo via equality + geohash-prefix range queries when the cache is cold.
- Rationale: directory is read-heavy and (initially) hundreds–low thousands of docs; this meets Firestore's lack of full-text search without a new vendor, keeps one operational surface, and reuses the Admin SDK already in use (`services/database/firestoreClient.js`).
- **Define a `NetworkSearchProvider` interface now** (`search`, `upsert`, `remove`, `health`) with `memory` and `firestore` adapters.

**Stage B (trigger-based): Typesense (or Algolia/Meilisearch)** — adopt when any of: >~5k listed entries, p95 search >400 ms, typo-tolerance/semantic or per-facet counts required, sponsored-merge ranking becomes non-trivial, or multi-region reads. Matches what `SARAH_APP_SCALABILITY_AND_OPERATIONS.md` §125 already anticipates. Sync via the same `directory_sync` job → provider `upsert`.

**What to avoid:** Firestore `array-contains-any` as "search" at scale (30-value limit), a separate Elasticsearch cluster at MVP, embedding every user/org on day one.

### 6.3 Search rules
- Anonymous Discover browse (read-only) is a **product decision** (today it's auth-gated by `requireConsumerScope`); decide in SNET-04. Rate-limit regardless.
- Mock data is allowed **only** behind an explicit dev/demo flag in the prototype; production builds must never merge fixtures with live results.
- Sponsored (RS04) is a **merge step after organic ranking**, labelled, capped; RS04 inventory is not implemented (`commercialActivation` all false).

---

## 7. Agent registry design (gap vs company Sarah today)

### 7.1 Today
- **Company Sarah** = `persona: COMPANY_RECEPTION` + orchestrator + tenant KB digest. The "agent id" is a string (`company_sarah:{companyId}`) put into `participants[]`. It is **not** a document, has no capability record, no on/off switch, no versioning.
- **Tenant AI employees** (`companies/{id}/aiEmployees`): `id, name, role, roleLabel, systemPrompt, knowledgeBaseId, status, isDefault, channels{whatsapp, websiteChat}`. Default created at provisioning (`"{First} (AI)"` — "Sarah" naming only enforced for Client Zero). **No `sarahApp` channel flag**, so tenants cannot opt out of (or configure) the consumer channel; consumer chat ignores the agent's own `systemPrompt`/KB link and uses the global reception persona.
- **Personal Sarah** = per-uid sessions/memories (`personalSarah/{uid}/…`), tools: `createPersonalReminder`, `summarizeCompanyConversation` — **no network tool** (`sarahNetwork.enqueueEnquiry` from the protocol doc is not implemented; enquiries are API-only).
- **Tool policy:** `COMPANY_RECEPTION` has no dedicated policy (see R3).

### 7.2 Proposed `networkAgents/{agentSnId}`

```
agentSnId, kind: company_sarah | personal_sarah | employee_agent
ownerSnId           # org or person entity
ref: { companyId?, aiEmployeeId?, uid? }
status: draft | active | paused | suspended
channels: { sarahApp:boolean, network:boolean }
persona: "COMPANY_RECEPTION" | "PERSONAL_ASSISTANT"
policy:
  allowedInteractionTypes: ["person_to_company","personal_to_company", ...]
  toolAllowlist: ["searchCompanyKnowledge", "<faq/booking-intent tools>"]   # explicit allowlist, deny-by-default
  knowledgeScope: "public_only"                                             # needs KB visibility flag
  rate: { perUserPerHour, perOrgPerHour, dailyCostCapUsd }
capabilities: ["answer_faq","book_intent","quote_request"]                  # advertised on the public card
handover: { enabled:boolean, rules?: [...] }                                # CH6 D3 rules config lives here
protocolVersion: 1, version: n, updatedAt, updatedBy
publicCard: { displayName, avatar, tagline, languages[] }                   # what Discover/Chat may show
```

### 7.3 Gap list
1. Persist Company Sarah as a registry record created with the org entity (idempotent), keyed by `companyId`.
2. Introduce **`companySarahAgentId` = `agentSnId`** (alias the old string for continuity).
3. Add `channels.sarahApp` to tenant AI employee schema and Portal toggle (the spec at `SARAH_APP_DATA_ARCHITECTURE` already proposed `integrations/sarahApp`).
4. Replace "tenant tools minus permissions" with an **explicit allowlist** for consumer-facing personas.
5. KB visibility flag (`public|private`) + reception reads public only.
6. Personal Sarah gets a registry record + the `sarahNetwork.enqueueEnquiry` tool (consent-gated).
7. Registry read API for Discover cards ("Company Sarah available / paused / human-only").

---

## 8. Mission Control module map (SNET admin screens vs existing MC navigation)

**Existing MC pages (17):** Dashboard, Companies, Government, Public Service, CRM, Sarah, Billing, ZiricAI Analytics, Support Inbox, Integrations, Support, Sarah Operations, Attention Centre, AI Employees, AI Marketplace, Knowledge Base, Settings (`admin/js/admin/core/moduleRegistry.js`, `router.js`; same list in `admin/index.html` and `ziric-superadmin-console.html`; Sarah-operator targets in `services/sarah/mcNavigation.js`).

| Proposed SNET MC screen | Nearest existing page | Action | Phase |
|-------------------------|----------------------|--------|-------|
| **Network Overview** (entity counts, listed/draft/suspended, request volume, latency/cost, abuse flags) | Dashboard / ZiricAI Analytics | New page `network`; reuse PI rollup patterns | 08, 10 |
| **Directory & Verification Queue** (review listing, approve/reject/suspend, eligibility reasons, tenant class) | Companies | New sub-page + "Network" tab in company detail; reuse classification chips | 02, 08 |
| **Agent Registry** (Company/Personal Sarah records, pause, policy, version) | AI Employees (`agents`) | New page; link both ways | 05, 08 |
| **Connections & Requests Explorer** (request/audit by user/org/status; replay metadata only) | Support Operations / Attention Centre | New page; reuse audit-drilldown pattern (`platform-support-operations/:companyId/audits/:auditId`) | 07, 10 |
| **Consent & Grants view** (read-only; revoke on user request / legal) | — | New (careful: PII, POPIA) | 06 |
| **Discover Ops** (index health, reindex, featured/sponsored slots, banned terms) | Marketplace (closest "catalog ops") / Settings | New page; RS04 hooks later | 04, 11 |
| **Network Policies & Limits** (global/org rate limits, cost caps, kill switch, pilot allowlist replacing `SARAH_NETWORK_PILOT_COMPANY_IDS`) | Settings | New section; flags persisted, not env-only | 07, 12 |
| **Reports & Safety** (chat reports from `chatUxService` prefs, blocks, org abuse) | Attention Centre | Feed existing queue | 10 |
| Integrations row "Sarah App channel" per tenant | Integrations | Add channel matrix row | 09 |

**Mission Control implementation notes**
- A new page must be registered in **four** places: `moduleRegistry.js` (+labels), `router.js` `RENDERERS`, **both** HTML sidebars, and `mcNavigation.js` (so Sarah operator can navigate). Generated copies in `js/admin` / `app/js/admin` come from `npm run prepare:sites`.
- **Permissions:** MC is `superadmin`-only (`isSuperAdminRole`, `requirePlatformAccess`). No staff sub-roles. Network moderation by non-superadmin operators needs an MC RBAC story (out of SNET-01 scope; flag as dependency D4).
- Platform Intelligence already uses the phrase "user network" — **rename carefully** in UI copy (e.g., "Sarah Network" vs "End-user network") to avoid operator confusion.

---

## 9. Proposed Network API surface (versioned) vs existing routes

### 9.1 Existing relevant routes (as mounted in `api/app.js` L2723–2735)

| Group | Routes | Notes |
|-------|--------|-------|
| Consumer account | `POST /api/users/bootstrap`, `GET/PATCH /api/users/profile` | |
| Personal Sarah | `/api/personal-sarah/{chat,sessions,sessions/active,sessions/:id}`, `/api/personal-knowledge/*` | |
| Discover (pilot) | `GET /api/discover/companies` | auth, no query |
| Company chat | `GET /api/user-conversations`, `GET|POST /api/user-conversations/:companyId/messages`, `GET /api/user-conversations/id/:conversationId/messages`, `POST …/:companyId/request-human` | |
| Federated chat | `GET /api/chat/conversations?filter=`, `GET /api/network-conversations/:id/messages`, `GET /api/chat/conversations/:companyId/handover`, `GET /api/chat/search`, preferences/reactions/blocks/media/retention | |
| P2P/groups | `/api/person-conversations*`, `/api/group-conversations*`, `/api/person-blocks*` | |
| Sarah Network | `POST/GET /api/sarah-network/grants`, `POST /api/sarah-network/enquiries`, `GET /api/sarah-network/requests[/:id]` | no revoke, no list-grants |
| Tenant inbox | `/api/companies/:companyId/conversations[/…]` (reply, takeover, read, assign, accept, transfer, escalate…) | |
| MC/Platform | `/api/platform/*`, `/api/operations/*` | no network |
| Versioning | `X-API-Version: 1` response header only (`routeRegistry.js`); **no `/v1/` path** | |
| **Route catalog** | `services/api/routeRegistry.js` `ROUTE_CATALOG` **omits the CH routes** (chat index, P2P, groups, media, handover, work-links) — it is stale as "source of truth" | fix in SNET-01 |

### 9.2 Proposed surface — path-versioned (`/api/network/v1/…`), legacy kept as aliases for ≥2 releases

**Consumer (`requireConsumerScope`)**
| Method | Path | Purpose | Replaces |
|--------|------|---------|----------|
| GET | `/api/network/v1/directory/search` | q, category, near, radius, verified, cursor | `/api/discover/companies` |
| GET | `/api/network/v1/entities/:snId` | public card | — |
| GET | `/api/network/v1/entities/:snId/profile` | sections (services, hours, media) | — |
| POST | `/api/network/v1/connections` | person ↔ org connect (anchors consent) | implicit today |
| GET/DELETE | `/api/network/v1/connections[/:id]` | list / revoke | — |
| POST/GET | `/api/network/v1/grants` ; `POST …/grants/:id/revoke` | durable consent | `/api/sarah-network/grants` |
| POST | `/api/network/v1/requests` | multi-org enquiry batch (one request per org) | `/api/sarah-network/enquiries` |
| GET | `/api/network/v1/requests[/:requestId]` | status/response | `/api/sarah-network/requests*` |
| GET | `/api/network/v1/agents/:agentSnId` | public agent card/availability | — |

**Tenant (`requireTenantScope` + new `canManageNetwork`)**
| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/api/network/v1/orgs/:companyId/listing` | draft/edit public listing |
| POST | `/api/network/v1/orgs/:companyId/listing/publish` · `/unpublish` | goes to verification when required |
| GET/PUT | `/api/network/v1/orgs/:companyId/agent` | Company Sarah network settings (channels, policy subset) |
| GET | `/api/network/v1/orgs/:companyId/connections` · `/requests` | org-side view |

**Platform (`requirePlatformAccess`)**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/platform/network/v1/entities` (+ `/:snId`) | list/search incl. eligibility reasons |
| PATCH | `/api/platform/network/v1/entities/:snId/status` | verify / suspend / delist (audited) |
| GET | `/api/platform/network/v1/requests` · `/audit` | explorer |
| POST | `/api/platform/network/v1/backfill` (`dryRun=true` default) · `/reindex` | operations |
| GET | `/api/platform/network/v1/stats` | KPIs |

**Internal**
| POST | `/api/internal/network/v1/dispatch` | worker dispatch (already in protocol doc) |

**Conventions:** `{ ok, data|error:{code,message} }` envelope for v1 (existing routes use ad-hoc shapes), `protocolVersion` in bodies, `Idempotency-Key` header on POSTs (reuse `publishIntegrationEvent` idempotency pattern), cursor pagination, 429 with `Retry-After`. Update `ROUTE_CATALOG` and `docs/architecture/API.md` in the same change.

---

## 10. Integration map

| System | Today | SNET touchpoints | Phase |
|--------|-------|-----------------|-------|
| **Sarah App (users/)** | Live: auth, Personal Sarah, Chats (company/P2P/group/network via `live-bridge.mjs`). Mock: Discover, Status, Profile/Business, Wallet, Pay, My Orgs | Discover → `/directory/search`; profile "Connect with Company Sarah" → connections + grant; Chat list shows agent availability; resolve **`users/` vs `js/users/`** | 04, 06, 07 |
| **Company Portal (app/)** | Onboarding wizard; Sarah Inbox (C2/CH7); RBAC matrix; no public-profile module | Listing editor, "Join Sarah Network" onboarding step, Company Sarah network settings, KB public/private flags, network inbound log, `canManageNetwork` | 02, 05, 09 |
| **Mission Control (admin/)** | 17 pages, superadmin-only | §8 | 08 |
| **Sarah Pay (SYP-01) / Seller Sarah** | Spec + prototype (`localStorage`); no backend | Needs `org` entity + merchant flag + network message types (quote/invoice/status); **depends on durable consent + entity registry** | 11 |
| **My Organisations (SUB-01)** | Spec + prototype (`sarah.prototype.myOrganisations.subscribedIds.v1`) | `userCompanies/{uid}/follows|connections` ↔ `networkConnections`; Company Sarah → Personal Sarah delivery via network with consent | 11 |
| **Work / BP-01 Business Sarah** | Specs; chat→work link stubs (memory) | Dual-sided authorisation (BP-01G) = `networkConnections` + grants | 06, 11 |
| **Revenue (RS03/RS04)** | R0 in-memory | Sponsored merge in Discover; entitlements for network plans | 11 |
| **WhatsApp gateway / Integration Hub** | Mature (G-series) | Network stays channel-agnostic; `sarah_app` is a channel peer to WhatsApp (`channel` enum) | — |
| **Events** | Integration envelope v1 (opt-in) + tenant bus | Add `network.entity.*`, `network.listing.*`, `network.connection.*`, `network.request.*`, `network.agent.*` types + durable audit | 10 |

---

## 11. Risks, dependencies, conflicts

### 11.1 Risks

| ID | Sev | Risk | Evidence / note | Mitigation |
|----|-----|------|-----------------|-----------|
| R1 | High | **Ephemeral control plane**: directory/grants/requests/audit in memory | §2.3 | SNET-01a: Firestore repos behind same function names; memory adapter for tests |
| R2 | High | Dual-write drift: consumer view vs tenant CRM vs Firestore mirror; fire-and-forget mirror errors; message ids stable (good) but no outbox | `userConversationService.js` | Outbox/retry or make Firestore the write-ahead SoT (`USER_CONVERSATIONS_BACKEND=firestore`) for consumer view; hydrate lists from Firestore; reconcile job (`backfillUserConversations.js` exists) |
| R3 | **High** | **Consumer-facing Company Sarah tool exposure** (TENANT policy, role `agent`, `requiredPermissions: []` tools, un-flagged KB) | §1 #3 | Dedicated `COMPANY_RECEPTION` allowlist policy; KB `visibility`; add negative tests ("consumer chat cannot call X") — **verify dynamically first** |
| R4 | High | Test/demo tenants appearing in Discover; eligibility only browser-side | `tenantClassification.js` | Server-side `eligibility`; persist `settings.tenantClass`; listing requires explicit publish |
| R5 | Med | AI-to-AI thread omits company answer (field mismatch) | `sarahNetworkChatLinkService.js` L84–103 vs `dispatchCompanyReception.js` return shape | Fix mapping + test with real dispatch shape |
| R6 | Med | Per-process rate limits/caches break with >1 Railway replica | `sarahNetworkService.js`, auth rate limiter | Firestore/Redis-backed counters in SNET-07/12 |
| R7 | Med | Discover/Chat list is empty after restart until threads reopened | `listUserConversations` is memory-only; Firestore list helper unused | Hydrate on list; or serve list from Firestore |
| R8 | Med | Branch hygiene: 44 commits ahead of `origin/main`; **190 dirty/untracked paths** in working tree (billing, portal finance, `users/`, docs, `.*-wt` dirs); 2 stashes (`gate1b-ap4-wip pre-merge`, `wip-pre-automotive-main-merge`); 20+ side worktrees; `prototype/sarah-app-ux` mostly **untracked** (5 tracked files) while its generated `users/` has 7 tracked files; DISCOVER-01 changes uncommitted (`users/js/app.js` +64/−3) | `git status`, `stash list`, `worktree list` | Reconcile before SNET-01 branching (see GATE1 reconciliation plan doc); SNET must not branch from a dirty tree |
| R9 | Med | Doc drift: CH0 audit & U0 checklist stale; `TENANT_TAXONOMY.md` and `PLATFORM_INTELLIGENCE.md` referenced by code but absent; `ROUTE_CATALOG` stale | §3.1 | Refresh docs as part of SNET-01 DoD |
| R10 | Low-Med | Name collision "network" (PI user-network vs Sarah Network vs `viewOrganisationNetwork`) | §2.5 | Terminology section in SNET-01 spec |
| R11 | Low-Med | Single `superadmin` role in MC; network moderation would over-grant | `auth-guard.js` | Dependency D4 |
| R12 | Low | Two Sarah App front-ends | §2.7 | Decide + retire one |

### 11.2 Fixture / mock honesty (explicitly requested)

| Item | Reality |
|------|---------|
| **Discover search** | Mock + client-side only in `users/`; the live API is a pilot list (env-driven) with no search |
| **SmileMore** | The *only* live tenant in Discover/Chat (`smilemore-demo`). Prototype card id is `smilemore-dental` with `chatId: 'smilemore-demo'` and **fictional** Sandton address/ratings/images; live directory copy is hard-coded in `businessDirectoryService.js` ("Rustenburg…", `verified: true`) — i.e., "verified" is **asserted by code**, not by a verification process. SmileMore pilot doc lists in-memory index/consent as "known limitations" |
| **Central Motors** | Discover card id `central-motors`, `chatId: 'central-motors'`; notification `n2` opens that thread. No tenant has that id (real: `demo-central-motors`, `central-motors-rtb`; pilot-mode remap in `services/storage/centralMotorsPilot.js`). In live mode this call fails closed (`COMPANY_NOT_DISCOVERABLE` 404) — acceptable, but it is a mock |
| **Other six cards** | Green Haven, Pulse, GreenLeaf, City Fresh, QuickFix, Neon Stone — pure fixtures (`chatId: null`) |
| **Dual-write conversations** | Described in §1 #4. `USER_CONVERSATIONS_BACKEND=dual` in prod (per C2 doc); `INTEGRATION_EVENTS_SARAH_APP` unset in prod |
| **Federated index** | A merge of 4 in-memory lists at request time; not an index |
| **My Orgs / Wallet / Pay** | `localStorage` prototypes with demo data |
| **Sponsored/featured** | `featured` flag on mock cards only; RS04 not implemented |

### 11.3 Dependencies
- D1 Durable Firestore with Admin credentials in every environment that runs SNET (the memory backend remains for tests only).
- D2 Resolve `STORAGE_BACKEND` posture and `USER_CONVERSATIONS_BACKEND` (`dual`→`firestore`) decision (`SARAH_APP_PROGRAMME_READINESS_AUDIT.md` D-S0-5).
- D3 Industry Preset Library as the category source.
- D4 MC RBAC for non-superadmin operators (optional for SNET-01).
- D5 Verification policy (who verifies, evidence) — product/legal.
- D6 POPIA review for person entities, grants, and logs.
- D7 Decision on anonymous Discover browse.

### 11.4 Conflicts with existing work
- **CHAT-01:** CH4 "Remaining: Firestore directory parity" and CH6 "durable queue" overlap SNET-01a/03/07 — own them once, in SNET.
- **U6 Discover** (roadmap) vs **SNET-03/04** — SNET supersedes U6's `businessDirectory` naming; **decide `businessDirectory` vs `networkDirectory`** (recommend keeping the documented `businessDirectory` constants as the *published card* and adding `networkEntities` as identity; avoid two directories).
- **C1 identity plan** reserved `personLinks` and `person:guest:`; SN-ID `per` entities must not collide with these.
- Existing prefix ids must remain valid for tenant webhooks/CRM (non-breaking checklist from C1 §1).

---

## 12. Phased implementation recommendation (what to build first after approval)

**Principle:** durability and safety before features; each step independently shippable and reversible; WhatsApp paths untouched (C1 non-breaking checklist).

### Step 0 — Housekeeping (before any SNET branch)
- Reconcile the dirty tree / stashes / `prototype` tracking (R8); branch SNET from a clean base. (Out of scope for read-only audit; flagged only.)
- Attach SNET-01 spec; reconcile phase labels and §17.

### Step 1 — **SNET-01a: Hardening of the existing slice** (small PRs)
1. Fix AI-to-AI reply mapping (R5) using the real dispatch shape; add a test that runs through `submitPersonalToCompanyEnquiry`.
2. Dedicated consumer-facing tool policy for `COMPANY_RECEPTION` (allowlist), KB `visibility` flag + public-only digest (R3); **first reproduce with a dynamic test**.
3. Durable repos (Firestore + memory adapter, flag `SARAH_NETWORK_BACKEND`) for consent grants, network requests/audit, directory — same exported function names, tests unchanged.
4. Hydrate Chats list from Firestore; make `listConversationsByUserId` real (R7); mirror failures → retry/outbox log.
5. Server-side tenant eligibility (persist `tenantClass`, `environment`) (R4).

### Step 2 — **SNET-01: Foundation**
1. `services/network/` module: SN-ID mint, `networkEntities`, `networkRefs`, repos, schema constants (`schema.js`), rules + indexes, unit tests.
2. Hooks: `provisionCompany` → org entity (`draft`) + registered Company Sarah agent (`draft`); `bootstrapConsumerProfile` → lazy person entity.
3. Backfill script `scripts/network-backfill-entities.mjs` (dry-run default; classification report; skips test/acceptance/UNKNOWN).
4. Read-only API `/api/network/v1/entities/:snId`, platform list; MC **Network Overview (read-only)** page behind superadmin.
5. Refresh `ROUTE_CATALOG`/`API.md`; write terminology + SN-ID ADR.

### Step 3 — **SNET-02/03: Org onboarding & directory** (Portal "Join Sarah Network" step → listing draft → publish → verification queue in MC → `networkDirectory` sync; SmileMore migrated from env seed to a real listing).

### Step 4 — **SNET-04: Discover search** (Stage A search provider + API; wire `users/` Discover to API, fixtures behind dev flag; decide front-end of record).

### Step 5 — **SNET-05/06/07:** agent registry + `channels.sarahApp` toggle; durable consent UX; dispatch worker/queue and `networkConnections`.

### Step 6 — **SNET-08–12:** MC admin completeness, Portal console, events/analytics, Pay/My Orgs integrations, scale (Stage B search if triggered), launch gates.

**Suggested first PR after approval:** *Step 1.1 + 1.2 test (reproduction only)* — smallest, highest-signal, no schema change.

---

## 13. SNET-00 exit checklist

| # | Item | Status |
|---|------|--------|
| 1 | Audit of MC architecture, admin modules, permissions | ✅ §2.6, §8 |
| 2 | Existing "sarah network"/network entity/discover code mapped | ✅ §2.3, §6 |
| 3 | Firebase auth, consumer identity, tenant registration reviewed | ✅ §2.1–2.2 |
| 4 | Company Portal onboarding reviewed | ✅ §2.2, §3 |
| 5 | Network permissions/consent models reviewed | ✅ §2.3, §5 |
| 6 | Discover search (prototype + APIs) reviewed, mock vs live stated | ✅ §6, §11.2 |
| 7 | CHAT-01 routing, federated index, company reception chat reviewed | ✅ §2.4, §3.1 |
| 8 | Company Sarah / agent registration gap documented | ✅ §7 |
| 9 | APIs, Firestore paths, rules, indexes reviewed | ✅ §3, §5, §9 |
| 10 | Events, analytics, integration services reviewed | ✅ §2.5, §10 |
| 11 | Docs reviewed (architecture, C1/C2, CHAT-01, Discover) | ✅ (stale docs noted §3.1, R9) |
| 12 | Branch/stash/worktree state recorded (non-destructive) | ✅ R8 |
| 13 | Entity & SN-ID proposal | ✅ §4 |
| 14 | Search proposal | ✅ §6 |
| 15 | MC module map, API surface, integration map | ✅ §8–10 |
| 16 | Risks and phased plan | ✅ §11–12 |
| 17 | **SNET-01 spec attached and §17 / phase labels reconciled** | ✅ Spec in repo ([SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md)); **phase label reconciliation with §3 still open** |
| 18 | **R3 (consumer tool exposure) reproduced dynamically** | ❌ Open — static finding only |
| 19 | Decision: front-end of record (`users/` vs `js/users/`) | ❌ Open |
| 20 | Decision: `businessDirectory` vs `networkDirectory`; org entity per tenant vs N:1 | ❌ Open (recommendations in §4, §11.4) |
| 21 | Decision: anonymous Discover; verification policy owner; POPIA review owner | ❌ Open |
| 22 | Clean branch base for SNET-01 (R8) | ❌ Open |
| 23 | Team approval of this audit | ☐ Pending |

### Audit boundaries (what this document did **not** do)
No code or config was changed; no tests executed; no deployed environment, Firestore data, Railway/Netlify settings, or `.env*` contents inspected; no git write operations. Claims about production behaviour (e.g., `USER_CONVERSATIONS_BACKEND=dual`) come from repo docs (`C2_SARAH_INBOX_PROGRESS.md`), not from the live system.
