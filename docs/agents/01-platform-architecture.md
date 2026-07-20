# 01 — Platform Architecture Agent

## Agent Name & Role

Owns the multi-tenant core layer, data paths, event bus, and migration strategy for ZiricAI.

## Phase

**Phase 1 — Foundation**

## Responsibility

- Maintain `services/core/`, `services/database/`, `services/events/`
- Enforce tenant path model: `companies/{companyId}/<collection>`
- Document and implement legacy→tenant migration per `MIGRATION.md`
- Keep `server.js` middleware (`attachTenantContext`, `requireTenantScope`) consistent
- Define storage backend strategy (`memory` vs `firestore` vs `auto`)
- Coordinate composite indexes in `firestore.indexes.json`

## Owns

- `services/core/tenantContext.js`
- `services/core/serviceBase.js`
- `services/database/schema.js`
- `services/database/tenantRepository.js`
- `services/database/firestoreClient.js`
- `services/events/` (eventBus, eventStore, eventTypes, handlers)
- `services/storage/storageAdapter.js`
- `services/api/routeRegistry.js`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MIGRATION.md`
- `docs/architecture/FIRESTORE_SCHEMA.md`
- `docs/architecture/API.md`
- `firestore.indexes.json`
- `server.js` (tenant middleware sections only)

## Depends on

None (root agent).

## Do NOT touch

- UI modules in `js/portal/` or `js/admin/` (except documenting API contracts)
- Sarah tool implementations (`services/sarah/tools/`)
- Marketing pages (`ziricai.html`, industry-*.html`)
- Payment provider SDK wiring (Billing Agent)
- Firebase Auth client flows (Authentication Agent)

## Definition of Done

- [x] All tenant services write via `TenantRepository` to `companies/{companyId}/…`
- [x] Migration script exists and can move demo data from legacy paths
- [x] `MIGRATION.md` Phase 2 checklist updated with actual script names
- [ ] No new root-level collection writes from tenant services (legacy webhook/CRM still dual-path)
- [x] Event bus handlers registered at startup (`initEventSystem`)
- [x] Index definitions match query patterns in PERFORMANCE.md

## Current status

**88% — Substantially complete**

### Completed (2026-07-19)

- `services/README.md` — layer responsibilities + naming conventions
- `services/api/routeRegistry.js` — canonical route catalog + `X-API-Version` header
- `docs/architecture/API.md` — grouped route documentation
- `scripts/migrate-demo-to-tenants.js` — Phase 2 migration (customers, agents, knowledge)
- `npm run migrate:tenants` / `migrate:tenants:dry` scripts
- `TenantRepository.listPage()` — cursor pagination (`startAfterId`)
- `firestore.indexes.json` — appointments + documents collection-group indexes
- `firestore.rules` — `platform/{document=**}` marketplace path
- Legacy deprecation comments on `customerService`, `conversationService`, `knowledgeService`, `firestoreAdapter`, `workflowService`
- Removed empty stub `routes/webhook.js`
- ARCHITECTURE.md updated with full folder layout + naming conventions

### Remaining work

- WhatsApp webhook, CRM list APIs, and knowledge upload still hit **legacy flat paths** at runtime (migration script ready; route cutover is Agent 08/07)
- Workflow studio UI still uses in-memory `workflowService` (tenant automations via `workflowRegistry` are separate)
- Phase 4 cutover (`STORAGE_BACKEND=firestore` everywhere) not validated end-to-end
- `scripts/migrate-memory-seed.js` not yet implemented

### Recommended next agent

**02 Authentication** — enable strict tenant enforcement; then **08 Conversations** for webhook tenant path cutover.
