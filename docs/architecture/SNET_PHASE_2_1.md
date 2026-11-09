# SNET Phase 2.1 — milestone tracker

Scope: Phase 2.0 **partial** rows in [SNET_PHASE_2_0.md](./SNET_PHASE_2_0.md) and [SNET_GATE_COMPLETE.md](./SNET_GATE_COMPLETE.md) §5. Branch: `programme/sarah-u1-u5-r0`.

| # | Milestone | Status | Where |
|---|-----------|--------|-------|
| 2.1.1 | Web push MVP | **Done** (FCM send = Partial) | `pushDeviceService.js`, `webPushService.js`, `POST /api/network/v1/my-push-devices`, Sarah App `maybeRegisterWebPush` |
| 2.1.2 | Geocoding / near | **Done** (gazetteer = Partial) | `networkGeo.js` expanded PLACES, `inferGeoFromProfile`, publish-time inference |
| 2.1.3 | MC Verification Officer UX | **Done** | `auth-guard.js`, `sarah-network.js` `mcPermSet`, `main.js` landing tab |
| 2.1.4 | Evidence MIME + scan stub | **Done** (live CLAMAV = Partial) | `evidenceScan.js`, `evidenceBlobStore.js` |
| 2.1.5 | HTTP smoke checklist | **Done** | `scripts/snet-browser-smoke.mjs` in `test:snet-programme` |

Tests: `test/snet-13-phase2-1.test.mjs` + existing programme suite (`npm run test:snet-programme`).

---

## 2.1.1 Web push MVP

- Consumers `POST /api/network/v1/my-push-devices { token, consent?, platform? }` → durable `networkPushDevices/{deviceId}`.
- `fanOutSubscriberEvent` still writes in-app notifications first; then **best-effort** FCM via `FCM_SERVER_KEY` (legacy HTTP). Without the key, attempts are logged in-process only (tests assert fan-out).
- Sarah App: when `Notification.permission === 'granted'`, registers a stable `web_*` token via `SarahLive.registerPushDevice` (poll + bell unchanged).

**Partial:** no VAPID / Firebase Messaging SDK token yet; production push requires `FCM_SERVER_KEY` on Railway.

## 2.1.2 Geocoding

- Gazetteer expanded (~20 more SA towns; **Atlantis** now resolvable for `near=`).
- On **publish**, if the draft did not explicitly clear `geo: null`, coordinates are inferred from `location` / `serviceAreas` text when lat/lon omitted.
- Portal manual lat/lon fields unchanged (Phase 2.0).

## 2.1.3 MC officer sign-in UX

- `GET /api/auth/session` returns `platformRoles` + `platformPermissions`.
- Mission Control admits Firebase users with any Sarah Network platform role (not only Super Admin).
- Verification Officer lands on **Sarah Network → Verification queue**; sidebar hides other modules (`body.mc-platform-operator`).
- `sarah-network.js` hides Restrict / Suspend / Search edit / Access tab per permission set.

## 2.1.4 Evidence MIME + scan stub

- Allowed MIME list enforced at blob write (`application/pdf`, PNG, JPEG, WebP).
- `CLAMAV_HOST` recognised; scan hook returns clean with `engine: clamav-noop` (no live scanner wire-up).

## 2.1.5 Browser smoke

- `scripts/snet-browser-smoke.mjs`: anonymous API/site HTTP checks + repo wiring assertions; manual checklist for authenticated flows.

## Deploy log

| Target | Id / result |
|---|---|
| Railway production (`independent-trust` / `ziricai`) | `eb1e95a1-4dbc-4d55-9732-01d624580960` |
| Netlify sarah `6200fa94-47d4-4486-a21f-8bdfbedcdf83` | `6af11bb3b04db7e585ec6920` |
| Netlify app `5eb02040-0849-442a-bfcf-265fae7d397c` | `6af11bd22232443e453b57f7` |
| Netlify admin `ed3936c0-c861-48f4-ae23-13740ca8f9bd` | `6af11bd404fc05afcaa9c03a` |

Built from worktree at `0e04188`; `npm run test:snet-programme` green in main tree before push.
