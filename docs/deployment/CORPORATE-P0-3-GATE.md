# CORPORATE-P0-3 — Unified Communication Write Path

**Status:** **CORPORATE-P0-3A/B CLOSED** — code `18e45bd`; admin Netlify **`6ab10cb0a66ab6f526ad164d`**; live acceptance **`p0-3ab-live-evidence.json`**; program gate P0-3 remains **OPEN** (3C–F locked)  
**Baseline:** production API `f18a3aa` (P0-2c.1), tenant foundation **CORPORATE-P0-2 COMPLETE**  
**Depends on:** CORPORATE-P0-1 ✅, CORPORATE-P0-2 ✅  
**Next controlled doc:** [CORPORATE-P0-3-AB-IMPLEMENTATION-PLAN.md](./CORPORATE-P0-3-AB-IMPLEMENTATION-PLAN.md) (P0-3A/B only — await explicit authorization)  

---

## Purpose

P0-2 proved that **tenants can be created, owned, and isolated**. P0-3 must prove that **every customer-facing communication channel shares one authoritative write pipeline** so Portal, Mission Control, Sarah (WhatsApp), and future channels cannot maintain competing conversation/message stores or bypass tenant isolation.

---

## Finish line (gate invariant)

> There is **exactly one authoritative communication write pipeline per tenant**. Portal, Mission Control, Sarah (WhatsApp), and automations **mutate messages/conversations only through it** (or **explicitly registered channel adapters**), with CRM/timeline as **derived views**.

**Clarification:** “One pipeline” does **not** mean one function. Channel-specific adapters are allowed when they ultimately write through the **same canonical communication service/repository** and obey the same **tenant, takeover, attribution, idempotency, and delivery** rules.

**Architectural rule (non-negotiable):**

> No communication feature may introduce a new message/conversation persistence path without registering it as an **approved adapter** to the canonical communication pipeline.

**Target topology:**

```
WhatsApp ──┐
Portal ────┤
MC ────────┼──► CANONICAL COMMUNICATION PIPELINE ──► Conversations / Messages (SoT)
Sarah ─────┤                                      └──► Integration / WhatsApp
Automations┘
         │
         ├──► CRM timeline (derived)
         ├──► Portal inbox (derived view)
         └──► Mission Control (derived view)
```

**Target lifecycle (conceptual):**

```
Customer → WhatsApp → Inbound → Canonical store → Sarah OR Human
  → Canonical outbound write → WhatsApp → Delivery status
  → CRM timeline / Portal / MC (read models + derived events)
```

**Anti-pattern (current risk):**

```
Portal human reply ───┐
Sarah (WhatsApp)     ───┼──→ multiple writers / stores
MC admin inbox       ───┘
```

---

## Audit summary (baseline `f18a3aa`)

### Canonical path (WhatsApp — intended production)

| Stage | Location |
|-------|----------|
| Webhook | `api/app.js` `/webhook` → `webhookRouter.handleWhatsAppWebhook` |
| Normalize | `adapters/whatsappAdapter.js` |
| Ingest | `conversationPipeline.ingest` — tenant message + conversation + customer |
| Queue | `jobQueue.enqueue(PROCESS_INBOUND_MESSAGE)` |
| Worker | `messageWorker.processInboundMessage` — AI, takeover guards, outbound |
| Outbound | `integrationHub.sendMessage` → Meta API |
| Persist reply | `saveOutboundMessage` (tenant `companies/{id}/messages`) |

**Tenant SoT (when `companyId` resolved):**

- Conversations: `companies/{companyId}/conversations/{channel::phone}`
- Messages: `companies/{companyId}/messages/{id}` (inbound may use wamid)
- Customers: `companies/{companyId}/customers/{phone}`
- Takeover: conversation doc `humanTakeover` / `mode` — enforced in `takeoverSafety.js` + worker

### Portal Inbox (aligned with tenant API)

- UI: `js/portal/modules/conversations.js`, `inbox-ui.js`, `portal/api.js`
- Writes: `customerOpsRoutes.js` → `sendConversationReply`, `setHumanTakeover`, `markConversationRead` in `services/tenants/conversationService.js`
- Human reply: tenant message doc + `integrationHub.sendMessage` (bypasses worker by design)
- Auth: `requireAuthenticatedTenantMember()` on mutations

### Mission Control / Admin inbox (competing write path — P0-3 gap)

- `admin/js/admin/services/conversations.js`:
  - `sendMessage` → root Firestore `conversations/{id}/messages` + local inbox override
  - `setTakeoverMode` → root `conversations` doc — **not** `setHumanTakeover` / worker guards
  - `markConversationRead` → local override only
- Does **not** call tenant comm APIs or WhatsApp hub for MC-originated replies

### Sarah

| Surface | Store | WhatsApp |
|---------|-------|----------|
| Portal `/api/sarah/chat` | `sarahMemory.js` sessions | No |
| WhatsApp customer AI | Tenant messages via worker | Yes |

Portal Sarah tools (e.g. `viewConversations`) are **read-only** on tenant inbox.

### CRM / timeline (derived, not message SoT)

