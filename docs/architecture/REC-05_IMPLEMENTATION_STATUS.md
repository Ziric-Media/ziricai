# REC-05 — Recommendation engine — implementation status

| Field | Value |
|-------|--------|
| **Status** | **MVP complete** |
| **Tests** | `test/rec-05-query-engine.test.mjs` |
| **API** | `POST /api/recommendations/v1/query` (consumer auth) |

## Delivered

- `eligibilityService.js` — sponsored gate chain
- `rankingService.js` — relevance-first v1 + sponsored cap
- `queryService.js` — organic (verified active offerings on public Discover) + sponsored (active campaigns)
- `attributionService.js` — `recommendation_request_received`, `candidate_eligible` / `candidate_excluded`

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `RECOMMENDATIONS_ENGINE_ENABLED` | `false` | Must be `true` for query API |
| `REC_MIN_SPONSORED_SCORE` | `60` | Sponsored relevance floor |
| `REC_SPONSORED_CAP` | `1` | Max sponsored in one response |
| `REC_ORGANIC_SPONSORED_GAP` | `15` | Organic may outrank weak sponsored |

## Next

- **REC-06** — Personal Sarah `querySarahRecommendations` tool + presentation metering (`REC-08`)
- **REC-07** — disclosure copy in client