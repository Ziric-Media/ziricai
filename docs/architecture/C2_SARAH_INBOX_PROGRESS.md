# C2 — Sarah Inbox (Company Portal first slice)

**Status:** In progress (2026-11-08)  
**Audit:** [COMPANY_PORTAL_SARAH_APP_INTEGRATION_AUDIT.md](./COMPANY_PORTAL_SARAH_APP_INTEGRATION_AUDIT.md) §3.1, C8

## Delivered in this slice

- `CHANNEL_LABELS.sarah_app` → **Sarah App · Sarah Inbox** in `js/portal/modules/inbox-ui.js` (mirrored to `app/`).
- Sales Sarah nav tab **Sarah Inbox** (`sarah_app`) with routing via `conversationSalesChannel` / `filterConversationsForSalesSection` — threads no longer lumped into WhatsApp.
- Thread header icon for `sarah_app` (mobile screen, purple).
- `test/c2-sarah-inbox-channel.test.mjs` — label + routing assertions.
- Tenant API label alignment in `services/tenants/conversationService.js`.

## Not in this slice

- Dedicated non-Sales inbox module (`app/js/portal/modules/conversations.js` flat inbox) — still lists all channels together; labels now correct when `channel: sarah_app`.
- WhatsApp webhook or integration changes (unchanged).
- Consumer discover / SUB-01 portal modules.

## Production ops (2026-11-08)

| Step | Result |
|------|--------|
| Firestore indexes (`ziricai` + `ziricai-staging`) | **Success** — added `conversations` composite `channel` + `updatedAt`; removed invalid single-field `messages` index |
| Backfill dry/apply `smilemore-demo` (Railway prod creds) | **OK** — `plans: 0`, no errors (no tenant `sarah_app` threads in prod yet) |
| Railway `USER_CONVERSATIONS_BACKEND` | **`dual`** (prod); `INTEGRATION_EVENTS_SARAH_APP` left unset |
| Deploy | `5865d403` — env change triggered redeploy; `/api/health` 200 |
| Consumer smoke | `GET /api/user-conversations` → **401** (auth required, route live) |
