# ZiricAI Industry Preset Library — Roadmap

**Document ID:** ZIRICAI-INDUSTRY-PRESET-ROADMAP-01  
**Version:** 1.0  
**Date:** 22 October 2026  
**Status:** Delivery plan aligned with [INDUSTRY_PRESET_MASTER_SPEC.md](./INDUSTRY_PRESET_MASTER_SPEC.md)

---

## 1. Programme context

**Prerequisites (complete or in progress):**

- Four core Sarah employees — Finance, Ops, HR, Admin — local MVP gates reported passed.
- Finance MVP explicitly deferred industry presets (`SF_CORE_01_MVP_GATE.md`).
- Marketplace industry **packs** exist for onboarding and optional front-line AI employees; they are **not** the preset library.

**Programme goal:** One validated configuration system configures all four workforce Sarah modules per tenant industry, without forking Sarah implementations.

---

## 2. Delivery phases

### Phase 0 — Architecture audit and documentation ✅

**Objective:** Formalise schema, map repository evidence, choose pilot, define gates. No production code changes.

| Deliverable | Status |
|-------------|--------|
| `INDUSTRY_PRESET_MASTER_SPEC.md` | Done |
| `INDUSTRY_PRESET_ROADMAP.md` | Done |
| Repository evidence map | In master spec §12 |
| Canonical schema + validation contract proposal | Master spec §13–14 |
| Pilot recommendation | Construction & Engineering — master spec §15 |
| Dependency and risk list | Master spec §16 |
| Smallest safe next step | Master spec §17 |

**Constraints honoured:** Read-only audit; no commit/push/deploy requirement for Phase 0 documentation in user workspace; no changes to core Sarah MVP tool policies.

---

### Phase 1 — Schema, registry, validator (no production activation)

**Objective:** Implement the configuration contract and prove one preset validates. Runtime changes limited to **read-only context hints**.

| Work item | Acceptance |
|-----------|------------|
| JSON Schema + capability catalogue | CI validates example fixtures. |
| `industryPresetRegistry` + `industryPresetValidator` | Invalid presets fail with structured errors. |
| Company field proposal (`industryPresetId`, version) | Documented in `FIRESTORE_SCHEMA` / `schema.js` comments; adapter support behind feature flag. |
| Construction preset v1.0.0 (`draft` → `validated`) | Passes validator; instruction blocks in repo. |
| Sarah context integration (hints only) | Pinned preset adds module-appropriate terminology; tool lists unchanged in snapshot tests. |
| Security review | Confirm no preset field reaches `registerTool` or `*SarahToolPolicy` without code change. |

**Implementation (2026-10-22):** `shared/industryPresets/**`, `services/platform/industryPreset*.js`, Sarah context/orchestrator hints, `npm run verify:industry-preset`. Runtime defaults off until `industryPresetActivatedAt` on company (or `INDUSTRY_PRESET_RUNTIME=1` / `allow-validated` for dev).

**Exit gate:** Engineering sign-off on validator tests + Sarah tool snapshot parity + tenant isolation KB test.

**Not in Phase 1:** Production tenant activation UI, automatic pack install, 13 presets, workflow auto-provisioning.

---

### Phase 2 — Pilot tenant activation (Construction & Engineering)

**Objective:** Authorised internal or design-partner tenant activates preset end-to-end with evidence.

| Work item | Acceptance |
|-----------|------------|
| Activation API + admin review step | Only `approved` presets; audit log entry. |
| Onboarding or Settings UX | Select construction preset; show validation report and checklist. |
| KB seed from preset knowledge templates | Documents tagged with provenance; tenant-scoped. |
| Optional module: link to `pack-construction-ai` | Clearly labelled optional; not required for workforce Sarah. |
| Pilot acceptance suite | Automated script + manual checklist signed off. |

**Pilot Sarah configuration targets (configuration intent, not MVP capability claims):**

| Sarah | Construction pilot focus |
|-------|---------------------------|
| **Finance** | Project quotations/invoices, retention language, subcontractor payment **within supported finance tools**. |
| **Ops** | Site tasks, milestones, contractor follow-ups via **task** and ops surfaces. |
| **HR** | Site/office roster, approved HR workflows, safety briefing reminders (informational). |
| **Admin** | Workspace coordination, preset onboarding checklist, cross-module workforce instructions. |

**Exit gate:** All items in §4 Pilot acceptance checklist pass on fixture + one real tenant.

---

### Phase 3 — Rollout wave A (remaining Group A)

Order after construction pilot retrospective:

1. **Education** — student data sensitivity, calendar/facilities vocabulary, parent comms workflows (integration-dependent).
2. **Mining & Geological Services** — fieldwork, equipment, sampling, safety workflows; **mandatory** expert compliance review before `approved`.
3. **Retail & E-commerce** — inventory/order exception language; depends on verified commerce integrations for full KPI set.

Each industry: same schema, new preset package, validator CI entry, capability truth updated in `platformCapabilities.json`.

---

