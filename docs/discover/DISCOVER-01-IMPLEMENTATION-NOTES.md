# DISCOVER-01 — Functional company search (prototype slice)

**Date:** 2026-11-08  
**Scope:** `prototype/sarah-app-ux/` → mirrored to `users/` via `npm run prepare:users`  
**Module:** U6 Discover (prototype shell; not full Discover Engine)

## Current state (audit)

| Area | Finding |
|------|---------|
| **Routes** | `discover`, `discover-company` / hash `discover/{companyId}` in `js/app.js` |
| **UI** | Category chips + card grid + company detail; no search input wired before DISCOVER-01 |
| **Data** | `MOCK_DISCOVER_COMPANIES` + `MOCK_DISCOVER_CATEGORIES` in `js/mock-data.js` (8 listings after this pass) |
| **Live bridge** | `js/live-bridge.mjs` — Personal Sarah / U1 only; **no Discover list fetch** |
| **API** | `GET /api/discover/companies` in `services/api/userConversationRoutes.js` — **pilot list** (SmileMore / env pilots), minimal fields; not card-complete |

## What was wired (DISCOVER-01)

1. **Search bar** on Discover (existing `search-bar search-bar--icon` pattern) — `id="discoverSearchInput"`.
2. **Client-side filter** — name, `categoryLabel`, `description`, `address`, `categories`, `tags`, product names/descriptions.
3. **Light keyword expansion** — e.g. `dentist` → dental/smile; `plumber` → pipe/drain; `restaurant` / `cafe` → dining/coffee terms (`DISCOVER_NL_KEYWORDS` in `app.js`).
4. **Category + search** — both apply (AND).
5. **Debounced input** (~180ms) on Discover; immediate on clear (`search` event).
6. **Empty states** — reuses `.feed-empty-search` when no matches.
7. **My Organisations** — Enter in org search copies query onto Discover and navigates there.
8. **Mock enrichment** — `tags` on listings; **QuickFix Plumbing**, **Neon Stone Bistro** for plumber/restaurant demos.

No layout/visual redesign beyond placing the existing search control in `discover-search-wrap`.

## How search works

```
discoverSearchInput → debounce → discoverSearchQuery
  → filterDiscoverListings(source, activeDiscoverCategory, query)
  → render discover-card grid | empty message
```

Source: `discoverCompaniesSource()` → `MOCK_DISCOVER_COMPANIES` (documented hook for D3 API merge).

## Sample queries

| Query | Expected matches |
|-------|------------------|
| `green` | Green Haven Cafe, GreenLeaf Spa |
| `dentist` | SmileMore Dental |
| `plumber` | QuickFix Plumbing |
| `restaurant` | Neon Stone Bistro, Green Haven Cafe |
| `coffee` / `cafe` | Green Haven Cafe |
| `gym` / `yoga` | Pulse Fitness Studio |
| `car` | Central Motors |
| `rosebank` | Green Haven, Pulse, GreenLeaf, Neon Stone (address) |
| `zzznomatch` | Empty state |

## API gaps (D0 / D3)

- **No query param** on `GET /api/discover/companies`; response lacks images, ratings, products, hours required by cards.
- **Auth required** (`requireConsumerScope`) — prototype works offline/mock without sign-in.
- **Recommendation:** D2 define listing DTO aligned with cards; D3 wire `discoverCompaniesSource()` to fetch + fallback mock; search server-side when index exists (Typesense/Algolia per architecture docs).

## Locked decisions (from blueprint — recommended)

Align with [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](../architecture/SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md) unless product overrides:

1. **Businesses + services first** — directory is profile-centric; products/services on company profile, searchable via listing haystack.
2. **Sponsored (RS04)** — balanced slots: organic relevance first, capped sponsored injection (not implemented in prototype).
3. **Sarah entry** — both **Ask Sarah** (Discover / My Sarah) and **company profile → Connect Company Sarah** (existing prototype paths).

## Next phases

| Phase | Focus |
|-------|--------|
| **D2** | Listing schema, industry presets from library (not hardcoded chips), optional map/list |
| **D3** | API-backed list + search; merge pilot companies with tenant directory |
| **D4+** | Sponsored merge, infinite scroll, Sarah Network cross-links |

## Deploy / cache

- Service worker: `sarah-app-static-v16` in `js/users/sw.js` (copied to `users/sw.js` on prepare).
