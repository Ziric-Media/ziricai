---
Status: Living document (updated by every completion run)
Related:
  - [SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md)
  - [SNET_PROGRAMME_MILESTONES.md](./SNET_PROGRAMME_MILESTONES.md)
  - [SNET_BACKLOG_GATES.md](./SNET_BACKLOG_GATES.md) (see "Completion run (Gate 6)")
Branch: `programme/sarah-u1-u5-r0`
---

# Sarah Network — Gate Complete (exit checklist)

This document defines what "SNET gate complete" means and maps every section of the SNET-01 master spec to
**done / partial / N/A**, with the test that proves it and the production surface where it can be seen.
It is deliberately conservative: a row is only **done** when behaviour is shipped *and* tested; anything with a named
residual is **partial**. Rows marked **N/A** are decisions, narrative or explicitly out of scope for the first-party MVP.

## 1. The completion gate (what must be true)

The gate is **complete** only when all of the following hold at the commit being released:

| # | Criterion | How it is checked |
|---|-----------|-------------------|
| G1 | The SNET programme suite is green | `npm run test:snet-programme` (12 SNET suites, U4/U5, CH1–CH10, Gates 1–6, MC wiring check) |
| G2 | Every SNET-01 section is classified below, and every **partial** row names its residual | this document |
| G3 | Released from a **clean worktree at HEAD** (no dirty upload) to Railway (API) and the three Netlify sites (Sarah App, Company Portal, Mission Control), with generated copies rebuilt by `prepare:*` | deploy log in [SNET_BACKLOG_GATES.md](./SNET_BACKLOG_GATES.md#deploy-log-2026-11-09-completion-run) |
| G4 | Post-deploy smoke on production passes (see §3) | §3 results |
| G5 | Browser-only surfaces that cannot be asserted in tests are listed as *manual* with an owner step | §4 |
| G6 | No secrets in code, docs, logs or this checklist | review before push |

**Verdict logic.** *Gate complete* = G1–G6 true for the **first-party MVP scope** (Company Portal + Sarah App + Mission
Control, tenants `smilemore-demo` and `central-motors-rtb`). It does **not** claim the whole SNET-01 vision: rows below
that are **partial** or **not started** are the follow-up programme (§5).

## 2. SNET-01 section map

Legend: ✅ done · 🟡 partial · ➖ N/A (decision / narrative / out of scope for this run) · test paths are relative to the repo root.
Production base: API `https://ziricai-production.up.railway.app`, Sarah App `https://sarah.ziricai.com`,
Company Portal `https://app.ziricai.com`, Mission Control `https://admin.ziricai.com`.

| Spec § | Topic | Status | Proof (tests) | Prod surface | Residual / note |
|---|---|---|---|---|---|
| 1 | What Sarah Network is | ➖ | — | — | Narrative. |
| 2 | Four-layer architecture (entities → services → interactions → MC) | ✅ | [`snet-01a`](../../test/snet-01a-network-identity.test.mjs), [`snet-09`](../../test/snet-09-mc-network.test.mjs) | — | Layering is real (identity, services, routes, MC); Layer 3 "interactions" is the chat/enquiry path (§9). |
| 3 | Registration & onboarding (entity types, branches) | 🟡 | [`snet-03`](../../test/snet-03-profile-publish.test.mjs), [`gate4`](../../test/gate4-second-listing.test.mjs) | Company Portal → *Sarah Network* | **Business/organisation** registration via Portal publish works. Branch (`sn_brn_`) and person (`sn_per_`) entities and multi-branch onboarding are **not built**; no external-business self-registration. |
| 4 | Network Identity Registry | ✅ (orgs) | [`snet-01a`](../../test/snet-01a-network-identity.test.mjs), [`snet-02`](../../test/snet-02-registry-durability.test.mjs) | `GET /api/network/v1/entities/:snId` (tenant) | SN-ID is opaque, server-resolved to companyId, durable. Backfill script exists but **has not been run against production** (`npm run network:backfill:dry`). Branch/person kinds: see §3. |
| 5 | Business profiles, public vs restricted fields | ✅ (MVP) | [`snet-03`](../../test/snet-03-profile-publish.test.mjs) | Portal editor; `GET /api/network/v1/entities/:snId/profile` | https URLs only for logo/cover (no image upload), no branches/coordinates, plain inputs for hours/categories. |
| 6 | Search engine / Discover | 🟡 | [`snet-05`](../../test/snet-05-search.test.mjs), [`snet-01b`](../../test/snet-01b-discover-live.test.mjs), [`gate4`](../../test/gate4-second-listing.test.mjs), [`gate5`](../../test/gate5-network-crumbs.test.mjs) | `GET https://ziricai-production.up.railway.app/api/discover/companies` (public); Sarah App → Discover | Ranked in-process provider with synonyms/typo tolerance/verified boost/cursor. **No external index, no geo/radius, no semantic search**; search stats are durable daily counters. |
| 7 | Connections & relationship management | ✅ | [`snet-07`](../../test/snet-07-relationships.test.mjs), [`gate2`](../../test/gate2-my-organisations.test.mjs), [`gate6`](../../test/gate6-completion.test.mjs) | Sarah App → Follow / Subscribe / My Organisations | Consent-linked states, business/consumer blocks, prefs. Per-business rate limit on connection requests not built. |
| 7b | Subscriber notifications (delivery) | 🟡 | [`gate5`](../../test/gate5-network-crumbs.test.mjs), [`gate6`](../../test/gate6-completion.test.mjs) | Sarah App → My Organisations → *Updates*; `GET /api/network/v1/my-updates` | Event log + **pull** feed (consent, prefs, subscription start honoured). **No push** (inbox/device/email), no worker, no read state. |
| 8 | AI Agent Registry | ✅ (MVP) | [`snet-06`](../../test/snet-06-agent-registry.test.mjs) | `GET /api/network/v1/agents`, `…/agents/:agentSnId` | Capabilities are *declared*, not verified or derived from tenant runtime; no invoke contract (§9). |
| 9 | Communication & routing | 🟡 | [`snet-08`](../../test/snet-08-routing.test.mjs), [`ch5`](../../test/ch5-sarah-network-chat.test.mjs), [`ch6`](../../test/ch6-handover.test.mjs), [`gate1`](../../test/gate1-chat-durability.test.mjs), [`ch2`](../../test/ch2-person-to-person.test.mjs), [`ch4`](../../test/ch4-chat-index.test.mjs) | Sarah App → Chats / company chat | Company, P2P, group and network threads rehydrate after restart; person blocks are durable (Gate 6.3). **No dedicated `route-message` network API / queue**; hydration only adds (other replicas see unblocks/membership changes on restart); newest 50 threads per user. |
| 10 | Mission Control — Sarah Network administration | 🟡 | [`snet-09`](../../test/snet-09-mc-network.test.mjs), `npm run verify:mc-network-smoke` | `https://admin.ziricai.com` → Sarah Network (Overview / Entities / Verification queue / Moderation) | Spec nav also lists People & Identities, AI Agent Registry, Search & Discovery, Connections, Communication, Analytics, Configuration, Audit pages — **not built** as pages. Page not browser-tested in this run (§4). |
| 11 | MC dashboard (real metrics) | 🟡 | [`snet-09`](../../test/snet-09-mc-network.test.mjs), [`gate5`](../../test/gate5-network-crumbs.test.mjs) | `GET /api/platform/network/v1/stats` (platform auth) | Metrics come from records (entities, verification, agents, relationships, search, reports). No map view, no message/conversation volume, no availability metric; scans are capped, not materialised. |
| 12 | MC entity management & verification levels | ✅ (MVP+) | [`snet-04`](../../test/snet-04-verification.test.mjs), [`snet-09`](../../test/snet-09-mc-network.test.mjs), [`gate6`](../../test/gate6-completion.test.mjs) | MC verification queue + entity actions | State machine, request-info, audited decisions, badge explains checks, suspend/reinstate. **Evidence file bytes are not stored/scanned** (Gate 6.2: size + sha256 reference only); dual approval and a Verification Officer role are not built (§20). |
| 13 | Search & discovery management in MC | 🟡 | [`gate5`](../../test/gate5-network-crumbs.test.mjs), [`snet-05`](../../test/snet-05-search.test.mjs) | stats `search.durable` | Zero-result queries are visible (durable). Categories/synonyms are code-defined — **no MC admin UI**, no prohibited terms, duplicate-listing management, sponsored rules. |
| 14 | Trust, moderation & safety | 🟡 | [`snet-10`](../../test/snet-10-trust.test.mjs), [`gate5`](../../test/gate5-network-crumbs.test.mjs) | MC → Moderation tab | Entity reports, queue, audited decisions, hard block of demo/test tenants. **No** message/conversation reports, appeals, duplicate-identity or fraud detection, or Trust & Safety role. |
| 15 | Network analytics & commercial intelligence | 🟡 | [`snet-09`](../../test/snet-09-mc-network.test.mjs) | stats endpoint | Counts only. No funnels (search-to-chat), campaigns, boosts, sponsored, revenue. |
| 16 | Connection to other ZiricAI products | 🟡 | [`snet-11`](../../test/snet-11-integration.test.mjs), [`gate2`](../../test/gate2-my-organisations.test.mjs), [`gate6`](../../test/gate6-completion.test.mjs) | Sarah App, Portal, MC | Sarah App, Chat, Discover, My Organisations, Company Portal, Company Sarah, MC are connected. **Sarah Pay / My Wallet** and Personal-Sarah-driven network search are not integrated. |
| 17 | Data architecture & system boundaries | ✅ | [`snet-02`](../../test/snet-02-registry-durability.test.mjs), [`snet-08`](../../test/snet-08-routing.test.mjs) | — | Network collections are server-only, separate from tenant data; ownership rule enforced (snId→companyId on the server). |
| 18 | Registration-to-discovery end-to-end example | ✅ (pilot) | [`snet-03`](../../test/snet-03-profile-publish.test.mjs), [`gate4`](../../test/gate4-second-listing.test.mjs), [`gate6`](../../test/gate6-completion.test.mjs) | Discover lists SmileMore + Central Motors | Proven in tests and prod listing for two pilots; **no real publish was performed through the Portal UI by a tenant** (manual, §4). |
| 19 | Development programme SNET-00…12 | ✅ | [`SNET_PROGRAMME_MILESTONES.md`](./SNET_PROGRAMME_MILESTONES.md) | — | All milestones shipped at MVP depth (some partial rows above). |
| 20 | MC authority limits / admin roles | 🟡 | [`snet-04`](../../test/snet-04-verification.test.mjs), [`gate6`](../../test/gate6-completion.test.mjs) | — | Tenant side: `canManageNetwork` (Gate 6.1, owner/manager) is enforced server **and** portal. MC side: **superadmin / platform key only** — no Network Administrator / Verification Officer / Trust & Safety / Search Admin roles, no step-up auth, no dual approval. Message-content access is not exposed to MC (good default). |
| 21 | Network API (versioned, authorised, audited) | 🟡 | [`snet-08`](../../test/snet-08-routing.test.mjs) (route catalog test) | `/api/network/v1/*`, `/api/platform/network/v1/*` | Versioned v1 API with a route catalog that tests keep honest; auth, ownership, consent, rate limits (enquiry/report/search), audit exist. **Spec paths differ** (`/api/network/…` vs `/v1/…`); no `POST /entities` self-registration, `route-message`, or `/health`; idempotency keys not implemented. |
| 22A | Capability discovery | 🟡 | [`snet-06`](../../test/snet-06-agent-registry.test.mjs) | agents `?capability=` | Declared capabilities only. |
| 22B | Network availability | ➖ | — | — | Future (must be supplied by tenants' systems). Not started. |
| 22C | External network integrations | ➖ | — | — | Explicitly after first-party stability. Not started. |
| 23 | Strategic decision | ➖ | — | — | Decision record. |
| 24 | First milestone / next gate / restrictions | ✅ | [`SNET_00…AUDIT`](./SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md) | — | SNET-00 delivered; client-zero / WhatsApp / Central Motors untouched (tests `gate4`, `snet-08`). |

### Gate 6 items and their rows

| Gate 6 item | Spec rows | Status | Test |
|---|---|---|---|
| 6.1 `canManageNetwork` | 20 | ✅ | [`gate6`](../../test/gate6-completion.test.mjs) (matrices agree, every tenant network write route + UI), [`snet-03`](../../test/snet-03-profile-publish.test.mjs) |
| 6.2 Evidence file refs (tenant-scoped media token) | 12 | 🟡 (no stored bytes, no scan) | [`gate6`](../../test/gate6-completion.test.mjs) |
| 6.3 P2P/group durability (legacy backfill + durable blocks) | 9 | ✅ residuals closed; multi-replica freshness 🟡 | [`ch2`](../../test/ch2-person-to-person.test.mjs), [`ch4`](../../test/ch4-chat-index.test.mjs), [`gate1`](../../test/gate1-chat-durability.test.mjs) |
| 6.4 Subscriber updates (pull) | 7b | 🟡 (no push) | [`gate6`](../../test/gate6-completion.test.mjs) |
| 6.5 Central Motors alignment | 18 | ✅ code+test; MC verify manual | [`gate6`](../../test/gate6-completion.test.mjs), [`gate4`](../../test/gate4-second-listing.test.mjs) |
| 6.6 Stragglers (Railway hygiene) | — | ✅ docs only | [`RAILWAY.md` §8](../deployment/RAILWAY.md) |

## 3. Post-deploy smoke (production)

Run after the release; results are recorded in the deploy log. No credentials are needed or printed.

| Check | Expected |
|---|---|
| `GET /api/health` | 200 |
| `GET /api/discover/companies` (anonymous) | 200; ≥ 2 listed companies, none verified by code, no demo/fixture ids |
| `GET /api/network/v1/my-updates` (anonymous) | 401 (consumer auth enforced) |
| `POST /api/network/v1/orgs/<companyId>/verification/evidence-uploads` (anonymous) | 401/403 (tenant auth enforced) |
| `GET /api/platform/network/v1/stats` (anonymous) | 401/403 |
| `https://sarah.ziricai.com`, `https://app.ziricai.com`, `https://admin.ziricai.com` | 200, serve the new build |

## 4. Manual verification still required (cannot be asserted in tests)

1. **Company Portal → Sarah Network** (owner/manager and a non-manager): edit profile, publish, attach evidence with and without a file; non-managers read-only. *Not exercised in a real browser in this run.*
2. **Mission Control → Sarah Network**: Overview / Entities / Verification queue (evidence shows file name, size, checksum) / Moderation render without console errors.
3. **Sarah App (signed in, live mode)**: Discover shows both pilots; Follow / Subscribe; My Organisations shows *Updates* after a business records an announcement; Central Motors chat opens once and appears in Chats.
4. **Central Motors in MC**: `central-motors-rtb` is `listed`, PILOT, unverified, no open verification case.

## 5. What is still partial for full SNET-01 (follow-up programme)

- **Storage & scanning** for verification evidence files (object storage, malware scan, officer download).
- **Push delivery** for subscriber updates (inbox / device / email worker, read state).
- **Entity kinds**: branches, persons, People & Identities MC page, multi-branch onboarding.
- **Search**: external index, geo/radius, semantic search, MC search administration (taxonomy, synonyms, prohibited terms, sponsored rules).
- **MC governance**: admin sub-roles (Verification Officer, Trust & Safety, Search Admin, Network Analyst), step-up auth, dual approval, remaining MC pages (agent registry, connections, routing, analytics, configuration, audit).
- **Trust & safety**: message/conversation reports, appeals, duplicate-identity/fraud detection.
- **Network API**: self-registration, `route-message`, health, idempotency keys, spec-aligned paths.
- **Ecosystem**: Sarah Pay / My Wallet, availability, external integrations (22B/22C).
- **Operations**: production run of the entity backfill; browser smoke of Portal/MC/Sarah App; multi-replica cache freshness for chat blocks/membership; object-level TTL sweeps for durable counters.
