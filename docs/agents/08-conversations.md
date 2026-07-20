# 08 — Conversations Agent

## Agent Name & Role

Owns multi-channel conversation storage, inbox UI, message pipeline, and AI reply worker.

## Phase

**Phase 3 — Customer Operations**

## Responsibility

- Conversation service (inbound/outbound messages, list, detail)
- Message worker and job queue processing
- Conversation pipeline from Integration Hub
- Portal `conversations` module and admin inbox/conversations
- Event publishing: MESSAGE_RECEIVED, CONVERSATION_STARTED, LEAD_CAPTURED
- Human takeover and assignment metadata

## Owns

- `services/conversationService.js` (legacy)
- `services/tenants/conversationService.js`
- `services/integrations/conversationPipeline.js`
- `services/queue/jobQueue.js`
- `services/queue/workers/messageWorker.js`
- `services/messaging/messagingService.js`
- `js/portal/modules/conversations.js`
- `js/admin/modules/conversations.js`
- `js/admin/modules/inbox-ui.js`
- `js/admin/inbox-state.js`
- `js/admin/services/conversations.js`
- `routes/webhook.js` (conversation-related sections)

## Depends on

- **01 Platform Architecture Agent** — event bus, tenant paths
- **07 CRM Agent** — upsert customer from WhatsApp
- **12 Integration Agent** — inbound webhooks and outbound send
- **05 AI Employees Agent** — assigned agent for replies

## Do NOT touch

- Integration adapter registry internals (Integration Agent owns adapters)
- Automation workflow definitions (Automation Agent)
- Analytics aggregation logic (Analytics Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Conversations Agent. Own inbox, message storage, and processing pipeline.

Read docs/architecture/INTEGRATION_HUB.md and PLATFORM_QA_REPORT.md webhook chain.
Audit conversationPipeline.js, messageWorker.js, conversationService.js (legacy + tenant).

Tasks:
1. Verify webhook → ingest → queue → worker → eventBus chain for WhatsApp.
2. Move conversation list/detail to companies/{id}/conversations with messages subcollection.
3. Portal conversations module: real-time or polling refresh, channel badges.
4. Admin inbox-ui: unify with portal conversation preview widgets.
5. Ensure AI reply uses aiEmployeeService default agent + knowledge context.

Do NOT refactor integrationHub adapter registry.
Return: pipeline status, tenant migration gaps, UI parity issues.
```

## Definition of Done

- [ ] Inbound messages persist under tenant conversation paths
- [ ] Outbound replies sent via Integration Hub
- [ ] Job queue processes inbound with configurable concurrency
- [ ] Portal + admin inbox show unified conversation list
- [ ] Events published for analytics and automation handlers
- [ ] Human takeover flag stops AI auto-reply

## Current status

**60% — Partial**

### Already built

- End-to-end webhook pipeline verified in PLATFORM_QA_REPORT.md
- `conversationPipeline.ingest` + message worker
- Legacy conversationService with rich message history
- Portal conversations module + admin conversations/inbox-ui
- Event bus integration for MESSAGE_RECEIVED etc.
- `conversationIntelligence.js` for intent/sentiment

### Remaining work

- Primary storage still **flat customers/{phone}/messages** path
- Tenant `conversations/` subcollection partially wired
- No WebSocket/live updates — polling/manual refresh only
- Multi-channel inbox (FB, IG, SMS) UI placeholders
- Assigned agent routing not fully enforced in worker
