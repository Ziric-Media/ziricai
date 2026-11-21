# Company Portal ↔ Sarah App — C1 Identity & Events Implementation Plan

**Phase:** **C1** — programme & Phase 0 implementation design (docs + first coding slices)  
**Date:** 2026-11-08  
**Inputs:** [COMPANY_PORTAL_SARAH_APP_INTEGRATION_AUDIT.md](./COMPANY_PORTAL_SARAH_APP_INTEGRATION_AUDIT.md) (C0, approved), [SARAH_APP_DATA_ARCHITECTURE.md](./SARAH_APP_DATA_ARCHITECTURE.md), [SARAH_APP_MASTER_ARCHITECTURE.md](./SARAH_APP_MASTER_ARCHITECTURE.md)

**C1 intent:** Turn C0 top findings into an **ordered, testable** backend programme: durable identity contracts (`personId`, `conversationId`, `messageId`), Firestore paths aligned with `services/database/schema.js`, migration off in-memory `userConversationService` and legacy `sarah_app::` customer ids, and a shared **integration event envelope** — **without** breaking WhatsApp ingestion or large Portal UI work.

---

## 1. Goals and guardrails

### In scope (C1 programme)

| Goal | Success signal |
|------|----------------|
| Canonical identity contracts documented and enforced in server code | Types/constants + validation on U5 write path |
| Firestore `userConversations/{conversationId}` (+ `messages/`) as consumer SoT | Survives API restart; existing U5 tests pass with Firestore or hybrid adapter |
| Stable link between consumer `conversationId` and tenant CRM `tenantConversationId` | Every new message sets both ids; tenant path unchanged for `sarah_app` channel |
| `messageId` stability + tenant dedupe via `externalId` | Same consumer `messageId` → same tenant message doc on retry |
| Integration event envelope (id, type, company, resource, idempotency) | Contract file + publish helper for Sarah App ↔ tenant analytics |
| Migration plan from in-memory maps and `sarah_app::{uid}` customer ids | Boot hydration + optional one-time backfill job spec |

### Out of scope (this pass — defer to C8 / U6 / C03)

- Company Portal inbox UI: `sarah_app` channel label, filters, or WhatsApp-first copy changes (`app/js/portal/modules/inbox-ui.js`).
- Removing or disabling WhatsApp webhooks, `conversationPipeline.js`, or phone-backed customer ids.
- Full `businessDirectory/` Firestore sync (U6); keep pilot `businessDirectoryService.js` behaviour unless behind a separate flag.
- `personId` for guest/P2P chat (UX C03) — **contract only**; no P2P collections.
- SUB-01 / BP-01 portal modules, Status/Discover engines (U6/U7).
- Firestore security rules rollout for client-side consumer reads (server-only writes remain default).
- Merging `prototype/sarah-app-ux` into production shell.

### Non-breaking WhatsApp checklist (every WP)

- Do **not** change `conversationDocId(phone, "whatsapp")`, `customerDocId`, or webhook routes.
- Sarah App paths use `channel === "sarah_app"` and `resolveSarahAppCustomerId` only — no shared code path that alters WhatsApp normalisation.
- Tenant event bus `publish(companyId, …)` for WhatsApp continues unchanged; new consumer/integration events use a **separate envelope** or tenant events with explicit `metadata.channel`.

---

## 2. Canonical identity contracts

### 2.1 `personId` (registered consumers — C1 baseline)

| Field | Rule |
|-------|------|
| **Definition** | Stable identifier for a **registered** Sarah App human in integration APIs and events. |
| **C1 value** | **`personId` ≡ Firebase Auth `uid`** for consumers with `userProfiles/{uid}`. |
| **Format** | Opaque string; max 128 chars; must match Firebase uid charset. |
| **Not in C1** | Guest persons, P2P peers, or cross-channel merge — use reserved prefix `person:guest:` / `person:link:` in docs only. |

**Aliases (read-only, not a second person key):**

| Alias | Use | Example |
|-------|-----|---------|
| `firebaseUid` | Auth middleware | same as `personId` in C1 |
| `tenantCustomerId` | CRM customer doc id under tenant | `sarah_app::{sanitizedUid}` (`tenantStorage.resolveSarahAppCustomerId`) |
| `whatsappCustomerId` | WhatsApp CRM | normalized phone (unchanged) |

