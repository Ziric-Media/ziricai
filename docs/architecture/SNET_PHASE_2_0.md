# SNET Phase 2.0 — milestone tracker

Scope source: `SNET_GATE_COMPLETE.md` §5 ("What is still partial"). Branch: `programme/sarah-u1-u5-r0`.
Status legend: **Done** = implemented, tested, in `npm run test:snet-programme`; **Partial** = shipped with a stated limit.

| # | Milestone | Status | Where |
|---|-----------|--------|-------|
| 2.1 | Evidence blob storage + officer download | **Done** (scanning = Partial) | `services/network/evidenceBlobStore.js`, `networkVerificationRoutes.js`, MC `Verification queue` modal |
| 2.2 | In-app notifications for My Updates + Sarah App badge | **Done** (device push = not shipped) | `services/network/notificationService.js`, `networkConnectionRoutes.js`, Sarah App bell |
| 2.3 | MC Search administration (categories + synonyms) | **Done** | `services/network/searchConfigService.js`, MC `Search` tab |
| 2.4 | Geo discover (`near`, city, region) + Sarah App filter | **Done** (gazetteer geo = Partial) | `services/network/networkGeo.js`, `businessDirectoryService.js`, Sarah App Discover |
| 2.5 | Verification Officer role (platform RBAC) + browser-less acceptance | **Done** (MC sign-in for officers = Partial) | `services/auth/platformRbac.js`, `scripts/verify-mc-network-smoke.mjs` §7 |

Tests: `test/snet-12-phase2.test.mjs` (11 tests) plus the updated `test/gate5-network-crumbs.test.mjs`; both in `npm run test:snet-programme`.

---

## 2.1 Evidence blob storage + officer download

**Before:** the tenant upload (`PUT …/verification/evidence-uploads/:uploadId`) recorded name / size / sha256 and dropped the bytes; the
upload token and bytes lived only in process memory (`chatMediaService`).

**Now**
- `PUT` validates the *content* against the declared type (PDF / PNG / JPEG / WebP magic bytes, max 5 MB) and stores the bytes in
  `networkEvidenceBlobs/{uploadId}` (metadata, written last) + `networkEvidenceBlobChunks/{uploadId}_{n}` (512 KiB base64 chunks, because Firestore
  documents are capped at 1 MiB). It uses the same adapter as every other network collection: Firestore Admin SDK in production, memory with `STORAGE_BACKEND=memory`.
