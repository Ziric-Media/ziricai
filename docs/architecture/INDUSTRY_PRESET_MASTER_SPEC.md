# ZiricAI Industry Preset Library

**Document ID:** ZIRICAI-INDUSTRY-PRESET-01  
**Version:** 1.0  
**Date:** 22 October 2026  
**Status:** Architecture baseline for implementation planning (Phase 0 complete — documentation + read-only audit)

Related: [INDUSTRY_PRESET_ROADMAP.md](./INDUSTRY_PRESET_ROADMAP.md)

---

## 1. Purpose

The ZiricAI Industry Preset Library enables businesses in different industries to configure the same core AI employee platform for their operational environment.

The library must allow a construction company, school, mine, retailer, healthcare provider, transport operator or professional-services firm to use the four core Sarah employees with relevant roles, workflows, KPIs, terminology, knowledge, compliance requirements and onboarding experiences.

The library must **not** require a separate codebase or a separately implemented version of every Sarah for every industry.

### Primary objectives

- Reuse the four core Sarah employees (Finance, Ops, HR, Admin).
- Standardise industry configuration.
- Define repeatable industry workflows.
- Provide industry-appropriate roles and permissions **mappings** (not a parallel auth system).
- Configure useful KPIs based on actual available data.
- Provide structured industry knowledge.
- Make onboarding specific to the business type.
- Declare regulatory and compliance obligations without pretending that configuration alone establishes compliance.
- Validate presets before tenant activation.
- Support future industry additions without rebuilding the core platform.

---

## 2. Architecture principles

### 2.1 Configuration before custom code

An industry-specific requirement should first be expressed as configuration using an existing supported capability.

New code is appropriate only when the required behaviour cannot be safely represented by existing functionality.

### 2.2 Core employee separation

The four core Sarah employees remain responsible for their established domains:

| Employee | Domain |
|----------|--------|
| **Sarah Finance** | Authorised financial information and supported finance workflows. |
| **Sarah Ops** | Tasks, operational coordination and progress. |
| **Sarah HR** | Authorised team information and supported HR workflows. |
| **Sarah Admin** | Workspace overview, administration and coordination. |

Industry presets may change instructions, terminology, knowledge, default workflows and available configuration options. They **must not** silently change the responsibilities or permission boundaries of a core employee.

### 2.3 Capability-based activation

A preset can declare a capability requirement, but it **cannot** make an unimplemented capability available.

Every capability must be classified as:

| Class | Meaning |
|-------|---------|
| **Available** | Implemented and authorised for the tenant. |
| **Configurable** | Supported by the platform and awaiting tenant configuration. |
| **Integration-dependent** | Requires a configured and verified integration. |
| **Extension-required** | Needs additional implementation. |
| **Unavailable** | Cannot currently be used. |

Sarah must not advertise an unavailable capability as operational.

### 2.4 Tenant isolation

Industry configuration, company data, knowledge sources, workflow records and integration credentials must remain tenant-scoped.

One tenant's configuration or records must never become accessible to another tenant because both use the same industry preset.

### 2.5 Compliance is not a checkbox

Presets may describe relevant legislation, standards, policies, required evidence and review steps. Actual compliance depends on jurisdiction, business activity, implementation, configuration, operational practice and evidence.

Compliance-sensitive presets must identify the applicable jurisdiction and require review by an appropriately qualified person where necessary.

### 2.6 Backward compatibility

Adding a new industry preset must not change the behaviour of existing tenants unless an authorised configuration migration explicitly requires it.

Preset updates must be versioned and validated before activation.

### 2.7 Distinction from marketplace industry packs

The repository already has **marketplace industry packs** (`industryPackService.js`, `employeePacks.js`, onboarding `packId`) that provision **additional front-line AI employees**, tenant KB documents, and automation workflows.

The **Industry Preset Library** is a separate concern:

- Targets the **four workforce Sarah modules** (Finance, Ops, HR, Admin), not duplicate Sarah implementations per sector.
- May **reference** marketplace content (e.g. optional install of `pack-construction-ai`) but must not conflate pack install with preset activation.
- Must never add tools to Sarah allowlists by reading arbitrary tool names from preset JSON.

---

## 3. System architecture

Six logical layers (target state):

