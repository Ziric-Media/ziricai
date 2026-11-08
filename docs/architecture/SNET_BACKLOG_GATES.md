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
| 2 | My Organisations backend (MVP) | planned | |
| 3 | Mission Control acceptance | planned | |
| 4 | Second network listing tenant | planned | |
| 5 | SNET crumbs (canManageNetwork, evidence tokens, search stats, subscriber events, block demo) | planned | |
