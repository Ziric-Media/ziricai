# ZiricAI HTTP API Reference

**Version:** `1` (response header: `X-API-Version`)  
**Source of truth:** `services/api/routeRegistry.js`

## Middleware stack

Every request passes through:

1. `express.json()`
2. `attachTenantContext()` — sets `req.tenant` from path/query/body/`X-Company-Id`
3. `applyApiVersionHeader()` — sets `X-API-Version: 1` on `/api/*` responses

Tenant routes add `requireTenantScope()`:

| Mode | Env | Behavior |
|------|-----|----------|
| Lax (default) | `TENANT_SCOPE_ENFORCEMENT=lax` | Requires `companyId` only |
| Strict | `TENANT_SCOPE_ENFORCEMENT=strict` | Requires Firebase token + membership match |

Pass tenant scope via:

- Path: `/api/portal/hub/:companyId`
- Query: `?companyId=demo-central-motors`
- Body: `{ "companyId": "..." }`
- Header: `X-Company-Id: demo-central-motors`

## Route domains

### Platform & health

| Method | Path | Tenant | Description |
|--------|------|--------|-------------|
| GET | `/api/health` | No | Health + storage backend |
| GET | `/api/admin/config` | No | Masked config snapshot |
| POST | `/api/platform/provision/company` | No | Create tenant workspace |
| POST | `/api/platform/provision/agent` | No | Provision AI employee |
| GET | `/api/platform/companies/:companyId/links` | No | Admin nav links |

### Portal (`/api/portal/:resource/:companyId`)

All routes require `requireTenantScope()`.

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/portal/company/:companyId` | Company profile + branding |
| GET | `/api/portal/team/:companyId` | Team roster |
| GET | `/api/portal/notifications/:companyId` | Notifications |
| GET | `/api/portal/activity/:companyId` | Activity feed |
| GET | `/api/portal/usage/:companyId` | Usage metrics |
| GET | `/api/portal/dashboard/:companyId` | Dashboard snapshot |
| GET | `/api/portal/hub/:companyId` | Unified BOS hub |
| GET | `/api/portal/analytics/:companyId` | Analytics snapshot |

### Analytics (`/api/analytics/.../:companyId`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/dashboard/:companyId` | BI dashboard |
| GET | `/api/analytics/events/:companyId` | Paginated events (`limit`, `cursor`, `type`) |
| GET | `/api/analytics/popular-questions/:companyId` | Popular KB questions |

### Automations vs Workflows

Two systems coexist during migration:

| System | Base path | Storage | Purpose |
|--------|-----------|---------|---------|
| **Automations** | `/api/automations/:companyId` | `TenantRepository` → `automations` | Event-driven workflows |
| **Workflow Studio** | `/api/workflows` | In-memory `workflowService` | Visual builder UI (demo) |

Prefer `/api/automations/:companyId` for new integrations.

### CRM & conversations (legacy adapter — Phase 2)

These routes use `requireTenantScope({ optional: true })` and read legacy flat collections via `storageAdapter`:

| Method | Path | Migration target |
|--------|------|------------------|
| GET | `/api/customers?companyId=` | `companies/{id}/customers` |
| GET/PATCH | `/api/customers/:phone` | tenant customers |
| GET | `/api/conversations?companyId=` | tenant conversations |
| GET | `/api/knowledge?companyId=` | tenant documents |

Run `node scripts/migrate-demo-to-tenants.js` before cutover.

### Integrations & webhooks

| Method | Path | Tenant middleware |
|--------|------|-------------------|
| GET/POST | `/webhook` | None (legacy WhatsApp) |
| GET/POST | `/webhooks/:channel[/:companyId]` | None |
| GET | `/api/integrations/health` | None |

### Sarah, marketplace, onboarding, billing

See `ROUTE_CATALOG` in `services/api/routeRegistry.js` for the full list.

## Pagination

Tenant list endpoints accept:

```
?limit=50&cursor=<docId>
```

Server-side: `TenantRepository.list(companyId, { max, startAfterId, orderByField })`.

Event log: `/api/analytics/events/:companyId?limit=50&cursor=evt-...`

## Legacy route audit

Routes still hitting flat root collections (Phase 2 targets):

- `/api/customers`, `/api/conversations`, `/api/knowledge`
- `/webhook` (WhatsApp → `firestoreAdapter`)

Tracked in `routeRegistry.LEGACY_ROUTE_PATHS`.