- `customerService.addTimelineEvent`, `crmSyncService.syncFromSalesTurn` — embed narrative on **customer** doc / leads
- Same turn may write **message + customer patch + timeline** — acceptable if messages remain canonical and timeline is derived

### Legacy / parallel stores (P0-3 consolidation targets)

1. Inbound without `companyId` → `storageAdapter.saveMessage` (`customers/{phone}/messages`)
2. Global wamid ledger `_processedInbound` (idempotency — keep, but document vs tenant messages)
3. `listTenantConversations` may prefer legacy `listConversations` when non-empty
4. `GET /api/conversations/:id/messages` — legacy adapter, optional tenant scope
5. Automation `send_message` → `integrationSend` without `saveOutboundMessage`
6. MC admin writes (see above)

### Delivery status

- Meta **status** webhooks: acknowledged, **not persisted** to message docs (explicit gap or non-goal)

### Tenant isolation

- Webhook: tenant from `phone_number_id` integration lookup (no Firebase)
- Portal mutations: membership + company scope
- Risk: legacy routes with optional `companyId` under lax enforcement

### Central Motors (migration compatibility)

- `centralMotorsPilot.js`, `resolvePilotDataCompanyId`, sandbox phone → `central-motors-rtb` when pilot enabled
- P0-3 must **not** break proven WhatsApp/Sarah pilot routing or RTB data alias

### Idempotency / failure (existing)

- Inbound: wamid claim + queue dedupe + `markInboundMessageProcessed`
- Outbound: job flags `outboundSent` / Meta message id
- Takeover: ingest skip enqueue; worker early exit; pre-send guard
- Gaps: MC takeover not wired; delivery failure not on message doc; human/AI race windows documented in worker

---

## Sub-gates (acceptance program)

| Sub-gate | Intent | Implementation |
|----------|--------|----------------|
| **P0-3A** | Canonical communication authority — designate SoT + write service; no second authoritative store | **CLOSED** |
| **P0-3B** | Mission Control alignment — stop root `conversations/{id}/messages` and local comm overrides; use tenant API like Portal | **CLOSED** |
| **P0-3C** | Legacy path containment — phone-key / optional-scope routes read-only or retired | After B |
| **P0-3D** | Sarah/Portal separation — WhatsApp customer state vs staff memory; no leak into WhatsApp SoT | After B |
| **P0-3E** | Automation alignment — `send_message` through canonical outbound (`saveOutboundMessage`) | After B |
| **P0-3F** | Delivery status — queued → sent → delivered → read (+ failures) | **Last** sub-phase |

**Recommended implementation order:** 3A → 3B → 3E → 3C → 3D → 3F → full cross-channel acceptance.

**Central Motors:** compatibility constraint on every sub-gate — do not redesign proven WhatsApp/Sarah pilot routing.

---

## P0-3 scope (full program — NOT authorized as one blob)

**In scope (expected over sub-gates):**

- Formal canonical write contract + adapter registry (3A)
- MC writes via tenant communication API (3B)
- Automation outbound through canonical path (3E)
- Legacy dual-store containment (3C)
- Sarah memory boundary (3D)
- Delivery status on message docs (3F)
- Verifier + production smoke (see finish test)

**Out of scope (unless explicitly added):**

- Onboarding / tenant factory (P0-2)
- Marketplace entitlement
- Full CRM v1 UI redesign
- Replacing Postgres queue backend
- Central Motors business logic redesign (compatibility only)

---

## Final P0-3 finish test (program closure)

Prove all of the following use the **same canonical communication records**, respect tenant isolation and takeover, and feed CRM/Portal/MC as derived views:

1. WhatsApp inbound → canonical message → Sarah response → canonical outbound → WhatsApp  
2. Portal human reply → canonical outbound → WhatsApp  
3. Mission Control human reply → canonical outbound → WhatsApp  
4. Automation send → canonical outbound → WhatsApp  

Plus: duplicate webhook / worker retry idempotency; human reply during AI processing; CM pilot regression; Portal Sarah does not write WhatsApp SoT.

---

## Acceptance tests (by sub-gate — summary)

**3A:** Contract + `verify-corporate-p0-3a` (see AB plan).  
**3B:** MC API alignment + `verify-corporate-p0-3b` + manual MC/Portal parity (see AB plan).  
**3C–3F:** Defined when each sub-gate is authorized.

---

## Evidence required to close (future)

| Artifact | Required |
|----------|----------|
| Audit accepted | ✅ (this document) |
| P0-3A/B plan approved | Pending — [AB plan](./CORPORATE-P0-3-AB-IMPLEMENTATION-PLAN.md) |
| Implementation PR(s) per sub-gate | Not authorized |
| `verify-corporate-p0-3a` / `3b` / full `p0-3` green | TBD |
| Production WhatsApp + Portal + MC smoke on disposable tenant | Yes (at program close) |
| P0-1 / P0-2 regression | Yes |
| CM pilot read-only smoke | Yes |

**Gate status:** OPEN — audit accepted; **implementation not authorized** (authorize P0-3A/B via AB plan checklist).

---

## Roadmap position

```
CORPORATE-P0-2 ✅ COMPLETE
        ↓
CORPORATE-P0-3 (this gate) ← SPEC / AUDIT
        ↓
P1 Portal / CRM / Billing enhancements
```
