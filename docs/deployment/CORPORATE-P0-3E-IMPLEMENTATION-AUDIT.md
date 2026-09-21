# CORPORATE-P0-3E — Implementation audit (pre-commit)

**Baseline:** `a649bba`  
**Worktree:** `.p0-3e-impl`  
**Status:** Ready for review — **not committed**, **not deployed**

---

## Exact files changed (5)

| File | Change |
|------|--------|
| `services/automation/actionExecutor.js` | `send_message` → takeover check → `deliverOutbound` (hub) → on Meta id → `saveOutboundMessage`; optional `__integrationSendOverride` test seam for verifier only |
| `services/conversation/canonicalCommunicationContract.js` | Register `automation-send-message` adapter |
| `services/conversation/inboxMessageContract.js` | Map `source: "automation"` → inbox `role: "ai"` (preserve `source` for attribution) |
| `scripts/verify-corporate-p0-3e.js` | Static + memory runtime tests |
| `package.json` | `verify:corporate-p0-3e` script |

**Not changed:** `messageWorker.js`, Sarah, Portal/MC clients, CRM, legacy routes, delivery status, Railway/Netlify configs.

---

## Behavioral change (only `send_message`)

**Before:** `integrationSend` only → WhatsApp with **no** tenant message doc.

**After:**

1. Require `companyId`.
2. Skip if `aiReplyPending` / `skipAutoReply` (unchanged).
3. Skip if **human takeover** active (`getConversationTakeoverState`).
4. Call `integrationSend`.
5. Require Meta message id in response.
6. **`saveOutboundMessage`** with `source: "automation"`, `externalId`, `senderName`, `companyId`, `channel`.
7. On integration failure or missing id → **no** canonical message write.

Human reply path still saves before send (pre-existing Portal behavior — out of 3E scope).

---

## Acceptance mapping

| Requirement | How addressed |
|-------------|----------------|
| Canonical message record | `saveOutboundMessage` after successful Meta id |
| Attribution | `source: "automation"`; API maps to `role: "ai"` |
| companyId / conversationId | Tenant path via `saveTenantMessage` → `conversationId` `whatsapp::{phone}` |
| Takeover not bypassed | Skip when `humanControlled` |
| Failed Meta → no false outbound | No `saveOutboundMessage` unless id returned; verify mock throw |
| Successful send → external id | `externalId: metaMessageId` |
| Duplicate idempotency | Same Meta id overwrites same message doc key (wamid as id when provided) — same as inbound pattern |
| Worker unchanged | No edits to worker |
| Portal/MC visibility | Same tenant store / `getTenantConversationHistory` / inbox API mapping |
| P0-3A/B regression | Re-run bundle below |

---

## Verifiers run (from `.p0-3e-impl`)

| Command | Result |
|---------|--------|
| `npm run verify:corporate-p0-3e` | **PASS** |
| `npm run verify:corporate-p0-3a` | **PASS** |
| `npm run verify:corporate-p0-3b` | **PASS** |
| `npm run verify:corporate-p0-1` | **PASS** |
| `npm run verify:corporate-p0-2` | **PASS** (customer-journey env warning unchanged) |
| `npm run verify:portal-3a` | **PASS** |
| `npm run verify:portal-3c-inbox-contract` | **PASS** |

---

## Scope contamination check

- No main WIP touched.
- No production/Firestore mutation.
- No deploy.
- `inboxMessageContract.js` — minimal one-line attribution fix required for Portal inbox honesty (not a UI redesign).

---

## Post-approval steps (not done yet)

1. Commit in `.p0-3e-impl` only after review sign-off.
2. Railway deploy when authorized (server-only change).
3. Optional live automation smoke on disposable tenant.