**Future link graph (C1 types only):** `companies/{companyId}/customers/{customerId}.linkedPersonIds[]` or platform `personLinks/{personId}` — spec in WP4, no UI.

### 2.2 `conversationId` (dual namespace, single mapping)

| Layer | Doc id | Derivation |
|-------|--------|------------|
| **Consumer SoT** | `userConversations/{conversationId}` | `uc_{companyId}_{personId}` — same algorithm as `buildConversationId` in `userConversationService.js` (sanitise, max 180 chars). |
| **Tenant SoT** | `companies/{companyId}/conversations/{tenantConversationId}` | `conversationDocId(tenantCustomerId, "sarah_app")` → `sarah_app::sarah_app::{sanitizedUid}` (customer id already includes `sarah_app::` prefix). |

**Required fields on consumer conversation metadata:**

```json
{
  "id": "<conversationId>",
  "personId": "<uid>",
  "userId": "<uid>",
  "companyId": "<tenant company id>",
  "channel": "sarah_app",
  "tenantConversationId": "sarah_app::sarah_app::…",
  "tenantCustomerId": "sarah_app::…",
  "lastMessageAt": "ISO8601",
  "preview": "string",
  "createdAt": "ISO8601"
}
```

**Invariants:**

- One consumer conversation per `(personId, companyId)` pair for `channel: sarah_app`.
- `tenantConversationId` is set on first successful `saveInboundMessage` / `saveOutboundMessage` and never rewritten.
- WhatsApp conversations **never** use `uc_*` ids; portal inbox continues to list tenant conversations by tenant id only.

### 2.3 `messageId`

| Layer | Rule |
|-------|------|
| **Consumer message** | `randomUUID()` (or client-supplied UUID validated on POST) at write time; stored as doc id under `messages/{messageId}`. |
| **Tenant message** | Same id passed as `options.externalId` to `saveInboundMessage` / `saveOutboundMessage` (`tenantStorage` already supports `externalId \|\| uid("msg")`). |
| **Idempotency** | Retried append with same `messageId` must not create duplicate consumer or tenant rows (upsert on id). |

**Fields on consumer message:**

```json
{
  "id": "<messageId>",
  "conversationId": "<conversationId>",
  "role": "user | assistant | system",
  "content": "string",
  "source": "customer | ai | …",
  "createdAt": "ISO8601",
  "tenantMessageId": "optional mirror id"
}
```

---

## 3. Firestore path proposals (`schema.js` alignment)

Add consumer roots alongside existing `ROOT.USER_PROFILES` / `SARAH_NETWORK` pattern.

### 3.1 New constants (proposed patch to `services/database/schema.js`)

```javascript
/** Sarah App consumer chat index (server writes only in C1). */
export const USER_CONVERSATIONS = {
    ROOT: "userConversations",
    MESSAGES: "messages",
};

/** Published discover snapshot (U6; constants only in C1). */
export const BUSINESS_DIRECTORY = {
    ROOT: "businessDirectory",
    SECTIONS: "sections",
};

/** Optional future platform person link index. */
export const PERSON_LINKS = {
    ROOT: "personLinks",
};

export function userConversationPath(conversationId) {
    return `${USER_CONVERSATIONS.ROOT}/${conversationId}`;
}

export function userConversationMessagesCollectionPath(conversationId) {
    return `${userConversationPath(conversationId)}/${USER_CONVERSATIONS.MESSAGES}`;
}

export function userConversationMessagePath(conversationId, messageId) {
    return `${userConversationMessagesCollectionPath(conversationId)}/${messageId}`;
}

export function businessDirectoryPath(companyId) {
    return `${BUSINESS_DIRECTORY.ROOT}/${companyId}`;
}
```

### 3.2 Document layout