| Layer | Description | Current repository anchor (Phase 0) |
|-------|-------------|-------------------------------------|
| **A — Core platform** | Auth, tenants, tool registry, permissions, data services, workflow execution, audit, integrations. | `services/auth/*`, `services/tenants/*`, `services/storage/*`, `services/automation/*`, `services/events/*` |
| **B — Core Sarah employees** | Finance, Ops, HR, Admin — instructions, tool policy, MVP gates. | `services/sarah/*`, `*SarahToolPolicy.js`, gate docs under `docs/architecture/SARAH_*` |
| **C — Industry preset registry** | Versioned preset definitions, schema, validation rules. | **Gap** — no `industryPreset*` service yet; partial overlap with onboarding industries + marketplace categories |
| **D — Tenant industry configuration** | Selected preset, version, jurisdiction, modules, role mappings, KPIs, knowledge, extensions. | **Partial** — `company.industry`, `industryId`, `sector`, marketplace installs; no `industryPresetId` / preset version fields |
| **E — Runtime resolution** | Merge tenant + preset into employee context (instructions, knowledge scope, capability truth). | **Partial** — `buildSarahContext` + `buildWorkspaceContextHint` use free-text `companyIndustry` only |
| **F — Evidence and governance** | Validation reports, activation gates, migration audit. | **Partial** — `marketplaceInstallValidator.js` pattern reusable; Sarah MVP acceptance scripts |

---

## 4. Canonical industry preset schema

Every preset must conform to one versioned schema. Implementation should use the repository's established validation approach (see §13).

### 4.1 Identity

| Field | Required | Notes |
|-------|----------|-------|
| `presetId` | Yes | Stable machine-readable ID (e.g. `construction-engineering-za-v1`). |
| `name` | Yes | Display name. |
| `version` | Yes | Semver for preset content. |
| `schemaVersion` | Yes | Schema contract version (starts at `1.0.0`). |
| `description` | Yes | Purpose and intended users. |
| `industry` | Yes | Primary classification; align with `organisationTaxonomy` sector ids where possible. |
| `subIndustries` | No | Supported subtypes. |
| `jurisdictions` | Yes | ISO country / region codes or explicit `global` with limitations. |
| `status` | Yes | `draft` \| `validated` \| `approved` \| `deprecated` \| `retired`. |
| `owner` | Yes | Product or domain owner. |
| `lastReviewedAt` | Yes | ISO date. |

### 4.2 Business profile

Business size, operating model, regions, currency, timezone, hours, stakeholder types, terminology glossary, business units. Defaults editable; legally material settings not silently inferred.

### 4.3 Core Sarah mapping

For each of `finance` | `operations` | `hr` | `admin`:

- Industry-specific **purpose** (instruction text, not tool grants).
- **Capability references** (IDs from platform capability catalogue — see §13).
- Required tenant configuration keys.
- Approved **integration types** (not raw OAuth scopes from preset alone).
- Restricted actions (documentation + UI copy).
- Human approval points.
- Knowledge collection IDs (tenant-scoped after ingest).
- KPI IDs.
- Acceptance test IDs.

**Rule:** Preset selects from **`ALLOWED_CAPABILITY_IDS`** and **`ALLOWED_INSTRUCTION_BLOCKS`** validated at build time. No executable tool allowlist in preset files.

### 4.4 Modules

Module id, purpose, required/optional capabilities, dependencies, default activation, permissions (platform permission keys only), relevant Sarah employees, config fields, acceptance tests, limitations.

Activation requires entitlement + dependencies + valid permissions + configuration.

### 4.5 Roles and permissions

Logical industry roles mapped to existing keys in `PERMISSION_MATRIX` / finance and task policies (`services/auth/permissionsService.js`, `financePermissionPolicy.js`, `taskPermissionPolicy.js`).

No parallel authorisation system. Server-side checks remain authoritative.

### 4.6 Workflows

Stable id, purpose, trigger, inputs, preconditions, responsible role/Sarah, steps, state transitions, approvals, evidence, failure/retry, escalation, completion, audit, acceptance tests.

Workflows orchestrate **existing** automation engine actions (`workflowRegistry.js`, pack conversion in `industryPackService.convertPackWorkflowToAutomation`).

### 4.7 KPIs

Id, name, meaning, formula, data sources, period, unit, filters, freshness, measured vs derived vs estimated, limitations, acceptance tests.

Do not display authoritative KPIs when data is missing, incomplete or stale.

### 4.8 Knowledge

Collection id, source type, use case, jurisdiction, owner, authority, version/effective date, review/expiry, access class, retrieval scope, citation rules, ingestion status.

Distinguish tenant policies from general industry guidance.

### 4.9 Compliance

Obligation id, jurisdiction, activities, legal reference, control, responsible role, evidence, review frequency, human review flag, related workflows/KPIs, limitations.

