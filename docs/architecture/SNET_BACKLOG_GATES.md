---
Status: Living document (updated per gate commit)
Related:
  - [SNET_PROGRAMME_MILESTONES.md](./SNET_PROGRAMME_MILESTONES.md)
  - [SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md)
Branch: `programme/sarah-u1-u5-r0`
---

# Sarah Network — Backlog Gates

Ordered follow-up gates after SNET-01..12. One commit per gate: `feat(snet): gate N <title>`.
Status: `done` · `partial` · `skipped` (reason given) · `planned`.

| Gate | Title | Status | Notes |
|------|-------|--------|-------|
| 1 | Prod chat durability | **done** | Production already has `USER_CONVERSATIONS_BACKEND=dual` + `STORAGE_BACKEND=firestore` (verified via `railway variables`; nothing to set). Runbook: [SARAH_CHAT_FIRESTORE_PRODUCTION.md](../deployment/SARAH_CHAT_FIRESTORE_PRODUCTION.md). Code: index hydration now also rebuilds **P2P and group threads** (creator via `userId`, other members via `participantPersonIds array-contains`), P2P/group display fields (`title`, `peerPersonId`, …) and **message attachments** are persisted/read, P2P/group routes hydrate before read/send. Test: `test/gate1-chat-durability.test.mjs` (fake store); `ch4-chat-index` is memory-only (no local-file expectation). Residual: threads written before this gate lack `participantPersonIds` (creator-only until next write); block lists / prefs not mirrored; real Firestore restart slice only runs with Admin credentials. |
| 2 | My Organisations backend (MVP) | **done (MVP)** | `SARAH_APP_SUB01_MY_ORGANISATIONS_FUNCTIONAL_SPEC.md` is referenced by the portal audit but **does not exist in the repo**, so the MVP follows SNET-01 §9 / SNET-00 (My Organisations = SNET-07 relationships by `snId`). New: `services/network/myOrganisationsService.js`; `GET /api/network/v1/my-organisations` (relationships joined to public directory cards, grouped: subscriptions / connections / pending / following / blocked / unavailable; business-side block masked; suspended/unlisted orgs shown without profile but still unfollow-able; `discovered` rows are not listed) and `PUT /api/network/v1/my-organisations/:snId/preferences` (notifications / announcements / reminders booleans stored on the relationship doc, default on, require an existing non-blocked relationship). Sarah App (prototype → `users/` via `prepare:users`): live mode renders My Organisations from the API (sections, View, Unsubscribe/Unfollow, Manage → preference checkboxes); fixtures/localStorage path unchanged when live mode is off. Tests: `test/gate2-my-organisations.test.mjs` (service, privacy, routes, route catalog, app wiring). Gaps: prefs are stored but **nothing is delivered yet** (no notification fan-out — see Gate 5 event log); prototype-only account/reference/verification fields (SUB-01B) are not persisted for live orgs; UI not exercised in a real browser in this run. |
| 3 | Mission Control acceptance | planned | |
| 4 | Second network listing tenant | planned | |
| 5 | SNET crumbs (canManageNetwork, evidence tokens, search stats, subscriber events, block demo) | planned | |
