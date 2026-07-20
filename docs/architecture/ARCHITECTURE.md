# ZiricAI Multi-Tenant Architecture

ZiricAI is evolving into a multi-tenant AI Business Operating System. Each **company workspace** is an isolated tenant under `companies/{companyId}` with dedicated subcollections for users, AI employees, CRM, conversations, automations, billing, and more.

## System Diagram

```mermaid
flowchart TB
    subgraph Clients
        SA[Super Admin Console]
        CP[Company Portal]
        OB[Onboarding Wizard]
        WA[WhatsApp / Meta Webhook]
    end

    subgraph API["Express API (server.js)"]
        MW[attachTenantContext / requireTenantScope]
        WH[/webhook]
        APIRoutes[/api/* tenant routes]
    end

    subgraph Core["Core Layer"]
        TC[tenantContext.js]
        SB[serviceBase.js]
        AS[authService.js]
    end

    subgraph Tenants["Tenant Services"]
        CS[companyService]
        US[userService]
        AE[aiEmployeeService]
        CRM[crmService]
        CONV[conversationService]
        KB[knowledgeService]
        AUTO[automationService]
    end

    subgraph Data["Data Layer"]
        TR[tenantRepository]
        FC[firestoreClient]
        AD[(storageAdapter)]
        MEM[(memoryAdapter)]
        FS[(Firestore)]
    end

    subgraph External
        OAI[OpenAI]
        META[WhatsApp Graph API]
        FBA[Firebase Auth]
    end

    SA --> MW
    CP --> MW
    OB --> MW
    WA --> WH
    MW --> TC
    TC --> AS
    AS --> FBA
    MW --> APIRoutes
    WH --> CONV
    APIRoutes --> Tenants
    Tenants --> SB
    SB --> TR
    TR --> FC
    TR --> AD
    AD --> MEM
    AD --> FS
    FC --> FS
    CONV --> AD
    CRM --> AD
    AE --> OAI
    WH --> META
```

## Folder Structure

See also `services/README.md` for layer responsibilities.

```
services/
  README.md              # Layer guide + naming conventions
  api/
    routeRegistry.js       # Canonical route catalog + API version header
  core/
    tenantContext.js       # Resolve companyId, enforce tenant scope
    serviceBase.js         # Base class with scoped collection paths + listPage()
  auth/
    authService.js         # Server-side token verification + profile lookup
  database/
    firestoreClient.js     # Single Firestore init
    schema.js              # Collection names, field definitions, INDEX_DEFINITIONS
    tenantRepository.js    # Generic tenant-scoped CRUD + cursor pagination
  storage/
    storageAdapter.js      # memory | firestore | auto resolver
    firestoreAdapter.js    # @deprecated Legacy flat collections
    memoryAdapter.js       # Dev in-memory store
  events/
    eventBus.js, eventStore.js, eventTypes.js, handlers
  automation/
    workflowRegistry.js    # Tenant automations (TenantRepository)
    automationEngine.js    # Event-driven execution
  workflows/
    workflowService.js       # @deprecated Visual studio in-memory store
  messaging/
    messagingService.js    # WhatsApp + notifications
  ai/
    aiService.js           # OpenAI facade (canonical)
  aiService.js             # Re-export shim → ai/aiService.js
  payments/
    billingService.js      # Plans + tenant billing records
  analytics/
    analyticsService.js, tenantAnalyticsService.js, dashboardService.js
  tenants/                 # All extend ServiceBase → TenantRepository
    companyService.js, userService.js, crmService.js, …
  platform/                # Cross-tenant operations
    provisioningService.js, onboardingService.js, industryPackService.js
  integrations/            # Integration Hub + channel adapters
  portal/                  # Portal demo + hub aggregation
  operations/              # Super Admin metrics
  sarah/                   # Sarah orchestrator (tools/ owned by Agent 04)

scripts/
  migrate-demo-to-tenants.js   # Phase 2 legacy → tenant migration
```

## Naming Conventions

| Area | Convention | Example |
|------|------------|---------|
| Tenant ID field | `companyId` (camelCase) | `{ companyId: "demo-central-motors" }` |
| Service files | `*Service.js` | `crmService.js`, `appointmentService.js` |
| Tenant collections | Constants in `schema.js` | `TENANT_COLLECTIONS.CUSTOMERS` |
| API tenant routes | `/api/{domain}/:companyId/...` | `/api/portal/hub/:companyId` |
| Event types | PascalCase enum | `EventTypes.MESSAGE_RECEIVED` |
| Legacy collections | `LEGACY_COLLECTIONS.*` | Do not use in new tenant services |

## API Organization

- Route catalog: `services/api/routeRegistry.js`
- Documentation: [API.md](./API.md)
- Version header: `X-API-Version: 1` on all `/api/*` responses
- Middleware: `attachTenantContext()` globally; `requireTenantScope()` on tenant routes

## Request Flow

1. Client sends request with `companyId` in path, query, body, or `X-Company-Id` header.
2. `attachTenantContext()` attaches `req.tenant` on every request.
3. Tenant routes use `requireTenantScope()` — validates `companyId` presence; in `strict` mode also verifies Firebase token + membership.
4. Tenant services call `TenantRepository` which writes to:
   - **Memory maps** when `STORAGE_BACKEND=memory`
   - **Firestore subcollections** when using Firestore
5. Legacy adapters continue serving existing webhook/CRM flows during migration.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `STORAGE_BACKEND` | `auto` | `memory`, `firestore`, or `auto` |
| `TENANT_SCOPE_ENFORCEMENT` | `lax` | `lax` (companyId only) or `strict` (auth + membership) |
| `DEFAULT_COMPANY_ID` | — | Default tenant for WhatsApp webhook |
| `FIREBASE_API_KEY` | from firebase config | Server token verification |

## Design Principles

- **Incremental migration** — dual-write to legacy adapter + tenant paths
- **Adapter pattern** — swap storage without rewriting business logic
- **Path-enforced isolation** — all tenant data under `companies/{companyId}/`
- **Backward compatible APIs** — existing routes unchanged; middleware added

See also: [FIRESTORE_SCHEMA.md](./FIRESTORE_SCHEMA.md), [MIGRATION.md](./MIGRATION.md), [API.md](./API.md), [PERFORMANCE.md](./PERFORMANCE.md)