Preset does **not** declare tenant compliant by configuration alone.

### 4.10 Onboarding

Checklist: identity, jurisdiction, business config, roles, Sarah availability, modules, data sources, knowledge, workflows, KPI prerequisites, compliance review, acceptance tests, activation approval.

Show missing dependencies; block "ready" until required checks pass.

### 4.11 Integrations

Type, purpose, required permissions/scopes, tenant config, credential storage, data flows, operations, failure behaviour, verification procedure, security notes, acceptance tests.

Connected only after platform verification (pattern: WhatsApp integration status in `buildSarahContext`).

### 4.12 Acceptance and lifecycle

Automated tests, manual reviews, security/permission tests, tenant-isolation tests, workflow criteria, limitations, version compatibility, migrations, activation/rollback.

---

## 5. Preset validation rules

A preset **cannot** be activated for a tenant if:

1. Schema validation fails.
2. A required capability is not `available` or `configurable` for that tenant.
3. A required integration is not verified.
4. A role maps to an unknown permission key.
5. A workflow references an unsupported action or transition.
6. Required knowledge failed ingest/review.
7. A mandatory acceptance test fails.
8. Mandatory compliance review is unresolved.
9. Configuration would weaken access controls.
10. Tenant mandatory settings are incomplete.

Validation must return a structured report: rule id, field path, severity, remediation.

**Reuse target:** Mirror post-install checks in `marketplaceInstallValidator.js` and Sarah MVP verify scripts under `scripts/verify-sarah-*`.

---

## 6. Runtime behaviour

When Sarah receives a request, the platform must **not** append the entire preset to the prompt and rely on the model for enforcement.

Required sequence:

1. Resolve authenticated tenant and user.
2. Load approved tenant industry configuration (preset id + pinned version).
3. Validate preset still `approved` for tenant jurisdiction.
4. Compute effective permissions (`permissionsService` + finance/task policies).
5. Resolve employee tool policy (`toolRegistry.getToolsForContext` + `*SarahToolPolicy.js`).
6. Load **approved** industry instruction fragments and knowledge scope (not raw preset blob).
7. Expose only tools passing persona, Sarah-module, and permission filters.
8. Re-enforce permissions at tool execution (`assertToolAccess`, handler-level checks).
9. Validate sensitive mutations and approval requirements.
10. Record audit events where supported.
11. Return actual operation results; Sarah reports honest success/failure/limitations.

**Current gap:** `companyIndustry` free-text hint in `buildWorkspaceContextHint` (`sarahContext.js`) is advisory only — no preset version, no capability truth table in context.

---

## 7. Versioning and tenant migrations

Presets use explicit semver. Updates do not auto-overwrite tenant overrides.

Migrations document: from/to version, field changes, capability changes, permission impact, workflow changes, data migration, risks, validation, rollback.

Permission expansions require explicit review. Tenants stay on pinned version until migration succeeds.

**Reuse target:** Patterns from `marketplaceVersioning.js` (pack updates), applied to preset documents not marketplace templates alone.

---

## 8. Industry catalogue (13)

Same schema for all; rollout order in [INDUSTRY_PRESET_ROADMAP.md](./INDUSTRY_PRESET_ROADMAP.md).

| Group | Industries |
|-------|------------|
| **A — Pilot candidates** | Construction & Engineering, Education, Mining & Geological Services, Retail & E-commerce |
| **B — Regulated / specialist** | Healthcare, Financial Services, Transport & Logistics, Funeral Services |
| **C — Service / asset** | Hospitality & Tourism, Professional Services, Real Estate & Property, Automotive, Churches & Religion |

**Taxonomy alignment:** Map preset `industry` to `js/shared/organisationTaxonomy.js` sector ids where possible. Onboarding `ONBOARDING_INDUSTRIES` and marketing `INDUSTRY_TEMPLATES` use overlapping but **inconsistent** ids (e.g. `school` vs `education`, `law` vs `legal`) — normalise in registry aliases during Phase 1.

---

## 9. Initial acceptance criteria (library + first pilot)

The library is ready for first pilot when:

- [ ] Canonical schema implemented and validated in CI.
- [ ] At least one complete preset document passes validation.
- [ ] Tenant can select/configure preset through an authorised flow (Settings and/or onboarding extension).
- [ ] Runtime resolves tenant + pinned preset version.
- [ ] Sarah instructions/knowledge reflect industry without expanding tool allowlists.
- [ ] Tool permissions unchanged vs core Sarah MVP policies.
- [ ] Missing capabilities reported explicitly (UI and/or Sarah copy).
- [ ] Workflows use supported automation actions only.
- [ ] KPIs trace to available data or show "insufficient data".
- [ ] Tenant isolation tests pass.
- [ ] Preset update does not silently change permissions.
- [ ] Pilot has automated + manual acceptance evidence.

