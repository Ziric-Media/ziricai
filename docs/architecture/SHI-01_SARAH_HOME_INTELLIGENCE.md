# SHI-01 — Sarah Home Intelligence Engine

## Design principle (approved)

**Sarah Home is a persistent, adaptive AI workspace.** Navigation, identity, composer, and bottom nav stay fixed. Greeting and the **four quick-action cards** adapt to the user’s needs, activity, permissions, and authorised data — never as an endless social feed.

## Fixed chrome

| Area | Behaviour |
|------|-----------|
| Chat / Work + search | Fixed controls |
| Avatar + greeting | Fixed layout; greeting text from engine |
| Four-card grid | Same grid; **content** from SHI-01 |
| Composer | Fixed |
| Bottom nav | Fixed |

## Context signals (deterministic inputs)

1. Time of day (morning / day / evening)  
2. Calendar / commitments (when permitted; v1 partial)  
3. Sarah Work (sessions: in progress, completed, approval needed)  
4. Reminders (due / next)  
5. My Organisations (`/api/network/v1/my-updates`)  
6. My Knowledge (profile completeness heuristic)  
7. **Sarah News** (`getSarahNewsSnapshotForUser` + optional breaking candidates) — briefing-ready and breaking cards deep-link to `#news`  
8. Usage behaviour (session counts, work vs chat ratio) — v1 lightweight; **token allowance / exhaustion** from US-04 when metering is live ([SARAH_APP_SUBSCRIPTION_AND_USAGE_SPEC.md](./SARAH_APP_SUBSCRIPTION_AND_USAGE_SPEC.md))  

The model does **not** invent cards. SHI-01 only ranks **templates** filled from authorised service reads.

## Change levels

1. **Immediate** — work status change, new org update, reminder due (refresh on poll / home focus)  
2. **Daily** — time-of-day templates  
3. **Behaviour** — prefer work vs chat templates when `staticHome` is false  
4. **Long-term** — richer org/knowledge signals as data grows  

## Rules

- Do not reorder the four physical slots while the user is interacting (replace content on refresh only).  
- No promotional cards without a factual signal.  
- No data without permission.  
- Optional `reason` string on each card (e.g. “You have a reminder at 10:00”).  
- User prefs: `dismissedCardIds`, `pinnedCardIds`, `staticHome` (client-held v1; profile-backed later).  

## Chat vs Work mode

Same home layout. **Mode** filters eligible card templates:

- **Chat** — insights, knowledge, planning, org summaries, conversation starters  
- **Work** — active work, completed reports, approval needed, quota  

## API

`GET /api/personal-sarah/home/cards?mode=chat|work`  
Optional query: `dismissed`, `pinned`, `static` (comma-separated / boolean).

Response: `{ greeting, cards[4], mode, refreshedAt }`  
Each card: `id, title, lines[], reason?, icon, prompt?, action?, priority, expiresAt?`

## UI (v1 shipped)

- Dismiss card (×), scrollable **More for you** section, **steadier home cards** toggle  
- Chat/Work on home re-ranks cards without leaving the layout  
- Refresh when the tab becomes visible and after Work submit  

## Sarah behaviour (My Knowledge)

Dropdowns under **How Sarah should respond** and **Values → Boundaries** map to `sarahBehavior` on `personal_profile` and feed Personal Sarah’s system prompt (deterministic instructions, not free-text).

## Implementation map

| Layer | File |
|-------|------|
| Engine | `services/sarah/home/sarahHomeIntelligenceService.js` |
| Route | `services/api/personalSarahRoutes.js` |
| Client | `prototype/sarah-app-ux/js/live-bridge.mjs`, `app.js` |