### Phase 4 — Rollout wave B (regulated / specialist)

| Industry | Notes |
|----------|--------|
| Healthcare | Jurisdiction + privacy; PHI handling via existing redaction policies; no preset-expansion of HR email exposure. |
| Financial Services | Align with finance permission policy; no advisory claims beyond configured data. |
| Transport & Logistics | Fleet/shipment integrations likely `integration-dependent`. |
| Funeral Services | Existing onboarding + pack (`funeral`); compassionate tone blocks; compliance review. |

**Gate:** Legal/compliance sign-off recorded in preset `acceptance.manual` before `approved` status.

---

### Phase 5 — Rollout wave C (service / asset)

Hospitality & Tourism, Professional Services, Real Estate & Property, Automotive, Churches & Religion.

Prioritisation may shift with customer demand and integration readiness.

---

### Phase 6 — Operations at scale

- Preset version migrations with tenant pin and rollback.
- Mission Control / superadmin preset publish workflow.
- Analytics on preset adoption and capability gap heatmap.
- Contributor guide for adding presets without code forks.

---

## 3. Thirteen-industry catalogue (reference)

| # | Industry | Wave | Pilot |
|---|----------|------|-------|
| 1 | Construction & Engineering | A | **First pilot** |
| 2 | Education | A | |
| 3 | Mining & Geological Services | A | |
| 4 | Retail & E-commerce | A | |
| 5 | Healthcare | B | |
| 6 | Financial Services | B | |
| 7 | Transport & Logistics | B | |
| 8 | Funeral Services | B | |
| 9 | Hospitality & Tourism | C | |
| 10 | Professional Services | C | |
| 11 | Real Estate & Property | C | |
| 12 | Automotive | C | |
| 13 | Churches & Religion | C | |

---

## 4. Pilot acceptance checklist (Construction)

Use for Phase 2 exit; partial items may be simulated in Phase 1 with fixture tenants.

### 4.1 Schema and registry

- [ ] `construction-engineering` preset validates against schema v1.0.0.
- [ ] All capability ids exist in platform catalogue with honest class labels.
- [ ] No preset field adds tools to Sarah allowlists.

### 4.2 Tenant configuration

- [ ] Company record stores pinned `industryPresetId` + `industryPresetVersion`.
- [ ] Overrides documented and do not expand permissions.
- [ ] Deactivation / rollback procedure documented and tested on fixture.

### 4.3 Runtime (four Sarah modules)

- [ ] Finance Sarah: construction terminology in system addendum; finance tools unchanged vs baseline snapshot.
- [ ] Ops Sarah: ops/task terminology present; tools unchanged vs baseline (after Ops policy confirmed on branch).
- [ ] HR Sarah: HR terminology present; redaction rules unchanged.
- [ ] Admin Sarah: preset checklist visible in instructions/onboarding hint; delegation tools unchanged.

### 4.4 Knowledge and isolation

- [ ] Industry knowledge ingested with provenance metadata.
- [ ] Tenant A cannot retrieve Tenant B preset-seeded docs via Sarah tools.

### 4.5 Workflows and KPIs

- [ ] Any pilot workflow uses only supported automation action types.
- [ ] KPIs show "insufficient data" when sources missing (no false precision).

### 4.6 Compliance and onboarding

- [ ] Compliance entries marked informational; human review flag for activation in regulated sub-jurisdictions if applicable.
- [ ] Onboarding checklist blocks "ready" when mandatory integration/config missing.

### 4.7 Evidence

- [ ] Automated verify script output archived under `docs/architecture/evidence/`.
- [ ] Manual product review sign-off recorded.

---

## 5. Acceptance gates summary

| Gate | Phase | Criteria |
|------|-------|----------|
| **G0** | 0 | Spec + audit published; no unauthorised MVP changes. |
| **G1** | 1 | Validator + schema CI green; tool snapshot parity. |
| **G2** | 2 | Construction pilot tenant activated with full §4 checklist. |
| **G3** | 3 | Three additional Group A presets `validated` + one partner tenant each. |
| **G4** | 4+ | Regulated presets require compliance sign-off in `acceptance.manual`. |

---

## 6. Dependencies on other programmes

| Programme | Relationship |
|-----------|--------------|
| Sarah Finance / HR / Admin MVP | Tool policies frozen; preset must not alter without separate gate. |
| Sarah Ops MVP | Confirm ops tool policy merged before Ops-heavy capability claims. |
| Marketplace packs | Optional modules; install validator pattern reused. |
| Platform Intelligence taxonomy | Sector id normalisation for analytics. |
| BOS / commercial cycle | Construction finance wording may reference BOS; capabilities must match implemented BOS APIs. |

---

## 7. Recommended immediate action

After stakeholder review of Phase 0 docs:

**Approve Phase 1** implementation scope in master spec §17 (schema + registry + validator + context hints only).

Do **not** begin multi-industry content authoring until Construction v1.0.0 passes G1.

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-10-22 | Initial roadmap aligned with master spec and Phase 0 audit. |
