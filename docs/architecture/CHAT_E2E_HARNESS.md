# CHAT-01 — App↔Portal E2E harness (MVP)

**Status:** Documented harness; manual + API-level regression via `npm run test:sarah-chat-ch2-ch9`.

## Automated (Node)

| Suite | Coverage |
|-------|----------|
| `ch1`–`ch8` | Foundation, P2P, groups, index, network, handover, work links |
| `ch9-chat-acceptance.test.mjs` | §17 essential scenarios (API-level) |
| `ch10-chat-ux-handover.test.mjs` | UX prefs/search/media, portal handover meta, org groups, CH8 links |

## Manual smoke (production)

1. **Sarah App** — Sign in → Chats → open business / P2P / group / network thread → send (where allowed).
2. **Portal** — Sales → Sarah Inbox → assign → accept → transfer / escalate → return to Sarah → summary panel.
3. **Mirror** — Portal human reply appears in consumer business thread.

## Playwright (future)

Add `scripts/e2e/chat-app-portal.spec.mjs` when CI secrets for Firebase test users are available.
