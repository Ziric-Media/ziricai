# CORPORATE-P0-3 — Implementation plan (P0-3A + P0-3B only)

**Status:** PLAN — not authorized until explicit sign-off on this document  
**Baseline:** `f18a3aa` (`.p0-2c-1-prestage`)  
**Parent gate:** [CORPORATE-P0-3-GATE.md](./CORPORATE-P0-3-GATE.md) — **audit accepted**  
**Out of scope for this plan:** P0-3C (legacy), P0-3D (Sarah separation hardening beyond docs), P0-3E (automation), P0-3F (delivery status), full P0-3 finish smoke  

**Compatibility constraint:** Do not redesign Central Motors WhatsApp/Sarah routing (`centralMotorsPilot.js`, `resolvePilotDataCompanyId`). MC inbox must continue to use the same tenant APIs Portal uses, including pilot data alias on read/write.

---

## Why only A + B first

The audit shows WhatsApp ingest/worker and Portal mutations already converge on tenant storage. The highest-risk divergence is **Mission Control admin inbox** writing root `conversations/{id}/messages` and local overrides instead of tenant communication APIs. P0-3A locks the canonical authority in code/docs/verifiers; P0-3B removes MC as a competing writer.

---

## P0-3A — Canonical communication authority (audit / lock)

### Goal

Formally designate the authoritative conversation/message store and write surface. No new persistence path may become authoritative without registering as an approved adapter.

### Canonical authority (designation)

| Layer | Role | Primary modules |
|-------|------|-----------------|
| **Persistence SoT** | Tenant-scoped docs | `services/storage/tenantStorage.js` — `companies/{companyId}/conversations`, `messages`, `customers` |
| **Low-level write API** | Inbound/outbound append, wamid idempotency | `services/conversationService.js` — `saveInboundMessage`, `saveOutboundMessage`, claim/processed helpers |
| **Tenant communication service** | Human reply, takeover, read state | `services/tenants/conversationService.js` — `sendConversationReply`, `setHumanTakeover`, `markConversationRead`, `getTenantConversation`, `listTenantConversations` |
| **HTTP contract (Portal + MC)** | Authenticated mutations | `services/api/customerOpsRoutes.js` — `POST …/reply`, `…/takeover`, `…/read` |
| **Registered inbound adapter** | WhatsApp webhook ingest | `services/integrations/conversationPipeline.js` → `conversationService` + queue |
| **Registered outbound adapter (AI)** | Worker path | `services/queue/workers/messageWorker.js` → `saveOutboundMessage` + `integrationHub` |
| **Derived (non-SoT)** | CRM narrative | `customerService` timeline / `crmSyncService` — must not replace message docs |

Channel-specific adapters (WhatsApp webhook, future channels) are allowed **if** they call the low-level write API or tenant service above and obey tenant scope, takeover, attribution, and idempotency rules.

### Architectural rule (gate)

> **No communication feature may introduce a new message/conversation persistence path without registering it as an approved adapter on the canonical communication pipeline.**

Enforcement in P0-3A: contract module + static verifier (deny-list grep + registry allow-list).

### P0-3A — file manifest (exact)

| Action | Path | Purpose |
|--------|------|---------|
| **NEW** | `services/conversation/canonicalCommunicationContract.js` | Exports `CANONICAL_MESSAGE_STORE`, `CANONICAL_WRITE_ENTRY_POINTS`, `REGISTERED_COMMUNICATION_ADAPTERS`, `FORBIDDEN_CLIENT_WRITE_PATTERNS` (documentation + verifier import) |
| **EDIT** | `services/database/schema.js` | Short comment block under `TENANT_COLLECTIONS` / `LEGACY_COLLECTIONS` pointing to contract; clarify legacy root `conversations` is **not** authoritative |
| **NEW** | `scripts/verify-corporate-p0-3a.js` | Static gate: contract exports present; inbound/outbound server paths reference allow-list; **admin client** still flagged as debt until P0-3B (optional `--strict` fails on MC violations) |
| **EDIT** | `package.json` | `"verify:corporate-p0-3a": "node scripts/verify-corporate-p0-3a.js"` |
| **EDIT** | `docs/deployment/CORPORATE-P0-3-GATE.md` | Link to this plan; sub-gate checklist |

**No runtime behavior change** in P0-3A (documentation + verification only).

### P0-3A — acceptance tests

1. **`npm run verify:corporate-p0-3a`** exits 0 in baseline mode (documents known MC debt without failing).
2. **`npm run verify:corporate-p0-3a -- --strict`** exits non-zero until P0-3B lands (proves verifier detects MC root writes).
3. Contract module lists at minimum: `conversationPipeline.ingest`, `messageWorker` outbound, `sendConversationReply`, `saveInboundMessage` / `saveOutboundMessage`.
4. `schema.js` explicitly states tenant `MESSAGES` / `CONVERSATIONS` are SoT; `LEGACY_COLLECTIONS.CONVERSATIONS` is deprecated for new writes.
5. Re-run **`verify-corporate-p0-1`** and **`verify-corporate-p0-2`** — no regressions.

---

## P0-3B — Mission Control → canonical tenant communication API

### Goal

MC must stop directly writing:

- root Firestore `conversations/{id}/messages`
- root `conversations/{id}` takeover fields
- **authoritative** message content via `inbox-state` localStorage overrides

MC must use the **same tenant HTTP API** as Portal for human reply, takeover, and mark-read when operating on real tenant data (`source: 'api'`).

### Auth note

