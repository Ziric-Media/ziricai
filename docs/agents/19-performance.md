# 19 — Performance Agent

## Agent Name & Role

Owns query optimization, caching strategy, lazy loading, indexes, and performance documentation.

## Phase

**Phase 19 — Production**

## Responsibility

- Firestore query patterns and index maintenance
- TenantRepository pagination caps
- Portal lazy module loading and prefetch strategy
- Hub cache TTL tuning (`dataService`)
- Analytics batch flush tuning
- Queue concurrency settings
- Static asset caching in production (`server.js`)
- Performance benchmarks and profiling

## Owns

- `docs/architecture/PERFORMANCE.md`
- `firestore.indexes.json`
- `services/database/tenantRepository.js` (query patterns)
- `js/portal/core/lazyLoader.js`
- `js/portal/core/dataService.js` (cache TTL)
- `services/analytics/aggregatesStore.js` (batch settings)
- `services/queue/jobQueue.js` (concurrency)
- `server.js` (static cache middleware only)

## Depends on

- **01 Platform Architecture Agent** — repository and schema
- **17 Dashboard Agent** — hub load patterns
- **08 Conversations Agent** — queue/worker throughput

## Do NOT touch

- Feature business logic in tenant services
- UI visual design / CSS theming
- QA test cases (QA Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Performance Agent. Own indexes, caching, lazy loading, and perf docs.

Read docs/architecture/PERFORMANCE.md and firestore.indexes.json.
Audit tenantRepository.list(), portal lazyLoader prefetchModules(), dataService hub TTL.

Tasks:
1. Run index gap analysis: compare schema.js queries vs firestore.indexes.json entries.
2. Add missing composite indexes and document in PERFORMANCE.md.
3. Benchmark hub prefetch cold vs warm cache; tune TTL if needed.
4. Ensure all list() calls cap max results (default 50) to prevent unbounded reads.
5. Document QUEUE_CONCURRENCY, ANALYTICS_BATCH_SIZE, ANALYTICS_FLUSH_MS tuning guide.

Do NOT add new product features or change auth rules.
Return: index gaps fixed, cache benchmarks, recommended env values for production.
```

## Definition of Done

- [ ] All tenant list queries have matching Firestore indexes
- [ ] PERFORMANCE.md reflects actual codebase patterns
- [ ] Portal modules lazy-load with prefetch for critical paths
- [ ] Hub cache TTL documented with measurement
- [ ] Production static asset caching enabled via NODE_ENV
- [ ] No unbounded Firestore reads in hot paths

## Current status

**40% — Partial**

### Already built

- PERFORMANCE.md with query patterns, pagination, batch settings
- firestore.indexes.json with 9+ composite indexes
- Portal lazyLoader with module cache and prefetch
- Hub 60s TTL in dataService
- Analytics batch flush env vars
- Production static cache middleware in server.js

### Remaining work

- **No automated perf tests** or benchmarks in repo
- Index coverage not validated against all filter+orderBy combos
- No CDN/caching layer documented for static HTML
- Message worker concurrency defaults to **1** — not load-tested
- No Firestore read/write monitoring integration