---

## 10. Implementation boundary (Phase 1 scope)

Phase 1 delivers:

- Schema + registry contract + validation module.
- Tenant configuration model (fields + API read path).
- Lifecycle rules (draft → validated → approved).
- **One pilot preset** (Construction & Engineering recommended).
- Runtime **instruction/knowledge resolution only** — no dynamic tools.

Phase 1 does **not**:

- Build all 13 integrated presets.
- Replace marketplace packs or duplicate four Sarahs per industry.
- Introduce a new workflow engine, permission framework, or knowledge platform if existing services suffice.
- Modify core Sarah MVP tool policies without a separate gated change.

---

## 11. Definition of success

A new industry is added primarily through a **validated configuration package**; code only for genuinely missing capabilities.

No copying and maintaining four independent Sarah codebases per sector.

Long-term: reusable, versioned, testable industry configuration that preserves core Sarah reliability while improving sector relevance.

---

## 12. Phase 0 repository evidence map

Read-only audit (22 October 2026). Paths relative to repository root.

### 12.1 Existing planning and deferrals

| Evidence | Finding |
|----------|---------|
| `docs/architecture/SF_CORE_01_MVP_GATE.md` | Industry presets explicitly **not required** for Finance MVP. |
| `docs/architecture/SF_CORE_01_FULL_PROGRAM.md` | Industry presets **deferred** after workforce Sarah MVPs. |

### 12.2 Industry / sector data (marketing vs tenant vs platform)

| Component | Role | Preset relevance |
|-----------|------|------------------|
| `js/shared/industryTemplates.js` | Landing page list (icons, HTML pages). | **Not** tenant preset schema. |
| `services/platform/onboardingService.js` → `ONBOARDING_INDUSTRIES` | Onboarding step; links `industryId` → optional `packId`. | **Adjacent** — pack install, not workforce Sarah preset. |
| `js/shared/organisationTaxonomy.js` | PI segment sectors + aliases. | **Reuse** for preset `industry` normalisation. |
| `services/database/schema.js` → `company.industry`, `sector`, `subSector`, `country`, `region` | Tenant profile fields. | **Extend** with `industryPresetId`, `industryPresetVersion`, `industryPresetOverrides` (proposal). |
| `services/platform/platformRegistry.js` | Exposes `industryId` in meta. | Align naming with preset id in Phase 1. |

### 12.3 Marketplace / packs (do not confuse with preset library)

| Component | Role |
|-----------|------|
| `services/platform/industryPackService.js` | Installs agents, KB, workflows from pack manifest. |
| `services/platform/employeePacks.js` | Pack definitions (e.g. `pack-construction-ai` — front-line "Derek"). |
| `services/platform/marketplaceInstallValidator.js` | Post-install resource verification. |
| `docs/architecture/MARKETPLACE_SCHEMA.md` | Tenant install documents under `companies/{id}/marketplaceInstalls/`. |

**Pilot note:** Construction marketplace pack is a **customer-facing AI employee**, not a substitute for configuring Sarah Finance/Ops/HR/Admin. Pilot preset should document optional pack install as a **module**, not a dependency for workforce Sarah.

### 12.4 Sarah context, prompts, tools

| Component | Role | Gap |
|-----------|------|-----|
| `services/sarah/sarahContext.js` | Tenant, role, permissions, `companyIndustry`, integrations, KB summary, workforce instructions. | No preset id/version; industry is a **string hint** in Admin context only. |
| `services/sarah/prompts/systemPrompt.js` | Base prompt + module focus via `buildWorkspaceContextHint`. | No per-preset instruction blocks. |
| `services/sarah/sarahOrchestrator.js` | Adds Finance/HR/Admin turn addenda. | Ops addendum policy file not present in tree at audit time — confirm on branch before Ops preset mapping. |
| `services/sarah/toolRegistry.js` | Central registry; filters by persona + Finance/HR/Admin policies + `canUseTool`. | **Correct pattern** — preset must plug in here only via code-enumerated capability IDs, not config tool names. |
| `financeSarahToolPolicy.js`, `hrSarahToolPolicy.js`, `adminSarahToolPolicy.js` | Module allow/deny lists. | Frozen for MVP; preset cannot override without separate change control. |

