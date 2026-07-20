# Firestore Query Performance

This document describes tenant-scoped query patterns, pagination, and index requirements for ZiricAI.

## Tenant path model

All tenant data lives under:

```
companies/{companyId}/<collection>/{docId}
```

The `TenantRepository` class (`services/database/tenantRepository.js`) enforces `companyId` on every operation. **Never query root-level legacy collections from tenant services.**

## Query patterns

### Standard list (paginated)

```javascript
// Cursor pagination (preferred for large tenants)
const { items, nextCursor, hasMore } = await repo.listPage(companyId, {
  max: 50,
  orderByField: "updatedAt",
  orderDirection: "desc",
  filters: { status: "active" },
  startAfterId: cursor,       // doc id from previous page
});

// Simple array (default max 50)
const items = await repo.list(companyId, { max: 50, filters: { status: "active" } });
```

- Path scoping (`companies/{companyId}/customers`) avoids cross-tenant reads.
- `filters` become Firestore `where` clauses; composite indexes may be required when combining filters + orderBy.
- Memory backend mirrors the same API for local dev (`STORAGE_BACKEND=memory`).

### Events log

Path: `companies/{companyId}/events/{eventId}`

```javascript
await listEvents(companyId, { limit: 50, cursor, type });
```

Indexes (collection group):

- `companyId ASC, timestamp DESC`
- `companyId ASC, type ASC, timestamp DESC`

**Event TTL:** 90 days (`EVENT_TTL_DAYS` in `eventStore.js`). Events include `expiresAt`; `listEvents()` filters expired records client-side. Firestore TTL policy can be added in Phase 4 for automatic purge.

**Rollup strategy:** Raw events → `analyticsEngine` batch flush → `analyticsDaily/{date}` aggregates (`ANALYTICS_BATCH_SIZE`, `ANALYTICS_FLUSH_MS`).

### Analytics aggregates

Path: `companies/{companyId}/analyticsDaily/{date}`

Batching via `aggregatesStore.js`:

- `ANALYTICS_BATCH_SIZE` (default 25) — flush after N events
- `ANALYTICS_FLUSH_MS` (default 30000) — periodic flush timer

### Automation runs

Path: `companies/{companyId}/automationRuns/{runId}`

Index: `companyId ASC, startedAt DESC`

## Index maintenance

Canonical definitions live in:

- `firestore.indexes.json` — deploy with Firebase CLI
- `services/database/schema.js` → `INDEX_DEFINITIONS` — code reference

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

## Collection group queries (superadmin cross-tenant)

Use collection group indexes with mandatory `companyId` filter — never unscoped collection-group scans.

| Collection group | Index fields | Use case |
|------------------|--------------|----------|
| `customers` | `companyId, lastSeen DESC` | Cross-tenant CRM dashboard |
| `customers` | `companyId, status, lastSeen DESC` | Filtered inbox |
| `conversations` | `companyId, updatedAt DESC` | Active conversations |
| `events` | `companyId, timestamp DESC` | Event audit log |
| `events` | `companyId, type, timestamp DESC` | Filtered events |
| `automationRuns` | `companyId, startedAt DESC` | Automation history |
| `appointments` | `companyId, status, scheduledAt ASC` | Calendar view |
| `documents` | `companyId, knowledgeBaseId, updatedAt DESC` | KB document list |

Deploy: `firebase deploy --only firestore:indexes`

## Anti-patterns (avoid)

| Pattern | Why |
|---------|-----|
| `collection("customers")` without company path | Cross-tenant data leak |
| Unbounded `getDocs` without `limit` | Cost + latency |
| Client-side filter of 1000+ docs | Use Firestore filters + indexes |
| Duplicate hub fetches per module | Use `dataService.prefetchHub()` (60s TTL) |

## Portal cache layers

| Layer | TTL | Scope |
|-------|-----|-------|
| `dataService.fetchCached` | 60s default | Per-endpoint key |
| `dataStore.hubData` | 60s | Hub snapshot |
| `lazyLoader` | Session | Module JS bundles |

## Server startup

Single bootstrap in `server.js`:

1. `initEventSystem()` — idempotent guard
2. `initIntegrationHub()` — idempotent guard
3. `getStorageAdapter()` — once per process
4. `startMessageWorker()` — registers queue handler once

## Related env vars

See `.env.example` for `STORAGE_BACKEND`, `ANALYTICS_BATCH_SIZE`, `ANALYTICS_FLUSH_MS`, `QUEUE_CONCURRENCY`.
