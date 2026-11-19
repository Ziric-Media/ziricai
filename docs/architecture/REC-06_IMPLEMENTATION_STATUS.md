# REC-06 — Personal Sarah integration — implementation status

| Field | Value |
|-------|--------|
| **Status** | **MVP complete** |
| **Tests** | `test/rec-06-personal-sarah-recommendations.test.mjs` |

## Delivered

- Tools: `querySarahRecommendations`, `recordSponsoredRecommendationPresented`
- `personalSarahContext.js` — disclosure + relevance rules
- Orchestrator passes `sessionId` into tool opts for conversation attribution
- `POST /api/recommendations/v1/presentations` (consumer)
- `presentationService.js` — idempotent allowance debit (REC-08 partial)

## Production

Set `RECOMMENDATIONS_ENGINE_ENABLED=true` on Railway for Personal Sarah to use recommendation tools.

## Next

- REC-07 client disclosure polish in Sarah PWA
- REC-09 billing before non-pilot activation