### 12.5 Permissions and tasks

| Component | Role |
|-----------|------|
| `services/auth/permissionsService.js` | `PERMISSION_MATRIX` — authoritative portal permissions. |
| `services/auth/financePermissionPolicy.js` | Finance API + Sarah finance tools. |
| `services/auth/taskPermissionPolicy.js` | Task CRUD and assignment rules (Ops-relevant). |

Preset role mappings must reference these keys only.

### 12.6 Knowledge

| Component | Role |
|-----------|------|
| `services/tenants/knowledgeService.js` | Tenant KB documents (used by pack install). |
| Sarah tool `searchCompanyKnowledge` | Retrieval scoped to tenant. |

Preset should declare **collection templates** ingested into tenant KB on activation (similar to pack knowledge seeding), with provenance metadata.

### 12.7 Workflows and tasks

| Component | Role |
|-----------|------|
| `services/automation/workflowRegistry.js` | Tenant automations. |
| `services/tenants/taskService.js` | Operational tasks (Ops Sarah domain). |

Construction pilot workflows should map to existing action types (`create_task`, `send_message`, etc.) from pack conversion logic.

### 12.8 Onboarding and modules

| Component | Role |
|-----------|------|
| `services/platform/onboardingService.js` | Multi-step onboarding including industry + optional pack. |
| `services/platform/onboardingOrchestrator.js` | Coordinates steps; passes `industryId`. |

Phase 1 can add a **preset selection** step or Settings UI without replacing onboarding.

### 12.9 Validation / versioning conventions

| Pattern | Reuse for presets |
|---------|-------------------|
| Marketplace pack semver + `marketplaceVersioning.js` | Preset semver + changelog documents. |
| `validatePackInstall` | Structural idea for `validateIndustryPresetActivation(companyId, presetId, version)`. |
| Sarah MVP scripts in `scripts/verify-sarah-*` | Extend with preset fixture tenants. |

---

## 13. Proposed canonical schema artefact (Phase 1)

**Location (proposed):** `shared/industryPresets/schema/industryPreset.schema.json`  
**Companion:** `shared/industryPresets/capabilities/platformCapabilities.json` — enumerated capability ids with class (`available`, etc.) maintained in **code**, not in tenant-editable storage.

**Preset packages (proposed):** `shared/industryPresets/presets/{presetId}/{version}/preset.json`

Minimal JSON skeleton:

```json
{
  "presetId": "construction-engineering",
  "name": "Construction & Engineering",
  "version": "1.0.0",
  "schemaVersion": "1.0.0",
  "industry": "construction",
  "jurisdictions": ["ZA", "global"],
  "status": "draft",
  "owner": "product-platform",
  "lastReviewedAt": "2026-10-22",
  "sarahMapping": {
    "finance": {
      "purpose": "Project billing, quotations, retention and subcontractor invoices within supported finance tools.",
      "capabilities": ["finance.quotations", "finance.invoices.read"],
      "instructionBlockIds": ["construction.finance.terminology"]
    },
    "operations": {
      "purpose": "Site tasks, milestones, contractor coordination via tasks and supported ops tools.",
      "capabilities": ["tasks.create", "tasks.assign"],
      "instructionBlockIds": ["construction.ops.siteWorkflows"]
    },
    "hr": {
      "purpose": "Workforce roster and approved HR workflows for site and office staff.",
      "capabilities": ["hr.roster.read"],
      "instructionBlockIds": ["construction.hr.safetyBriefing"]
    },
    "admin": {
      "purpose": "Cross-module coordination, onboarding checklist, compliance reminders (informational).",
      "capabilities": ["admin.workforceInstructions"],
      "instructionBlockIds": ["construction.admin.overview"]
    }
  },
  "modules": [],
  "roles": [],
  "workflows": [],
  "kpis": [],
  "knowledge": [],
  "compliance": [],
  "onboarding": { "checklist": [] },
  "integrations": [],
  "acceptance": { "automated": [], "manual": [] }
}
```

Instruction blocks live in `shared/industryPresets/instructions/{blockId}.md` and are compiled into prompts server-side after validation.

---

## 14. Validation contract (Phase 1)

**Module (proposed):** `services/platform/industryPresetValidator.js`

