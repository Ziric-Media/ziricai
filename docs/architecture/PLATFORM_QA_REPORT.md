# Platform QA Report — July 2026

Final integration and quality assurance pass across ZiricAI platform surfaces.

**Date:** 2026-07-19  
**Server verified:** `node server.js` starts without SyntaxError  
**Smoke tests:** `/api/health`, `/api/portal/hub/:companyId`, `/api/marketplace/catalog`, `/api/integrations/health`

---

## 1. Module communication

### Webhook → analytics/automation pipeline

Verified end-to-end chain:

```
Meta POST /webhook
  → integrationHub.handleLegacyWhatsAppWebhook
  → whatsappAdapter.receiveMessage
  → conversationPipeline.ingest
  → jobQueue.enqueue(PROCESS_INBOUND_MESSAGE)
  → messageWorker.processInboundMessage
  → publish(MESSAGE_RECEIVED | CONVERSATION_STARTED | LEAD_CAPTURED)
  → eventBus → analyticsEventHandler + automationEventHandler
```

**Status:** ✅ Connected; event handlers registered at startup.

### Portal hub → modules

- `dataService.prefetchHub()` loads unified snapshot (60s TTL).
- Dashboard, notifications, conversations modules use `dataService` cache.
- `js/portal/api.js` now re-exports cached hub/team/activity helpers from `dataService`.

**Status:** ✅ Fixed duplicate fetch pattern; hub deduplication confirmed.

### Marketplace install → portal

- `POST /api/marketplace/install` → `runInstallWizard` → provisioning service.
- Portal marketplace module reads `GET /api/marketplace/installed/:companyId`.
- Tenant scope added to install route.

**Status:** ✅ Verified API chain; install route scoped.

### Sarah tools → tenant services

- `POST /api/sarah/chat` and `GET /api/sarah/tools` wired to orchestrator + tool registry.
- Portal Sarah UI invalidates hub cache after tool actions.

**Status:** ✅ Routes present; optional tenant scope for demo mode.

---

## 2. Duplicate code removed / consolidated

| Change | Files |
|--------|-------|
| Shared HTTP client | `js/shared/apiRequest.js` — used by portal + admin API clients |
| Portal API facade | `js/portal/api.js` delegates hub/team/activity to `dataService` |
| Broken AI fragment | `services/aiService.js` → proper re-export of `services/ai/aiService.js` |
| Automation service | `services/tenants/automationService.js` uses `workflowRegistry` (not legacy workflowService) |

**Not removed (safe deferral):**

- `routes/webhook.js` — empty stub, unused (server uses integrationHub directly)
- Duplicate `services/whatsapp.js` path entries (Windows path casing only)
- Legacy `services/workflows/workflowService.js` — still used by Super Admin automation studio

---

## 3. Naming conventions

- **`companyId`:** No `company_id` snake_case in new services code (grep clean).
- **Service files:** Tenant layer uses `*Service.js` pattern under `services/tenants/`.
- **API routes:** Tenant resources follow `/api/{domain}/{resource}/:companyId` (portal, analytics, automations, marketplace installed).

**Remaining inconsistency:** Legacy routes `/api/customers`, `/api/workflows` use query param `?companyId=` — kept for backward compatibility with admin inbox.

---

## 4. Firestore queries & indexes

- `TenantRepository` enforces scoped paths; pagination via `max` + `orderBy`.
- Added composite indexes for collection-group admin queries (customers+status, tasks, notifications, leads, aiEmployees).
- Documented patterns in `docs/architecture/PERFORMANCE.md`.

---

## 5. Security rules & tenant scope

### Firestore rules

Added tenant isolation for:

- `events/{eventId}` — read tenant, write superadmin
- `automationRuns/{runId}` — read tenant, write superadmin
- `analyticsDaily`, `analyticsHourly`, `analyticsMetrics`
- `marketplace/installed/{packId}`

### API tenant scope (`requireTenantScope`)

Added to previously unscoped routes:

