# SWI-01 — Sarah World Intelligence programme phases

**Parent:** [SWI-00](./SWI-00_SARAH_WORLD_INTELLIGENCE.md)

| Phase | ID | Deliverable | Depends on |
|-------|-----|-------------|------------|
| **M0** | `SWI-M0` | Pillars config, admission rules, in-memory store, News ingest hook (flagged), World Monitor tick stub, tests | SN-01 edition |
| **M1** | `SWI-M1` | Durable memory (Firestore), entity profiles, timeline API, Personal Sarah `recallWorldContext` tool | M0 |
| **M2** | `SWI-M2` | Graph edges, trend objects, corroboration policy | M1 |
| **M3** | `SWI-M3` | Intelligence Briefings generator + entitlements | M2, SN-04 |
| **M4** | `SWI-M4` | Business Intelligence SKUs, portal monitoring widgets | PAY / US-04 |

## M0 acceptance (this branch)

- [x] Architecture docs SWI-00 / SWI-01  
- [x] `sarahIntelligencePillars.js` — four pillars + seven domains  
- [x] `sarahIntelligenceMemoryAdmission.js` — gate before persist  
- [x] `sarahIntelligenceMemoryStore.js` — memory adapter (memory backend; pluggable)  
- [x] `sarahWorldMonitorService.js` — hybrid monitor config + no-op tick  
- [x] Optional edition → memory ingest when `SARAH_INTELLIGENCE_MEMORY_ENABLED=true`  
- [x] Unit test `swi-memory-admission.test.mjs`  

## M1 acceptance (this branch)

- [x] `sarahIntelligenceMemoryPersistence.js` — platform Firestore paths (observations, timeline, entities) when Admin + Firestore backend  
- [x] `sarahIntelligenceMemoryStore.js` — merge in-process cache with durable load/save on admit  
- [x] `sarahIntelligenceTimelineService.js` — version / headline change timeline  
- [x] `sarahIntelligenceEntityProfiles.js` — lightweight topic/region profiles from headlines  
- [x] `sarahIntelligenceRecallService.js` + `personalSarahIntelligenceTools.js` — `recallWorldContext` tool for Personal Sarah  
- [x] Unit test `swi-memory-admission.test.mjs` (store versions + recall when flagged)  

## M2 acceptance (this branch)

- [x] `sarahIntelligenceCorroborationPolicy.js` — trend promotion thresholds (allow-list publishers vs distinct count)  
- [x] `sarahIntelligenceGraphService.js` — region / industry → development edges on admit  
- [x] `sarahIntelligenceTrendService.js` — topic trend objects with corroboration tier + strength  
- [x] Firestore paths `graphEdges`, `trends` under platform `sarahWorldMemory`  
- [x] `recallWorldContext` includes trends + graph slice when graph flag on  
- [x] Unit test `swi-graph-trends.test.mjs`  

### M2 environment (default off until sign-off)

| Variable | Purpose |
|----------|---------|
| `SARAH_INTELLIGENCE_GRAPH_ENABLED` | `true` — build graph edges + trends on memory admit; enrich recall |
| `SARAH_INTELLIGENCE_TREND_MIN_ALLOWLIST` | Default `2` — distinct allow-list publishers for corroborated tier |
| `SARAH_INTELLIGENCE_TREND_MIN_PUBLISHERS` | Default `3` — distinct any publishers fallback |

### M0 environment (optional — default off in production)

| Variable | Purpose |
|----------|---------|
| `SARAH_INTELLIGENCE_MEMORY_ENABLED` | `true` — admit headlines from News edition compile into memory store |
| `SARAH_WORLD_MONITOR_ENABLED` | `true` — enable central monitor tick |
| `SARAH_WORLD_MONITOR_INTERVAL_MS` | e.g. `900000` (15 min) when monitor enabled |

## Stop points

- **After M0:** No user-visible “memory answers” until M1 retrieval tool is product-approved.  
- **After M1:** Pilot with Spencer on ZW mining + SA business queries only.  
- **M2 graph/trends:** Ship code on branch; enable `SARAH_INTELLIGENCE_GRAPH_ENABLED` on Railway only after Spencer sign-off.