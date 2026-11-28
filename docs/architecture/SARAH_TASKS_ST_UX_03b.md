# ST-UX-03b — Sarah Network org bridge

**Status:** v1 shipped

## API

- `GET /api/personal-sarah/tasks/network-search?q=` — consumer-scoped directory match
- Workspace payload includes `networkMatch` (top 4 hits from Discover search)

## Client

- Application forms: **organisation** fields show Network typeahead (`sarah-task-network.mjs`)
- Selected match stores `meta.networkCompanyId` / `meta.networkSnId`
- Task workspace **Details → Sarah Network** lists matches; opens Discover profile

## Data source

Discover ranked search (`businessDirectoryService.searchDiscoverCompanies`) — not a separate gov API.

## Not in v1

- Auto-chat with business Sarah for the org
- Government programme live status API
- Persisted org link beyond task `meta`