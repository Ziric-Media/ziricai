# SNET Phase 2.2 — milestone tracker

Scope: Phase 2.1 **partial** rows in [SNET_PHASE_2_1.md](./SNET_PHASE_2_1.md). Branch: `programme/sarah-u1-u5-r0`.

| # | Milestone | Status | Where |
|---|-----------|--------|-------|
| 2.2.1 | FCM end-to-end | **Done** (live send = Partial) | `push-fcm.mjs`, `js/users/sw.js`, `webPushService.js`, `POST /api/network/v1/my-push-devices` |
| 2.2.2 | Nominatim geocode on publish | **Done** (rate limit = Partial) | `nominatimGeocode.js`, `publishListing` in `networkProfileService.js` |
| 2.2.3 | MC platform login for officers | **Done** | `js/auth.js` `isMissionControlHost`, `js/admin/auth-guard.js`, `main.js` landing |
| 2.2.4 | Phase 2.2 acceptance | **Done** | `test/snet-14-phase2-2.test.mjs`, `scripts/snet-phase22-acceptance.mjs` |
| 2.2.5 | Gate doc refresh | **Done** | [SNET_PROGRAMME_MILESTONES.md](./SNET_PROGRAMME_MILESTONES.md) changelog |

Tests: `test/snet-14-phase2-2.test.mjs` + `npm run test:snet-programme`.

---

## 2.2.1 FCM end-to-end

- Sarah App: when `Notification.permission === 'granted'`, tries **Firebase Messaging** `getToken` when `firebase.vapidKey` is present in site config; otherwise keeps the Phase 2.1 stable `web_*` token.
- Service worker (`js/users/sw.js`) registers FCM background handler (compat SDK).
- Server: **`webPushService.js` prefers FCM HTTP v1** (`POST …/v1/projects/{projectId}/messages:send`) with OAuth from Railway `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Legacy `FCM_SERVER_KEY` is optional fallback only when v1 creds are absent.

**Partial:** VAPID / Web Push certificate on prod Sarah (prior Netlify deploy). Legacy FCM API remains **Disabled** on project `ziricai`; v1 is the supported server path. **Live device push** still depends on clients registering real FCM tokens (VAPID in site config) and Railway holding the Firebase Admin trio above — no `FCM_SERVER_KEY` required when v1 is live.

## 2.2.2 Nominatim geocode

- On **publish**, after gazetteer inference fails, calls OpenStreetMap Nominatim (1 req/s in-process throttle, `User-Agent`, `countrycodes=za`).
- Stores `geo: { lat, lng }` on the directory entry; Discover `near=` uses haversine as before.
- Disable with `NOMINATIM_DISABLED=1` (tests mock fetch).

## 2.2.3 MC officer login

- `GET /api/auth/session` already returns `platformRoles` / `platformPermissions`.
- Mission Control admits Firebase users with Sarah Network platform roles (not only Super Admin), including Netlify preview admin hosts and local `/admin` paths.
- Verification Officer lands on **Sarah Network → Verification queue** (unchanged from 2.1).

## 2.2.4 Acceptance

- `scripts/snet-phase22-acceptance.mjs`: HTTP smoke + repo wiring for geocoder, FCM module, phase doc.
- Wired in `test:snet-programme` after `snet-browser-smoke.mjs`.

## Deploy log

| Target | Id / result |
|---|---|
| Railway production (`independent-trust` / `ziricai`) | `5c9de33d-4bcf-429a-b677-e3296e7bb96c` |
| Netlify sarah `6200fa94-47d4-4486-a21f-8bdfbedcdf83` | `6af1bad007ca96ddaf31930a` |
| Netlify app `5eb02040-0849-442a-bfcf-265fae7d397c` | `6af1bb06c8ee12710321ae4b` |
| Netlify admin `ed3936c0-c861-48f4-ae23-13740ca8f9bd` | `6af1bb0a5dcfe33dd5a5f4f1` |

Built from clean worktree; `npm run test:snet-programme` green before push.

### Railway FCM / Firebase variables (production names only)

| Name | Purpose |
|------|---------|
| `FIREBASE_PROJECT_ID` | FCM HTTP v1 project id (same as Admin SDK) |
| `FIREBASE_CLIENT_EMAIL` | Service account email for v1 OAuth |
| `FIREBASE_PRIVATE_KEY` | Service account private key for v1 OAuth |
| `FCM_SERVER_KEY` | Legacy HTTP only (optional fallback; omit when v1 creds present) |

Client VAPID: Firebase Console → Cloud Messaging → Web configuration → **Key pair** → set as `vapidKey` in Sarah site config at prepare/deploy time (not in git).