`requireAuthenticatedTenantMember()` already allows **superadmin** (`tenantContext.js`). MC superadmin sessions can call the same routes as Portal tenant members without a second server write path.

### MC behavior after P0-3B

| Scenario | Behavior |
|----------|----------|
| **List / load thread** | Unchanged priority: API first (`fetchConversationsFromApi`, `fetchConversationMessagesFromApi`); no new Firestore fallbacks for writes |
| **Human reply** (`mode === 'human'`) | `POST /api/companies/:companyId/conversations/:id/reply` with staff sender name → canonical outbound + WhatsApp hub |
| **Takeover toggle** | `POST …/takeover` with `{ enabled, humanAgent }` → `setHumanTakeover` / worker guards |
| **Mark read** | `POST …/read` → tenant conversation doc |
| **AI mode “simulate customer + fake AI”** | **Demo-only** when `isDemoDataAllowed()` and conversation `source !== 'api'`; must **not** call Firestore or persist fake messages for API-backed threads |
| **Notes / tags** | May remain local/root legacy **only if** scoped as non-communication metadata in a follow-up; P0-3B minimum: stop notes/tags from blocking message canonicalization (optional: leave as-is with comment “derived UI metadata — not message SoT”) |
| **Suggested reply** | Remains client-side `generateAiReply` (no tenant message write) |

### P0-3B — file manifest (exact)

| Action | Path | Purpose |
|--------|------|---------|
| **EDIT** | `admin/js/admin/api.js` | Add `postConversationReply`, `postConversationTakeover`, `postConversationRead` (mirror Portal `js/portal/api.js`) |
| **EDIT** | `js/admin/api.js` | Same as above (duplicate admin tree used by deploy) |
| **EDIT** | `admin/js/admin/services/conversations.js` | Remove `addDoc(…/conversations/…/messages)` and root `updateDocument(COLLECTION, …)` for takeover; route mutations through API helpers; require `companyId` on `sendMessage`, `setTakeoverMode`, `markConversationRead`; gate demo simulation |
| **EDIT** | `js/admin/services/conversations.js` | Mirror |
| **EDIT** | `admin/js/admin/modules/conversations.js` | Pass `companyId` into service calls; on successful API reply/takeover/read, refresh from API (or merge API response); disable AI simulation loop when `source === 'api'` |
| **EDIT** | `js/admin/modules/conversations.js` | Mirror |
| **EDIT** | `admin/js/admin/inbox-state.js` | Stop persisting `overrides[id].messages` for API-backed conversations (UI cache only, or clear on refresh) |
| **EDIT** | `js/admin/inbox-state.js` | Mirror |
| **NEW** | `scripts/verify-corporate-p0-3b.js` | Fails if admin `services/conversations.js` contains `addDoc` + `conversations` subcollection writes or `collection(getDb(), COLLECTION, conversationId, 'messages')` for send path |
| **EDIT** | `package.json` | `"verify:corporate-p0-3b": "node scripts/verify-corporate-p0-3b.js"` |
| **EDIT** | `scripts/verify-corporate-p0-3a.js` | `--strict` passes after P0-3B |

**Server files:** No change required for P0-3B if MC fully adopts existing `customerOpsRoutes` (already includes `resolvePilotDataCompanyId` on mutations).

**Explicitly not in P0-3B manifest:** `messageWorker.js`, `conversationPipeline.js`, automation engine, legacy `storageAdapter`, delivery webhooks, Portal JS (already canonical).

### P0-3B — acceptance tests

#### Static

1. **`npm run verify:corporate-p0-3b`** — exit 0.
2. **`npm run verify:corporate-p0-3a -- --strict`** — exit 0.
3. **`npm run verify:portal-3a-takeover`** (existing) — exit 0.
4. **`npm run verify:portal-3c-inbox-contract`** (existing) — exit 0.

#### Manual / staging (disposable tenant + CM read-only)

5. **MC human reply:** Superadmin selects tenant → open WhatsApp thread → human mode → send reply → message appears in Portal inbox; **one** new doc under tenant `messages`; WhatsApp send attempted via hub (or logged skip in sandbox).
6. **Takeover:** MC enables human takeover → inbound WhatsApp does **not** produce AI outbound (worker guard); Portal shows human mode.
7. **Release to AI:** MC or Portal releases → AI resumes (existing takeover contract).
8. **Mark read:** MC open thread → unread clears on tenant conversation doc; Portal agrees.
9. **No root write:** After (5)–(8), no new docs under root `conversations/{id}/messages` for that thread (Firestore console or scripted probe).
10. **Central Motors:** Sandbox phone still resolves via `resolvePilotDataCompanyId`; existing pilot smoke unchanged (read + optional single inbound/outbound if env allows — **no pipeline redesign**).
11. **Demo mode:** With demo data allowed and no API items, local AI simulation still works without Firestore writes.

#### Regression

12. **`verify-corporate-p0-1`** + **`verify-corporate-p0-2`** — pass from clean worktree.

---

## Deployment notes (when authorized)

- Prefer **clean detached worktree** commit(s), same discipline as P0-2.
- **P0-3A** can ship alone (verifier + docs only).
- **P0-3B** requires **Netlify admin** deploy (both `admin/` and `js/admin/` if both are served); API redeploy only if server changes are added later.
- Do not merge unrelated `main` WIP.

---

## Authorization checklist (user)

- [x] P0-3A implementation authorized  
- [x] P0-3B implementation authorized (may follow A in same or separate PR)  
- [ ] Full P0-3C–F remains **not** authorized  
