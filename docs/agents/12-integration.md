# 12 — Integration Agent

## Agent Name & Role

Owns the Integration Hub: channel adapters, webhooks, outbound send, connectors, and portal integrations UI.

## Phase

**Phase 5 — Integrations**

## Responsibility

- Integration Hub init, adapter registry, send/receive
- Channel adapters: WhatsApp, Facebook, Instagram, Telegram, SMS, Email, Webchat
- Webhook router (legacy + unified paths)
- Conversation pipeline ingest
- Rate limiting, retry queue, integration logging
- Third-party connectors: Stripe, Paystack, Google Calendar, M365, Firebase
- Portal `integrations` module

## Owns

- `services/integrations/` (entire folder)
- `services/whatsapp.js` (legacy bridge)
- `routes/webhook.js`
- `js/portal/modules/integrations.js`
- `docs/architecture/INTEGRATION_HUB.md`
- `server.js` (webhook + integration route sections)

## Depends on

- **01 Platform Architecture Agent** — tenant context on webhooks
- **03 Company Workspace Agent** — per-tenant integration config
- **08 Conversations Agent** — pipeline ingest target

## Do NOT touch

- CRM customer upsert logic (Conversations Agent)
- Billing payment capture (Billing Agent)
- Sarah connect* tool UI flows beyond calling hub APIs

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Integration Agent. Own services/integrations/ and webhook routing.

Read docs/architecture/INTEGRATION_HUB.md. Audit integrationHub.js, adapterRegistry.js, webhookRouter.js.
List each adapter: configured vs stub.

Tasks:
1. Harden WhatsApp adapter for production (token refresh, error codes).
2. Wire portal integrations module to GET/POST tenant integration config APIs.
3. Implement at least one additional channel beyond WhatsApp (e.g. webchat) end-to-end.
4. Ensure unified webhook POST /webhooks/:channel/:companyId resolves tenant correctly.
5. Document connector stubs (Stripe, Paystack) with env vars in .env.example.

Do NOT modify CRM or billing business logic.
Return: channel status matrix, webhook test steps, portal UI gaps.
```

## Definition of Done

- [ ] WhatsApp inbound/outbound production-ready
- [ ] Unified webhook router tenant-scoped
- [ ] Portal integrations module shows channel status + connect flows
- [ ] Rate limit + retry queue operational with monitoring endpoint
- [ ] Integration health API returns per-channel status
- [ ] Connector stubs documented with activation checklist

## Current status

**60% — Partial**

### Already built

- Full Integration Hub architecture with mermaid diagram
- WhatsApp adapter with legacy webhook handler (QA verified)
- Adapter registry + stub factory for other channels
- Conversation pipeline + ingest batch
- Rate limiter, retry queue, integration logger
- Portal integrations module
- Connectors scaffold (Stripe, Paystack, Google Calendar, M365)

### Remaining work

- Facebook, Instagram, Telegram, SMS, Email are **stubs**
- Connectors are **stubs** — no live OAuth flows
- Tenant integration config encryption documented but not fully implemented
- Portal connect flows may not persist to `companies/{id}/integrations`
- Meta webhook verify token env coupling needs production checklist validation