- A file that fails the content check or storage is discarded and cannot be attached (no orphan refs).
- Evidence refs carry `file.stored: true|false`. The tenant sees "stored securely for verification officers only".
- `GET /api/platform/network/v1/verification/:caseId/evidence/:evidenceId/download` (permission `network.verification.evidence`): serves the exact
  bytes as an **attachment** with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`; the blob's
  `companyId` must match the case; **every download is audited** (`verification.evidence_download`, actor, case, evidence, sha256). Integrity (length + sha256) is re-verified on read.
- MC: the approve/reject/etc. modal lists evidence with a **Download** button; legacy refs show "checksum only — not downloadable".

**Limits (Partial)**
- No malware scanning yet (the tenant UI/API say so). Next: scan on write via an external scanner; quarantine state on the blob doc.
- The upload *token record* is still in process memory, so a PUT must reach the replica that issued the token (unchanged Gate 6 constraint). The *bytes* are durable.
- Files uploaded before 2.1 are checksum-only; the officer asks the business to upload again (`EVIDENCE_FILE_NOT_STORED`).
- No retention sweep: blobs stay until removed with the case. Add a TTL job when a retention policy is set.
- Firestore cost is ~1 write per 512 KiB; acceptable at current volume (≤ 5 MB per file).

## 2.2 In-app notifications (My Updates)

**Before (Gate 5/6):** subscriber events were logged (counts only) and consumers *pulled* a computed feed; nothing per-recipient existed.

**Now**
- `recordSubscriberEvent` fans out one persisted notification per eligible subscriber into `networkNotifications/{ntf_hash(eventId|uid)}`
  (subscribed/connected, valid consent, channel enabled in My Organisations). Idempotent per (event, user). The event gets `status: "delivered_in_app"` and `delivered: N`
  (`logged_only` when nobody is eligible). A fan-out failure never loses the event (`fanOutError` recorded).
- Consumer API: `GET /api/network/v1/my-notifications?limit=&unread=1` → `{ notifications[], unread, delivery: "in_app" }`; `POST /my-notifications/read { ids[] | all:true }`.
  Only the caller's own rows are readable/markable. Items from organisations the user has since unsubscribed from (or that blocked them) are hidden.
- Privacy: the business-visible event log still contains audience *counts*, never uids. The notification payload has no `companyId`, `uid`, `createdBy` or audience data.
- Sarah App (live mode): the existing bell shows the unread count from the server, polls every 60 s while the tab is visible and on open, lists notifications, and marks them read on tap. Fixtures only show when live mode is off.
- Gate 5 test updated: with eligible subscribers the event is now `delivered_in_app` (documented behaviour change).

**Limits (Partial)**
- Not push: no FCM / web-push / email. The app polls. Next: a push worker that reads `networkNotifications` where `pushedAt` is unset.
- Per-user scan is capped at 500 notifications and recipients at 5 000 per event. Add pruning (e.g. delete read items > 90 days) before volume grows.
- Tapping a notification only marks it read; deep-link to the organisation is not wired.

## 2.3 MC Search administration

- Mission Control → Sarah Network → **Search**: edit Discover **categories** (`id | Label | keyword, keyword`) and **synonyms** (`term: related, related`), each validated server-side
  (limits: 24 categories, 40 keywords each, 200 synonym terms, 15 synonyms per term). "Reset all to defaults" restores the shipped lists.
- API: `GET/PUT /api/platform/network/v1/search-config`, `POST …/search-config/reset` (permissions `network.search.read` / `network.search.admin`). Every change is audited
  (`search.config_update`, `search.config_reset`) with a version number.
- Persisted in `networkSearchConfig/config`; applied through `setTaxonomyOverride`, so ranking, facets, profile category validation and category derivation all follow it. Multi-word keywords now match as phrases.
- Multi-replica: each replica re-reads the doc at most every 30 s (the editing replica applies immediately).

**Limits (Partial):** prohibited terms and sponsored rules (named in the Gate 6 partial list) are not part of 2.3; the Portal category picker is served the effective list with each listing load (`categoryOptions`).

## 2.4 Geo discover

- Search API (`/api/network/v1/directory/search`) and Discover (`/api/discover/companies`) accept `city`, `region`, `near` (`lat,lng` or a known place), `radiusKm` (1–500, default 50) and `sort` (`distance` | `relevance`).
  `near` adds `distanceKm` per result and a `geo` echo block; without geo params behaviour is unchanged.
- Location source: an optional listing `geo: { lat, lng }` (new Portal fields, validated) or a built-in South African gazetteer matched against `location` / `serviceAreas`
  (27 towns/cities, aliases, provinces). Public coordinates are rounded to ~1 km.
- Sarah App Discover: a **Place** field (city or province) under the search bar (live mode only). The site's Permissions-Policy blocks `geolocation`, so there is no "use my location" button.

**Limits (Partial):** the gazetteer is intentionally small and code-defined; unknown towns without explicit coordinates are not matched by `near` (still matched by text `city`). External geocoder / spatial index is the Stage-B follow-up.

## 2.5 Verification Officer role (platform RBAC) + acceptance

- `services/auth/platformRbac.js`: roles `verification_officer`, `search_admin`, `trust_safety`, `network_analyst` → permission sets (least privilege). Grants live in
  `networkPlatformRoles/{uid}` (server-side only; never from client claims). Super Admin and `PLATFORM_API_KEY` keep full access (unchanged).
- A **Verification Officer** can read the queue, start review / request info / approve / reject, and download evidence. They **cannot** restrict a business (Trust & Safety / Super Admin), edit search, or suspend entities.
- Roles are granted in MC → Sarah Network → **Access** (Super Admin only): `GET /api/platform/network/v1/roles`, `PUT …/roles/:uid` (audited as `platform.roles_set`).
- Acceptance: `scripts/verify-mc-network-smoke.mjs` §7 (browser-less): anonymous refusal on every new platform route, Search admin + roles round trip, least-privilege check, geo filters, client wiring. Run by `test:snet-programme`.

**Limits (Partial):** the Mission Control shell is built around Super Admin sessions and was not changed to admit scoped roles, so an officer who is not a Super Admin may not be able to open the MC UI; the API enforces roles today for any caller presenting the officer's Firebase token (or the platform API key). Opening the MC shell to scoped roles (and step-up auth / dual approval) is the next governance item.

---

## Constraints preserved
- Client Zero / WhatsApp routing and templates untouched; no change to tenant messaging code paths.
- Evidence files are never public; never returned in the tenant or consumer APIs (only the checksum record).
- Anonymous Discover/search stays rate-limited and exposes listed, non-suspended entries only.

## Deploy log
See the final section of the programme report (Railway deployment id, Netlify deploy ids) — recorded here after release.
