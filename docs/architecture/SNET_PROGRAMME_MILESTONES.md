---
Status: Living document (updated per milestone commit)
Programme: SNET-01 .. SNET-12
Related:
  - [SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md)
  - [SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md](./SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md)
  - [SNET_01a_SN_ID_ADR.md](./SNET_01a_SN_ID_ADR.md)
Branch: `programme/sarah-u1-u5-r0`
---

# Sarah Network — Programme Milestones

Visible, shippable slices from the SNET-01 master spec (§19 phases SNET-00..12) plus the gaps recorded in the SNET-00 audit (§3, §11, §12).
Each slice ships independently, keeps WhatsApp / Client Zero / Central Motors tenants untouched, and must pass its acceptance checks before it is marked **done**.

**Status legend:** `done` = shipped and tested · `partial` = real behaviour shipped, listed gaps remain · `planned` = not started · `blocked` = needs a product/legal decision.

## Milestone table

| ID | Name | Deliverables | Acceptance checks | Depends | Status |
|----|------|--------------|-------------------|---------|--------|
| **SNET-01a** | Identity foundation (SN-ID) | Opaque SN-IDs (`sn_org_…`), `networkEntities` + `networkRefs`, durable `businessDirectory` read-through, AI-to-AI reply fix, `GET /api/network/v1/entities*` | `npm run test:snet-01a` | — | done |
| **SNET-01b** | Sarah App Discover → live API | `GET /api/discover/companies` with `q` / `category` / `limit`; cards carry `snId`; fixtures split from live (mock only when not live/signed in); SmileMore + published tenants listed from durable directory; Sarah App Discover fetches API in live mode | `test/snet-01b-discover-live.test.mjs`; live mode never merges `MOCK_DISCOVER_COMPANIES` | 01a | **done** (SmileMore + any `businessDirectory` public entry; fixtures only when not live/signed out; `users/` regenerated via `prepare:users`; server search is a plain matcher until SNET-05) |
| **SNET-02** | Entity registry & durability | `scripts/network-backfill-entities.mjs` (dry-run default, skips test/acceptance/unknown classes); durable consent grants, network requests + audit and enquiry rate-limit records (Firestore write-through + memory adapter); `GET /api/sarah-network/grants` list + revoke | `test/snet-02-registry-durability.test.mjs` (restart simulation: cache cleared → state rehydrated from store); backfill dry-run report test | 01a | **done** (backfill script not yet run against production; `npm run network:backfill:dry` first. Durable counters are read-then-write, not transactional; no TTL sweep of `networkRateEvents`; chat-link / federated index durability is SNET-08) |
| **SNET-03** | Profile service / publish sync | Tenant `PUT/GET /api/network/v1/orgs/:companyId/listing`, `POST …/listing/publish` and `/unpublish`; public vs restricted field split; sync to `businessDirectory` + entity `listed/draft`; `canManageNetwork` permission; eligibility gate (demo/test class not publishable server-side) | `test/snet-03-profile-publish.test.mjs` | 01a, 02 | **partial** — API + service done (draft/publish/unpublish, validation, restricted block, eligibility, completeness gate, public profile endpoint). Gaps: **no Company Portal UI** yet; reuses `canManageWorkspace` (owner/manager) instead of a new `canManageNetwork` key to avoid permission-matrix drift across server/portal/Sarah; no images upload (https URLs only); no branches/coordinates |
| **SNET-04** | Verification cases (MVP) | `verificationCases` collection, submit/review states (unverified → submitted → under_review → verified / rejected / restricted), platform API to list + decide (audited); `verified` badge in directory derived from case, not asserted by code; SmileMore case seeded as `verified` by operator record | `test/snet-04-verification.test.mjs` | 01a, 02, 03 | **partial** — cases, state machine, officer decisions requiring recorded checks + note, durable `networkAdminAudit`, entity/directory badge sync, tenant/platform APIs done. SmileMore's badge is explicitly an *operator pilot attestation* (not a seeded case). Gaps: no evidence document upload/storage, no "request more documents" state, no dual approval, no MC UI (09), no non-superadmin Verification Officer role (audit D4/D5) |
| **SNET-05** | Search MVP | `NetworkSearchProvider` interface (`memory`/`firestore` adapters); name / category / keyword / location-text scoring, synonyms, verified boost, cursor pagination; used by Discover endpoint; `GET /api/network/v1/directory/search` | `test/snet-05-search.test.mjs` | 01b, 03 | **done** (Stage A in-process provider over the durable directory: scoring on name/category/tags/industry/description/location, synonyms, plural stemming, edit-distance-1 typo tolerance, stated-place boost, verified + completeness boost, `verified`/`category` filters, base64url offset cursor, `suggest`, `health`, zero-result stats; swappable via `setSearchProvider`. Gaps: no external index (Typesense/Algolia), no geo/radius, search stats are in-process only and reset on restart, cards re-hydrated per query — fine at pilot scale) |
| **SNET-06** | Agent registry | `networkAgents/{agent sn_ai_…}` records for Company Sarah per org (idempotent), capabilities (public facet), status, `GET /api/network/v1/agents/:agentSnId` (public card), `GET /api/network/v1/agents?capability=`; no prompts/KB/secrets exposed | `test/snet-06-agent-registry.test.mjs` | 01a, 03 | planned |
| **SNET-07** | Relationships MVP | `networkConnections` with types discovered / following / subscribed / connected, request/accept/disconnect/block, consent-linked; `POST/GET /api/network/v1/connections`; discover does not imply subscribe | `test/snet-07-relationships.test.mjs` | 02, 06 | planned |
| **SNET-08** | Routing durability | Federated index durability gap documented + fixed where cheap (hydrate list from store); Central Motors discover-id fixture fails closed and is documented (no fake `chatId`); route catalog refreshed for CH + network routes | `test/snet-08-routing.test.mjs`; route catalog test | 02, 01b | planned |
| **SNET-09** | Mission Control — Sarah Network | Platform APIs `/api/platform/network/v1/{stats,entities,verification}`; MC page **Sarah Network** (overview, entities list, verification queue skeleton) registered in the module registry/router/sidebars | `test/snet-09-mc-network.test.mjs` (platform API + registry); page renders from generated `admin/` | 02, 04 | planned |
| **SNET-10** | Trust & safety | `POST /api/network/v1/entities/:snId/report` (consumer), `moderationCases` store, platform queue API `/api/platform/network/v1/moderation`, MC queue stub inside Sarah Network page | `test/snet-10-trust.test.mjs` | 09 | planned |
| **SNET-11** | Ecosystem integration | `snId` on chat list rows for company conversations, My Orgs / handover payloads and Sarah App thread state; consumer chat index returns `snId` | `test/snet-11-integration.test.mjs` | 01b, 08 | planned |
| **SNET-12** | Acceptance | `npm run test:snet-programme` (01a + 01b..11 tests + CH regression subset) wired in `package.json`; milestone doc finalised | `npm run test:snet-programme` green | all | planned |

