# Sarah App chat durability — Railway production

Consumer chat (company, network, person-to-person and group threads) lives in process caches that **mirror** to
Firestore `userConversations/{id}` (+ `messages/`). Without the variable below the API runs in `memory` mode and every
Railway restart/redeploy loses consumer threads.

## Required Railway variables

| Variable | Value | Why |
|----------|-------|-----|
| `USER_CONVERSATIONS_BACKEND` | `dual` (recommended) or `firestore` | Enables mirror writes **and** rehydrate-on-read. Default is `memory`. |
| `STORAGE_BACKEND` | `firestore` | Required so `useAdminBackend()` is true; otherwise the mirror is silently skipped. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | service account | Admin SDK credentials (see [FIRESTORE_PRODUCTION.md](./FIRESTORE_PRODUCTION.md)). |

`dual` and `firestore` behave identically in the current code (`resolveUserConversationsBackend()` in
`services/users/userConversationService.js`, and the same check in the P2P, group, network-link and index services):
both mirror writes and hydrate reads. Anything else (including unset) is `memory`.

### Set it

CLI (from a directory linked to the project):

```bash
railway variables --set "USER_CONVERSATIONS_BACKEND=dual"
railway up        # a variable change triggers a redeploy; `up` is only needed to ship code
```

Dashboard: Railway → project → service `ziricai` → **Variables** → **New Variable** → name
`USER_CONVERSATIONS_BACKEND`, value `dual` → **Deploy**.

**Status at 2026-11-08:** already set to `dual` on production (`railway variables` shows
`USER_CONVERSATIONS_BACKEND=dual`, `STORAGE_BACKEND=firestore`). No change was needed by Gate 1.

## What is rehydrated, and when

`hydrateFederatedChatIndex(userId)` (`services/users/chatConversationIndexService.js`) runs on
`GET /api/chat/conversations` and now also on the P2P / group list, open, read and send routes. It is a no-op in memory
mode, never overwrites live in-process state, is rate-limited to once per 30 s per user per process, and caps at the
newest 50 threads.

| Thread kind | Rehydrated | Lookup |
|-------------|------------|--------|
| `person_to_business` | yes | `userId == uid` |
| `ai_to_ai` (network) | yes | `userId == uid` |
| `person_to_person` | yes (Gate 1) | creator by `userId`; peer by `participantPersonIds array-contains uid` |
| group (personal / organisation) | yes (Gate 1) | same |
| message attachments | yes (Gate 1) | `attachments` is now written and read on `messages/` docs |

### Known limits

- P2P / group threads written **before** Gate 1 have no `participantPersonIds`; only their creator sees them after a
  restart until the thread is next written (any new message/member change re-upserts the field).
- Block lists (`personBlockService`) and per-user preferences are not part of this mirror.
- `participantPersonIds` uses a single-field `array-contains` query: no composite index to deploy.
- Tenant-side CRM history is separate (`STORAGE_BACKEND=firestore`) and is also used by `syncMessagesFromTenant`.

## Verify after deploy

1. `GET /api/health` → `200`.
2. Sign in on the Sarah App, send a message to a company, then **redeploy / restart** the Railway service.
3. Reload the Sarah App Chat tab: the thread and its messages must still be listed.
4. Firestore console → `userConversations` → document has `participantPersonIds` and (for P2P/group) `title` /
   `peerPersonId`.
5. Logs must not contain `[chatConversationIndex] hydrate failed` or `participant lookup failed` (a missing
   credential logs a warning and the API degrades to memory).

Offline proof (no Firestore): `node --test test/gate1-chat-durability.test.mjs test/snet-08-routing.test.mjs`.
`test/ch4-chat-index.test.mjs` is memory-only (no file dependency); `test/user-conversations-persistence.test.mjs`
runs its Firestore restart slice only when `USER_CONVERSATIONS_BACKEND=firestore` and Admin credentials are present.
