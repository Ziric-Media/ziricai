# Multi-Tenant Migration Strategy

Incremental migration from flat collections + in-memory dev store to fully tenant-scoped Firestore.

## Phase 1 — Foundation + Dual-Write (Current)

**Status: Implemented**

- New `services/core`, `services/database`, `services/tenants` layer
- `TenantRepository` writes to memory maps OR Firestore subcollections
- `provisioningService` dual-writes via `companyService`, `aiEmployeeService`, `crmService`
- Legacy `storageAdapter` (memory + firestore flat collections) unchanged
- `requireTenantScope` middleware on key API routes (lax mode by default)
- Firestore rules updated for tenant isolation + legacy superadmin-only paths
- API route catalog in `services/api/routeRegistry.js` + `docs/architecture/API.md`

### What still uses legacy paths

- WhatsApp webhook → `conversationService` → flat `customers/{phone}`
- CRM customer list/detail APIs → `customerService` → `storageAdapter`
- Knowledge upload (Firestore `knowledge` collection when not in memory mode)
- Workflow studio UI → `workflows/workflowService` (in-memory; not tenant `automations`)

### Dev mode unchanged

```bash
STORAGE_BACKEND=memory npm run dev
```

All tenant services work against in-memory `TenantRepository` maps.

## Phase 2 — Data Migration Scripts

**Status: Partial — primary script implemented**

1. **`scripts/migrate-demo-to-tenants.js`** ✅
   - Read flat `customers`, `agents`, `knowledge` collections
   - Write to `companies/{companyId}/<subcollection>` preserving IDs
   - Tag migrated docs with `migratedAt`, `legacyId`, `legacyPath`
   - Run: `npm run migrate:tenants:dry` then `npm run migrate:tenants`

2. **`scripts/migrate-memory-seed.js`** ⬜ Planned
   - Export memory adapter state on shutdown (optional JSON dump)
   - Import into tenant subcollections for dev → staging promotion

3. **Dual-read fallback** ✅ Partial
   - Tenant services try new path first, fall back to legacy adapter
   - Implemented in `crmService.listTenantCustomers`, `aiEmployeeService`, `knowledgeService`

### Migration checklist per entity

| Entity | Legacy Path | Target Path | Script | Status |
|--------|-------------|-------------|--------|--------|
| Company | memory `portalCompanies` | `companies/{id}` | `provisionCompany` | ✅ |
| Agent | root `agents` | `companies/{id}/aiEmployees` | `migrate-demo-to-tenants.js` | ✅ |
| Customer | root `customers/{phone}` | `companies/{id}/customers/{phone}` | `migrate-demo-to-tenants.js` | ✅ |
| Knowledge | root `knowledge` | `companies/{id}/documents` | `migrate-demo-to-tenants.js` | ✅ |
| Workflows | in-memory `workflowService` | `companies/{id}/automations` | manual / Agent 10 | ⬜ |

## Phase 3 — Auth + Strict Tenant Enforcement

**Planned**

1. On onboarding completion, create:
   - Global `users/{uid}` profile with `companyId`
   - Tenant `companies/{companyId}/users/{uid}` membership doc

2. Enable strict mode in production:
   ```bash
   TENANT_SCOPE_ENFORCEMENT=strict
   ```

3. Client portals send `Authorization: Bearer <firebase-id-token>` on API calls

4. `authService.verifyIdToken` validates token; `tenantContext` checks membership

5. Deprecate root-level Firestore rules (remove legacy match blocks)

## Phase 4 — Cutover

1. Switch `STORAGE_BACKEND=firestore` in production
2. Update webhook + CRM routes to use tenant services exclusively
3. Remove legacy flat collection writes
4. Enable collection group queries for superadmin cross-tenant dashboards

## Backward Compatibility Guarantees

- All existing API routes remain functional
- Webhook `/webhook` unchanged (no tenant middleware)
- Super Admin `/api/operations/*` unchanged (platform scope)
- Onboarding `/api/onboarding/*` unchanged
- Marketplace catalog global; install requires `companyId`
- Demo data seed (`seedDemoCustomersIfEmpty`) unchanged

## Rollback Plan

- Set `STORAGE_BACKEND=memory` to revert to in-memory dev
- Set `TENANT_SCOPE_ENFORCEMENT=lax` to disable auth checks
- Legacy adapter paths remain until Phase 4 explicit removal

## Deploy Steps

```bash
# Deploy rules + indexes
firebase deploy --only firestore:rules,firestore:indexes

# Dry-run migration
npm run migrate:tenants:dry

# Live migration (set DEFAULT_COMPANY_ID or --companyId=)
npm run migrate:tenants

# Verify health
curl http://localhost:3000/api/health

# Provision test tenant
curl -X POST http://localhost:3000/api/platform/provision/company \
  -H "Content-Type: application/json" \
  -d '{"companyId":"test-tenant","name":"Test Co","plan":"starter"}'
```