| Path | Content |
|------|---------|
| `userConversations/{conversationId}` | Metadata §2.2 (flat doc, not nested `metadata` field unless existing code prefers nested — prefer **flat** for query `userId` + `lastMessageAt`). |
| `userConversations/{conversationId}/messages/{messageId}` | Message §2.3 |
| `companies/{companyId}/conversations/{tenantConversationId}` | Existing tenant shape; ensure `channel`, `externalUserId` set for Sarah App |
| `companies/{companyId}/messages/…` | Unchanged; WhatsApp + Sarah App share tenant message store |
| `companies/{companyId}/events/{eventId}` | Existing analytics events (`eventStore.js`) |
| `sarahNetwork/audit/{eventId}` | Optional copy of integration events for cross-tenant audit (WP5) |

### 3.3 Indexes (`firestore.indexes.json`)

| Collection | Fields | Query |
|------------|--------|-------|
| `userConversations` | `userId` ASC, `lastMessageAt` DESC | Consumer chat list |
| `userConversations` | `personId` ASC, `companyId` ASC | Idempotent open conversation |
| `userConversations/{id}/messages` | `createdAt` ASC | Thread pagination |

---

## 4. Migration: in-memory → Firestore

### 4.1 Runtime strategy

| Stage | `USER_CONVERSATIONS_BACKEND` | Behaviour |
|-------|------------------------------|-----------|
| **0 (today)** | `memory` (default) | Current `Map` in `userConversationService.js` |
| **1** | `dual` | Write memory + Firestore; read memory first, fallback Firestore |
| **2** | `firestore` | Read/write Firestore; memory cache optional |
| **3** | remove memory | Delete maps after bake-in |

### 4.2 Hydration on boot (stage 1–2)

1. For each `userConversations` doc (paginated), load metadata into process cache **or** skip cache entirely in stage 2.
2. Do **not** load all messages — load on `getUserConversationById` / list with preview only.
3. Existing `syncMessagesFromTenant` remains fallback when consumer messages subcollection empty but tenant history exists (post-restart recovery).

### 4.3 Backfill from tenant CRM (one-time job spec)

**Script:** `scripts/backfill-user-conversations-from-tenant.mjs` (WP6)

- Input: `companyId`, optional `since` timestamp.
- Scan `companies/{companyId}/conversations` where `channel === "sarah_app"` and `externalUserId` present.
- For each: compute `conversationId = uc_{companyId}_{externalUserId}`, upsert consumer metadata + `tenantConversationId`.
- Optionally copy last N tenant messages into consumer `messages/` with stable ids from tenant `externalId` or message doc id.
- **Skip** WhatsApp-only conversations.

### 4.4 `sarah_app::` customer id stability

- **No renaming** of existing tenant customer or conversation doc ids in C1.
- New code must **continue** calling `resolveSarahAppCustomerId(uid)` — document that the **double** `sarah_app::` prefix on conversation id is intentional (`channel::customerId`).
- If a future cleanup is needed, treat as a **separate** migration with inbox deep-link map; not C1.

---

## 5. Integration event envelope

### 5.1 Purpose

Unify Sarah App integration signals (message mirrored, conversation opened, network dispatch) with tenant analytics and future portal/subscriber automation, with **idempotent** publishing.

### 5.2 Envelope schema (v1)

**Canonical file (first coding slice):** `services/events/integrationEventContract.v1.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ZiricIntegrationEventV1",
  "type": "object",
  "required": ["id", "type", "occurredAt", "source", "resource"],
  "properties": {
    "id": { "type": "string", "description": "Unique event id (evt-… or UUID)" },
    "type": {
      "type": "string",
      "enum": [
        "integration.conversation.opened",
        "integration.message.user",
        "integration.message.assistant",
        "integration.tenant.mirrored",
        "integration.identity.link.proposed"
      ]
    },
    "occurredAt": { "type": "string", "format": "date-time" },
    "companyId": { "type": ["string", "null"] },
    "personId": { "type": ["string", "null"] },
    "source": {
      "type": "object",
      "required": ["portal"],
      "properties": {
        "portal": { "enum": ["sarah_app", "company_portal", "platform"] },
        "service": { "type": "string" },
        "version": { "type": "string" }
      }
    },
    "resource": {
      "type": "object",
      "required": ["kind", "id"],
      "properties": {
        "kind": { "enum": ["conversation", "message", "person", "customer"] },
        "id": { "type": "string" }
      }
    },
    "idempotencyKey": {
      "type": "string",
      "description": "Stable key for dedupe, e.g. sarah_app:{companyId}:{messageId}"
    },
    "payload": { "type": "object" },
    "metadata": { "type": "object" }
  }
}
```

