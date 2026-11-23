# BCS-00 — Babes Car Sales: tenant discovery & automotive benchmark audit

**Date:** 2026-11-23  
**Mode:** Read-only (no tenant creation, no Central Motors changes, no deploy, no integrations)  
**Benchmark tenant:** `central-motors-rtb` (Central Motors Rustenburg — production)  
**Business reference:** Babes Car Sales CC — [babescarsales.co.za](https://babescarsales.co.za/)

---

## 1. Executive summary

| Finding | Detail |
|--------|--------|
| **Babes tenant exists?** | **No** — no company record in production Firestore matches Babes / babescarsales (93 companies scanned). |
| **Recommended provisioning path** | Existing **Mission Control → Companies → New Company** via `provisionOperatorTenant` (`services/platform/operatorTenantProvisionService.js`), not a new ad-hoc mechanism. |
| **Likely `companyId` (if chosen at create)** | `babes-car-sales-cc` from `slugifyCompanyName("Babes Car Sales CC")` — **provisional** until create; collision suffixes (`-1`, …) apply if taken. |
| **Central Motors** | Production tenant `central-motors-rtb` is the automotive benchmark: `industryPresetId: automotive-dealership`, live website inventory adapter, Postgres inventory, Sarah tools, automotive command centre. |
| **Babes must be isolated** | Reserved namespace blocks new ids under `central-motors*`. No code path should copy CM stock, CRM, WhatsApp, or knowledge. |

---

## 2. Stage 1 — Tenant discovery

### 2.1 Repository search (code, scripts, docs)

| Query | Result |
|-------|--------|
| `Babes`, `babescarsales`, `Babes Car Sales` | **Zero** matches under `services/`, `docs/`, `scripts/`. |
| Partial configs / seeds | **None.** |

### 2.2 Production registry (read-only)

Executed via `railway run` + `listAllCompaniesFromStorage()` (Firestore, **no writes**):

- **Total companies:** 93
- **Babes matches:** **[]** (id, name, email, website, phone fields)
- **Rustenburg-related (for collision awareness):** `central-motors-rtb`, `smilemore-demo`, `educare-christian-combined` only

**Conclusion:** Babes Car Sales has **not** been provisioned. No duplicate or partial Babes records were found. **Do not** create a second tenant if a future search finds an existing match — reconcile to that `companyId` first.

### 2.3 Company Sarah / provisioning status for Babes

| Item | Status |
|------|--------|
| Company record | **Absent** |
| Company Sarah (AI employee) | **N/A** |
| `provisionCompany` links (KB, CRM, workflows) | **N/A** |
| Automotive preset on company | **N/A** |
| WhatsApp integration | **N/A** |

---

## 3. Stage 2 — Central Motors benchmark

### 3.1 Tenant identities (do not conflate)

| `companyId` | Role | Preset | Notes |
|-------------|------|--------|--------|
| `central-motors-rtb` | **Production pilot** | `automotive-dealership` v1.0.0, activated `2026-10-23` | Real branding, CM website, inventory import, WhatsApp pilot wiring when env enabled |
| `demo-central-motors` | **Demo / portal showcase** | None | Static portal demo data; may map to RTB for inventory when `CENTRAL_MOTORS_PILOT` / pilot helpers are enabled |

**Safeguard:** Operator provision reserves `central-motors-rtb`, `demo-central-motors`, and any `companyId` starting with `central-motors` (`operatorTenantProvisionService.js`).

### 3.2 Automotive preset (platform)

- **Package:** `shared/industryPresets/presets/automotive-dealership/1.0.0/preset.json`
- **presetId:** `automotive-dealership`
- **Acceptance note on preset:** Phase 1 — read-only dashboard metrics; Sarah hints; `humanReviewRequired: true`
- **Runtime gate:** `industryPresetId` + `industryPresetActivatedAt` (or `INDUSTRY_PRESET_RUNTIME=1` in dev/tests)

### 3.3 Reusable platform capabilities (not CM-specific data)

| Capability | Implementation | Verified |
|------------|----------------|----------|
| Vehicle inventory model + search | `services/inventory/inventoryService.js` (Postgres + memory), `searchInventory` tool | Tests + CM import path |
| Sarah sales + test drives | `companyReceptionAutomotiveChat.js`, WhatsApp prompts, `searchInventory`, `checkTestDriveAvailability`, `bookTestDrive` | Extensive prompt + tool tests |
| CRM / leads | `provisionCompany` CRM baseline; Sarah `searchCRM` / sales orchestration | Generic tenant scope |
| Automotive dashboard API | `GET /api/companies/:companyId/automotive/dashboard` | `test/automotive-dashboard-*.mjs` |
| Portal automotive command centre | `js/portal/modules/automotiveCommandCentre.js` | UI model tests |
| Industry preset enforcement | `assertAutomotivePresetActive` | Preset access tests |

### 3.4 Central Motors–specific (must **not** reuse for Babes)

| Asset | Location |
|-------|----------|
| Website inventory scraper / sitemap | `services/inventory/adapters/centralMotorsRtbAdapter.js` (`CENTRAL_MOTORS_SITEMAP_URL`, CM HTML parsers) |
| Inventory import script | `scripts/import-central-motors-inventory.js` |
| Team / hours knowledge seed | `centralMotorsRtbTeamKnowledge.js`, `seedCentralMotorsPilot.js` |
| Image proxy allowlist | `services/media/dealerImageProxy.js` — **host locked to centralmotorsrtb.co.za** |
| WhatsApp phone → tenant mapping | CM pilot seed + env (`CENTRAL_MOTORS_PILOT`, sandbox phone id) |
| Discover pilot listing copy | `pilotListings.js` profile for `central-motors-rtb` |
| Pilot UID remapping for Sarah App inventory | `resolveSarahAppInventoryCompanyId` in `centralMotorsPilot.js` |

### 3.5 Gaps / lessons (CM programme)

| Area | Status |
|------|--------|
| Automotive preset auto-activation on provision | **Dental has** `applyDentalClinicPreset`; **automotive has no equivalent** — CM preset was applied explicitly in ops (Firestore shows activation timestamp). |
| `seedCentralMotorsPilotIfEnabled` | Seeds company/agent/knowledge/WhatsApp for CM only; does **not** set `industryPresetId` in seed payload (production CM has preset from separate step). |
| Dashboard “live KPI” vs demo | `shouldUseAutomotiveLiveKpis` requires preset + activation; demo tenant still uses static hub metrics. |
| Dashboard data company resolution | `resolvePilotDataCompanyId` can alias demo → RTB — **Babes must never use this path**. |
| Trade-in workflow | **No dedicated tool** — handled via conversation + CRM / human handoff prompts, not a structured valuation pipeline. |
| Finance | Prompt-led assistance + handoff; not a regulated finance origination module. |
| Postgres inventory in audit | Local `railway run` inventory probe failed (`postgres.railway.internal` not reachable from workstation) — **production stock counts not verified in this audit**; use API/portal on RTB or run import verify scripts in Railway context before claiming counts. |

### 3.6 Tests & verification scripts

| Script / suite | Purpose |
|----------------|---------|
| `npm run` / `scripts/verify-automotive-preset-phase1.mjs` | Preset package + automotive test bundle |
| `test/automotive-*.test.mjs` | Dashboard, metrics, preset access, command centre UI |
| `scripts/import-central-motors-inventory.js` | CM website → inventory (template for **Babes adapter**, not copy) |
| `scripts/verify-central-motors-pilot.js` | CM pilot seed checks |

---

## 4. Stage 3 — Capability comparison (Babes vs benchmark)

| Capability | Central Motors (`central-motors-rtb`) | Babes (today) | Required action (post-audit, authorised) |
|------------|--------------------------------------|---------------|----------------------------------------|
| Automotive preset | Active `automotive-dealership` | None | BCS-02: activate preset on **new** tenant only |
| Company Sarah | Seeded Sarah sales consultant | None | BCS-02: `provisionOperatorTenant` + Babes-specific prompt/knowledge |
| Vehicle inventory | Postgres via CM website adapter + import | None | BCS-03: **Babes inventory source decision** + new adapter or manual curated load |
| Vehicle search (Sarah) | `searchInventory` + media replies | None | Depends on inventory + tenant id |
| CRM | Provisioned links | None | Standard `provisionCompany` |
| Lead capture | Tools + inbox / CRM | None | Standard provision + test scripts |
| Test-drive booking | `bookTestDrive` / availability | None | Enable once inventory + company exist |
| Trade-in enquiries | Prompt / handoff (no valuation tool) | None | KB + CRM case type; optional workflow later |
| Vehicle finance enquiries | Prompt + handoff | None | KB (process only); compliance sign-off from Babes |
| Customer follow-ups | Inbox + CRM | None | Standard |
| Automotive dashboard | API + command centre (preset-gated) | None | After preset + inventory/CRM data |
| Knowledge base | CM-specific docs + team KB | None | BCS-03: Babes identity, hours, Michelle/Omar, services |
| Permissions | Tenant-scoped RBAC | None | Owner + staff invites |
| Integrations | CM WhatsApp pilot (isolated) | None | BCS-04+: **new** WhatsApp number / Ready-for-Setup only |
| Sarah Network Discover | Optional pilot listing env | None | Decide publish policy separately |
| Image hosting | CM proxy host lock | None | Extend proxy or store images on import for Babes domain |

---

## 5. Stage 4 — Babes business configuration reference (initial, unverified)

| Field | Value (from Spencer / public site) |
|-------|-----------------------------------|
| Legal / trading name | Babes Car Sales CC |
| Website | https://babescarsales.co.za/ |
| Address | 26 Heystek Street, Rustenburg, South Africa |
| Phone | 014 594 2985 |
| Email | babescarsales43@gmail.com |
| Sales contacts | Michelle, Omar |
| Hours | Mon–Fri 08:00–17:00; Sat 08:00–13:00; Sun closed |
| Services (marketing) | Used cars, finance assistance, trade-ins, sourcing, nationwide delivery |
| Inventory (website) | ~24 listings (used + new) — **reference only** |

**Policy:** Website copy is **not** a live inventory API. Presentation data must be **imported, verified, and availability-flagged** (sold units unavailable).

---

## 6. Stage 5 — Recommended implementation sequence (BCS gates)

| Gate | Work | Outcome |
|------|------|---------|
| **BCS-01** | This audit + stakeholder sign-off | Go/no-go, inventory source choice |
| **BCS-02** | Single tenant create (`babes-car-sales-cc` or approved id) via MC operator provision; **apply automotive preset** (new helper mirroring dental, or controlled manual `updateCompany` + activation timestamp); Babes branding | Isolated tenant, no CM touch |
| **BCS-03** | Knowledge seed (hours, address, team, finance/trade-in **process** disclaimers); inventory pipeline (adapter for babescarsales.co.za **or** dealer feed); initial import + QA | Sarah can answer with verified facts |
| **BCS-04** | Sarah App + Company Sarah UAT: SUV &lt; R250k, Fortuner, finance, trade-in, test drive scripts | Lead + booking paths verified |
| **BCS-05** | Presentation tenant class, portal login for Michelle/Omar demo, no production WhatsApp until authorised | Tomorrow / Wednesday meetings |

### Dependencies & information required from Babes

1. **Authorised owner email** for portal (not necessarily gmail unless they prefer).
2. **Inventory system of record** (website CMS, Excel, DMS, other).
3. **Refresh process** (how often stock updates; who marks sold).
4. **Finance:** licensed FSP / partner process — what Sarah may say vs hand off.
5. **Trade-in:** who values; turnaround; required fields.
6. **Test drives:** slot rules, licence checks, which salesperson gets which lead (Michelle vs Omar).
7. **Photos & scraping:** permission to reuse listing images in Sarah replies.
8. **WhatsApp / Meta:** whether demo uses Sarah App only or a dedicated business number later.

### Risks

| Risk | Mitigation |
|------|------------|
| Duplicate tenant | Always search registry before create (this audit repeated on implementation day). |
| CM data bleed | Never call CM import scripts with Babes `companyId`; never reuse CM WhatsApp ids. |
| Stale inventory in demo | Import + `availability` discipline; no scrape-only one-off. |
| Preset not activated | Follow dental pattern — explicit `applyAutomotiveDealershipPreset` (to be built) or documented ops checklist. |
| Image proxy | Babes CDN/domain not in allowlist — plan media strategy in BCS-03. |
| Short timeline (dealership tomorrow) | Prioritise Sarah App demo on **curated** inventory subset if full adapter not ready. |

---

## 7. Strict boundaries observed

- No modifications to Central Motors or `central-motors-rtb`.
- No Babes tenant created.
- No deployments, integrations, or inventory imports.
- Production discovery: **read-only** Firestore company list only.

---

## 8. Next actions

1. **Spencer / Astra:** Review this report and approve **BCS-02** scope + provisional `companyId`.
2. **Spencer:** Confirm Babes owner email and inventory source before implementation.
3. **Cursor (when authorised):** Implement `BCS-02` using operator provision + automotive preset activation + Babes adapter (separate PR; CM untouched).
4. **Standard process:** Reuse this BCS-00 template for future dealerships (discover → benchmark → compare → gate plan).

---

## Appendix — Canonical Central Motors production snapshot

```json
{
  "id": "central-motors-rtb",
  "name": "Central Motors Rustenburg",
  "website": "https://centralmotorsrtb.co.za",
  "industryPresetId": "automotive-dealership",
  "industryPresetActivatedAt": "2026-10-23T18:37:41.415Z"
}
```

**Babes discovery snapshot:**

```json
[]
```