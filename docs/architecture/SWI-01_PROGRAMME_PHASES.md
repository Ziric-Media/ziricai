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

### M0 environment (optional — default off in production)

| Variable | Purpose |
|----------|---------|
| `SARAH_INTELLIGENCE_MEMORY_ENABLED` | `true` — admit headlines from News edition compile into memory store |
| `SARAH_WORLD_MONITOR_ENABLED` | `true` — enable central monitor tick |
| `SARAH_WORLD_MONITOR_INTERVAL_MS` | e.g. `900000` (15 min) when monitor enabled |

## Stop points

- **After M0:** No user-visible “memory answers” until M1 retrieval tool is product-approved.  
- **After M1:** Pilot with Spencer on ZW mining + SA business queries only.  
- **No graph in production** until M2 audit sign-off.