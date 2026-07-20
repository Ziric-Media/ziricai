# ZiricAI Services Layer

Server-side business logic for the multi-tenant platform. All new tenant data access goes through `TenantRepository` under `companies/{companyId}/<collection>`.

## Directory layout

| Path | Responsibility |
|------|----------------|
| `core/` | `tenantContext.js` (middleware), `serviceBase.js` (tenant service base class) |
| `database/` | `schema.js`, `firestoreClient.js`, `tenantRepository.js` |
| `auth/` | Server-side Firebase token verification |
| `tenants/` | Tenant-scoped domain services (CRM, conversations, knowledge, …) — extend `ServiceBase` |
| `platform/` | Cross-tenant: provisioning, onboarding, marketplace, billing plans |
| `storage/` | Legacy adapter resolver (`memory` \| `firestore` \| `auto`) — **deprecated for new writes** |
| `events/` | Event bus, event store, analytics + automation handlers |
| `automation/` | Tenant workflow registry + engine (`workflowRegistry`, `automationEngine`) |
| `workflows/` | Visual workflow studio (in-memory demo store) — **legacy UI builder** |
| `integrations/` | Integration Hub, channel adapters, webhook router |
| `analytics/` | Aggregates, dashboard snapshots, tenant analytics |
| `ai/` | OpenAI facade (`aiService.js`) |
| `messaging/` | WhatsApp send/receive helpers |
| `payments/` | Billing records (no payment SDK wiring here) |
| `portal/` | Portal demo data + hub aggregation |
| `operations/` | Super Admin platform metrics |
| `sarah/` | Sarah orchestrator (tools in `sarah/tools/` — do not modify from architecture agent) |
| `api/` | Route catalog (`routeRegistry.js`) |

## Data access rules

1. **New tenant writes** → `services/tenants/*` → `ServiceBase` → `TenantRepository`
2. **Legacy reads/writes** → `storageAdapter` (`memoryAdapter` / `firestoreAdapter`) — flat root collections
3. **Dual-write during migration** → tenant service + legacy adapter (see `MIGRATION.md`)
4. **Never** query root `customers`, `agents`, or `knowledge` from tenant services without `companyId` filter

## Legacy modules (Phase 1 — deprecating)

| Module | Replacement | Notes |
|--------|-------------|-------|
| `customerService.js` | `tenants/crmService.js` | Webhook + CRM APIs still use legacy |
| `conversationService.js` | `tenants/conversationService.js` | WhatsApp pipeline uses legacy |
| `knowledgeService.js` | `tenants/knowledgeService.js` | Upload still writes flat `knowledge` in firestore mode |
| `memoryService.js` | `conversationService.js` | Re-export shim only |
| `aiService.js` (root) | `ai/aiService.js` | Re-export shim |
| `workflows/workflowService.js` | `automation/workflowRegistry.js` | Studio UI vs event automations |
| `storage/firestoreAdapter.js` | `TenantRepository` | Flat collections |

## Naming conventions

- **Tenant ID field:** always `companyId` (camelCase) — never `company_id`
- **Service files:** `*Service.js` in domain folder (`crmService.js`, not `crm.js`)
- **API paths:** `/api/{domain}/:companyId/...` for tenant routes where applicable
- **Event types:** PascalCase enum in `events/eventTypes.js` (`MessageReceived`, not `message_received`)
- **Collections:** constants in `database/schema.js` → `TENANT_COLLECTIONS`

## API routing

See `api/routeRegistry.js` and `docs/architecture/API.md`. All tenant routes use:

```javascript
app.use(attachTenantContext());
app.get("/api/portal/hub/:companyId", requireTenantScope(), handler);
```

Set `TENANT_SCOPE_ENFORCEMENT=strict` in production to require auth + membership.

## Migration

Run Phase 2 data migration:

```bash
node scripts/migrate-demo-to-tenants.js --dry-run
node scripts/migrate-demo-to-tenants.js --companyId=demo-central-motors
```

See `docs/architecture/MIGRATION.md` for full phase checklist.