| Check | Method |
|-------|--------|
| JSON Schema | `ajv` or existing project validator against `industryPreset.schema.json`. |
| Capability ids | Each id ∈ `platformCapabilities.json` for deployed environment. |
| Permission keys | Each role permission ∈ union of `PERMISSION_MATRIX` + finance/task keys. |
| Workflow actions | Each action type ∈ automation engine supported set. |
| Tool names | **Forbidden** in preset except as documentation strings; if present, must match registry names and still pass Sarah policy filters (lint rule). |
| Integration types | Must match integration hub registry. |
| Status gate | Only `approved` presets activatable in production. |

**Activation API (proposed):** `POST /api/companies/:id/industry-preset/activate` — runs validator, writes pinned version to company doc, triggers optional KB seed job, returns validation report. No tool policy mutation.

---

## 15. Recommended pilot: Construction & Engineering

**Rationale:**

- Listed in Group A; onboarding already has `construction` → `pack-construction`.
- Exercises project/site vocabulary across Finance (quotes/invoices), Ops (tasks), HR (roster), Admin (coordination).
- Marketplace pack exists for optional **sales** use case — good test of "preset vs pack" separation.

**Pilot acceptance plan (summary):**

1. **Schema:** `construction-engineering` preset v1.0.0 validates in CI.
2. **Configuration:** Fixture tenant with preset pinned; `company.industry` / sector aligned.
3. **Runtime:** Each Sarah module receives correct instruction blocks; `companyIndustry` hint supplemented with preset name/version in context (read-only).
4. **Security:** Snapshot test — tool list for owner on Finance/Ops/HR/Admin surfaces **identical** to pre-preset baseline for same role.
5. **Capability honesty:** Sarah responses include configured limitations when user asks for unavailable workflows (e.g. site inspection photos without integration).
6. **Tenant isolation:** Two tenants, same preset — no cross-tenant knowledge leakage (automated KB scope test).
7. **Onboarding:** Checklist shows incomplete integration until WhatsApp verified (existing integration status pattern).
8. **Manual:** Product review of terminology glossary and compliance disclaimers.

Full gate checklist lives in [INDUSTRY_PRESET_ROADMAP.md](./INDUSTRY_PRESET_ROADMAP.md).

---

## 16. Dependencies and risks

| ID | Dependency / risk | Mitigation |
|----|-------------------|------------|
| R1 | **Dynamic tool grant from preset** | Schema lint forbids executable allowlists; capabilities map to code only. |
| R2 | **Marketplace pack conflated with preset** | Document and UI separate "Workforce Sarah preset" vs "Optional AI employee pack". |
| R3 | **Inconsistent industry ids** | Central alias table in preset registry; migrate onboarding/marketing gradually. |
| R4 | **Ops Sarah tool policy** | Confirm `operationsSarahToolPolicy` (or equivalent) on integration branch before Ops capability claims. |
| R5 | **Prompt injection via instruction blocks** | Treat blocks as trusted product content; version control + review; no tenant-supplied blocks in global preset files. |
| R6 | **KPI overclaim** | KPI renderer checks data freshness and required fields (finance analytics patterns). |
| R7 | **Compliance liability** | Preset compliance section is informational; activation requires recorded human review flag for regulated industries. |
| R8 | **Preset update breaks tenants** | Pin version; migration tool with diff report; no auto permission expansion. |
| R9 | **Large prompt bloat** | Inject summarised instruction blocks + RAG for knowledge collections, not full preset JSON. |
| R10 | **Phase scope creep** | Phase 1 limited to registry + validator + context hints + one preset; no 13-industry build. |

---

## 17. Smallest safe implementation step (Phase 1 entry)

**Recommended next step after Phase 0 sign-off:**

1. Add `shared/industryPresets/schema/industryPreset.schema.json` and `platformCapabilities.json` (capabilities reflect **current** MVP truth, mostly `configurable` / `extension-required` for construction-specific workflows).
2. Add `services/platform/industryPresetRegistry.js` (read-only load approved presets from disk or platform storage).
3. Add `services/platform/industryPresetValidator.js` + unit tests with invalid fixtures (unknown capability, unknown permission, forbidden tool allowlist field).
4. Add company fields in schema documentation and storage adapter: `industryPresetId`, `industryPresetVersion`, `industryPresetActivatedAt` (no activation API in production until manual gate).
5. Extend `buildSarahContext` / workforce addenda to append **validated instruction block summaries** when preset pinned — **without** changing `toolRegistry` filters.

Stop before: tenant self-serve activation in production, KB auto-ingest at scale, or workflow auto-provisioning.

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-10-22 | Initial master spec + Phase 0 read-only audit (ZIRICAI-INDUSTRY-PRESET-01). |