### 5.3 Mapping to existing tenant `eventBus`

| Integration `type` | Tenant `EventTypes` (optional fan-out) | Notes |
|--------------------|----------------------------------------|-------|
| `integration.message.user` | `MessageReceived` | `payload.channel: sarah_app`, `metadata.idempotencyKey` |
| `integration.message.assistant` | `MessageSent` | Same |
| `integration.conversation.opened` | `ConversationStarted` | When consumer thread first created |
| Others | none or audit-only | Write `sarahNetwork/audit/{id}` |

**Idempotency:** Before `publish`, check `companies/{companyId}/events` or a small `integrationIdempotency/{idempotencyKey}` doc (reuse pattern from `FINANCE_IDEMPOTENCY_KEYS` concept, tenant-scoped).

**WhatsApp:** Webhook path does **not** emit integration envelope in C1; optional WP5 adds envelope only behind `INTEGRATION_EVENTS_SARAH_APP=1`.

---

## 6. Ordered work packages

### WP1 — Schema & contracts (docs + constants)

| Item | Detail |
|------|--------|
| **Deliver** | `schema.js` constants/path helpers §3.1; `integrationEventContract.v1.json`; JSDoc typedefs in `services/users/identityContracts.js` (types only) |
| **Files** | `services/database/schema.js`, `services/events/integrationEventContract.v1.json`, `services/users/identityContracts.js` (new) |
| **Acceptance** | Unit test: path helpers match data architecture doc; JSON schema validates example payloads |
| **Risk** | Low — no runtime behaviour change |

### WP2 — Firestore `userConversationStore`

| Item | Detail |
|------|--------|
| **Deliver** | `services/users/userConversationFirestoreStore.js` — CRUD for metadata + messages using Admin SDK / existing Firestore client |
| **Files** | `services/database/firestoreClient.js` (if helper needed), new store module |
| **Acceptance** | Integration test with emulator or memory Firestore stub: create conversation, append message, list by `userId` |
| **Risk** | Medium — gated by env flag |

### WP3 — Adapter in `userConversationService.js`

| Item | Detail |
|------|--------|
| **Deliver** | Delegate to store based on `USER_CONVERSATIONS_BACKEND`; preserve public exports used by routes and `companyReceptionChatService.js` |
| **Files** | `services/users/userConversationService.js`, `services/api/userConversationRoutes.js` (optional `messageId` on POST body) |
| **Acceptance** | `test/user-conversations-u5.test.mjs` passes for `memory` and `firestore` (CI matrix or sequential env) |
| **Risk** | Medium — regression on U5 |

### WP4 — `messageId` + `externalId` propagation

| Item | Detail |
|------|--------|
| **Deliver** | Pass `entry.id` as `externalId` in `appendUserConversationMessage` tenant opts; idempotent upsert in tenant message write |
| **Files** | `services/users/userConversationService.js`, `services/storage/tenantStorage.js` (confirm upsert semantics) |
| **Acceptance** | Test: duplicate append with same `messageId` → single tenant message |
| **Risk** | Low if WhatsApp path untouched |

### WP5 — Integration event publisher

| Item | Detail |
|------|--------|
| **Deliver** | `services/events/publishIntegrationEvent.js` — validate envelope, idempotency check, optional `eventBus.publish` fan-out |
| **Files** | `services/events/publishIntegrationEvent.js`, hook in `appendUserConversationMessage` behind flag |
| **Acceptance** | Test: same `idempotencyKey` twice → one persisted side effect |
| **Risk** | Low with flag off by default |

### WP6 — Indexes, backfill script, programme tests

| Item | Detail |
|------|--------|
| **Deliver** | `firestore.indexes.json` entries; backfill script spec implemented; `test/user-conversations-persistence.test.mjs` |
| **Files** | `firestore.indexes.json`, `scripts/backfill-user-conversations-from-tenant.mjs`, tests |
| **Acceptance** | Staging dry-run on SmileMore demo company; restart test: conversations visible after API kill |
| **Risk** | Ops — run backfill manually |