- Customer detail/PATCH/timeline
- Conversation messages
- Workflow CRUD/mutations
- Marketplace install

Documented `TENANT_SCOPE_ENFORCEMENT` in `.env.example` (`lax` | `strict`).

**Still optional scope (by design for dev/demo):**

- `/api/operations/*` — platform superadmin
- `/api/platform/provision/*` — should be network-restricted in prod
- `/api/onboarding/*` — public wizard entry

---

## 6. Performance improvements

| Item | Status |
|------|--------|
| Portal hub cache (60s TTL) | ✅ |
| Module lazy loading | ✅ `lazyLoader.js` |
| Event batching | ✅ `ANALYTICS_BATCH_SIZE` / `ANALYTICS_FLUSH_MS` |
| Single startup init | ✅ Idempotent guards on event system + integration hub |
| Static asset caching | ✅ Added for `NODE_ENV=production` |

---

## 7. Surfaces verified

| Surface | Entry | Status |
|---------|-------|--------|
| Super Admin | `ziric-superadmin-console.html` | ✅ API routes respond |
| Company Portal | `company-portal.html` | ✅ Hub + lazy modules |
| Landing | `ziricai.html` | ✅ Static served |
| Onboarding | `onboarding.html` | ✅ `/api/onboarding/industries` |
| Sarah AI | Portal sidebar + `/api/sarah/*` | ✅ |
| Integration Hub | `/webhooks/:channel`, `/api/integrations/*` | ✅ |
| Marketplace | `/api/marketplace/*` | ✅ 21 packs in catalog |
| Analytics & Automation | Event bus + `/api/analytics/*`, `/api/automations/*` | ✅ |
| WhatsApp webhook | `GET/POST /webhook` | ✅ Legacy path preserved |

---

## 8. Critical fixes applied

1. **`services/aiService.js`** — was invalid top-level fragment; replaced with facade re-export (prevented future import SyntaxError).
2. **Tenant scope gaps** — workflow, customer, marketplace install routes now scoped.
3. **Firestore rules gaps** — events, automationRuns, marketplace subcollections protected.
4. **API client duplication** — shared `apiRequest.js` for portal + admin.
5. **Automation tenant service** — aligned with `workflowRegistry` used by automation engine.

---

## 9. Known gaps (honest)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| Platform provisioning routes unauthenticated | High in prod | Add superadmin auth or IP allowlist |
| Legacy `/api/customers` root storage | Medium | Complete Firestore migration per MIGRATION.md |
| `routes/webhook.js` empty stub | Low | Delete when confirmed unused |
| No automated test suite | Medium | Add integration tests for webhook pipeline |
| Firebase auth not enforced server-side in `lax` mode | High in prod | Set `TENANT_SCOPE_ENFORCEMENT=strict` |
| Meta webhook signature verification | Medium | Enable in whatsappAdapter for production |
| PM2 / clustering not configured | Low | Use PM2 or container orchestration |

---

## 10. Test commands

```bash
# Start server
npm run dev

# Health
node -e "fetch('http://localhost:3000/api/health').then(r=>r.json()).then(console.log)"

# Portal hub
node -e "fetch('http://localhost:3000/api/portal/hub/demo-central-motors').then(r=>r.json()).then(d=>console.log(Object.keys(d)))"

# Marketplace
node -e "fetch('http://localhost:3000/api/marketplace/catalog').then(r=>r.json()).then(d=>console.log('packs',d.packs?.length))"

# Integrations
node -e "fetch('http://localhost:3000/api/integrations/health').then(r=>r.json()).then(console.log)"

# Onboarding
node -e "fetch('http://localhost:3000/api/onboarding/industries').then(r=>r.json()).then(d=>console.log('industries',d.industries?.length))"
```

---

## Related docs

- [Production checklist](../deployment/PRODUCTION_CHECKLIST.md)
- [Performance guide](./PERFORMANCE.md)
- [Architecture overview](./ARCHITECTURE.md)