## Cross-cutting rules (apply to every milestone)

1. Server-side `snId → companyId` resolution; consumers never supply `companyId` for authorisation.
2. Firestore access is server-only (Admin SDK); memory adapter for tests (`STORAGE_BACKEND=memory`).
3. One commit per milestone: `feat(snet): <id> <title>`; stage explicit paths only.
4. Fixtures never merge into live results (SNET-00 §6.3).

## Out of scope for this programme run (explicit)

These are in the master spec but intentionally **not** covered by milestones 01b–12 (follow-up programme):

- Dedicated search provider (Typesense/Algolia), typo tolerance, semantic search, geo/radius queries (needs coordinates in profiles).
- Branch entities (`sn_brn_*`), person entities (`sn_per_*`) and People & Identities MC page.
- Company Portal UI for "Join Sarah Network" / listing editor (API ships in SNET-03; UI follows).
- Verification evidence document storage, dual approval, MC RBAC sub-roles (audit D4/D5).
- Queue/worker dispatch, distributed rate limiting (audit R6), network event types on the integration bus.
- Sarah Pay / Wallet / My Organisations backends, sponsored results, analytics dashboards beyond counts.
- Moderation of message content, appeals.

## Change log

| Date | Change |
|------|--------|
| 2026-11-08 | Document created; SNET-01a recorded as done. |
| 2026-11-08 | 01b, 02 done; 03, 04 partial; 05 done (see rows). |