---

## 7. Files to touch (summary)

| Area | Paths |
|------|-------|
| Schema | `services/database/schema.js`, `firestore.indexes.json` |
| Consumer conversations | `services/users/userConversationService.js`, `services/users/userConversationFirestoreStore.js`, `services/users/identityContracts.js` |
| Tenant mirror | `services/storage/tenantStorage.js`, `services/conversationService.js` |
| Company Sarah | `services/sarah/company/companyReceptionChatService.js` (no logic change expected; verify hooks) |
| API | `services/api/userConversationRoutes.js` |
| Events | `services/events/integrationEventContract.v1.json`, `services/events/publishIntegrationEvent.js` |
| Tests | `test/user-conversations-u5.test.mjs`, `test/user-conversations-persistence.test.mjs` |
| Ops | `scripts/backfill-user-conversations-from-tenant.mjs` |
| Docs | This file, cross-link from [SARAH_APP_DEVELOPMENT_ROADMAP.md](./SARAH_APP_DEVELOPMENT_ROADMAP.md) (optional) |

**Explicitly not touched in C1:** `app/js/portal/modules/conversations.js`, `inbox-ui.js`, `services/integrations/conversationPipeline.js`, `services/whatsapp.js`.

---

## 8. Acceptance tests (programme level)

| ID | Scenario | Command / evidence |
|----|----------|-------------------|
| AT-C1-01 | U5 dual-write still mirrors tenant `sarah_app` history | `node --test test/user-conversations-u5.test.mjs` |
| AT-C1-02 | Consumer conversation survives service restart | `USER_CONVERSATIONS_BACKEND=firestore`: send message, restart process, GET list returns thread |
| AT-C1-03 | `conversationId` stable for `(uid, companyId)` | Two `openUserConversation` calls → same `id` |
| AT-C1-04 | `messageId` idempotent on retry | POST same body twice with same `messageId` → one tenant row |
| AT-C1-05 | WhatsApp regression | `node --test test/whatsapp-*.test.mjs` (existing suite) unchanged green |
| AT-C1-06 | Integration event idempotency | Duplicate `idempotencyKey` → single audit/event row |

---

## 9. Recommended first coding PR slice (for approval)

**Title:** `feat(sarah-app): C1 WP1–WP3 schema + Firestore userConversations (flagged)`

**Scope (smallest vertical slice):**

1. Add `USER_CONVERSATIONS` / path helpers to `schema.js` + `firestore.indexes.json` composite for `userId` + `lastMessageAt`.
2. Add `services/users/identityContracts.js` (JSDoc + exported validators for `conversationId` / `messageId` / `personId`).
3. Add `services/events/integrationEventContract.v1.json` only (no publisher yet).
4. Implement `userConversationFirestoreStore.js` + `USER_CONVERSATIONS_BACKEND=memory|firestore` in `userConversationService.js` (default **`memory`**).
5. Extend U5 test to run once with `USER_CONVERSATIONS_BACKEND=firestore` when `FIRESTORE_EMULATOR_HOST` or test harness is available; otherwise document skip.

**Out of this PR:** integration event publisher, backfill script, portal inbox, `businessDirectory` Firestore, person link graph.

**Rollback:** Set `USER_CONVERSATIONS_BACKEND=memory` (default).

---

## 10. Traceability to C0 findings

| C0 finding | C1 WP |
|------------|-------|
| In-memory consumer index | WP2, WP3, WP6 |
| Dual conversation id spaces | §2.2, WP3 |
| No `personId` | §2.1 (uid as personId); link graph WP5 type only |
| Unstable consumer `messageId` | WP4 |
| Identity fragmentation (`sarah_app::`) | §4.4, no breaking rename |
| Event/analytics gap for consumer | WP5 envelope |
| WhatsApp regression risk | Guardrails §1, AT-C1-05 |

---

*End of C1 plan. Implementation PRs should reference work package IDs (WP1–WP6).*
