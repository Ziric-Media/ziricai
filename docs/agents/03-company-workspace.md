# 03 — Company Workspace Agent

## Agent Name & Role

Owns tenant company lifecycle: creation, provisioning, branding, onboarding, and workspace settings.

## Phase

**Phase 1 — Foundation**

## Responsibility

- Company root document CRUD under `companies/{companyId}`
- Provisioning orchestration (agents, CRM, KB, workflows, notifications)
- Onboarding wizard flow and industry selection
- Portal company context, branding, and team bootstrap
- Workspace settings blobs in tenant `settings/`
- Link generation for provisioned resources

## Owns

- `services/tenants/companyService.js`
- `services/platform/provisioningService.js`
- `services/platform/onboardingService.js`
- `services/portal/portalDemo.js` (company/branding demo data)
- `services/portal/portalDataHub.js`
- `js/onboarding/main.js`, `js/onboarding/api.js`
- `onboarding.html`
- `js/portal/core/dataService.js` (company/hub prefetch)
- `company-portal.html` (company shell metadata only)

## Depends on

- **01 Platform Architecture Agent** — tenant repository and schema
- **02 Authentication Agent** — owner UID and membership on create

## Do NOT touch

- Sarah orchestrator internals
- Marketplace pack definitions (Marketplace Agent)
- Channel adapter configuration (Integration Agent)
- Super Admin multi-company selector logic (Super Admin Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Company Workspace Agent. Own tenant company lifecycle only.

Read services/tenants/companyService.js, services/platform/provisioningService.js, services/platform/onboardingService.js.
Review js/onboarding/ and js/portal/auth-guard.js demo profile behavior.

Tasks:
1. Trace provisionCompany() end-to-end: what subcollections are created?
2. Replace demo-central-motors hardcoding with real profile.companyId from Firestore.
3. Ensure onboarding completion calls provisionOnboarding and saves branding/settings.
4. Verify GET /api/portal/hub/:companyId returns live company metadata (not only demo).
5. Document provisioning checklist in docs/architecture/PORTAL_BOS.md if gaps found.

Do NOT modify Sarah tools, marketplace registry, or integration adapters.
Return: provisioning flow diagram, blockers for real tenants, and files changed.
```

## Definition of Done

- [x] New company creates `companies/{id}` with required fields per FIRESTORE_SCHEMA
- [x] Provisioning seeds aiEmployees, knowledgeBase, CRM workspace, starter workflows
- [x] Onboarding wizard completes without demo profile fallback in production mode
- [x] Portal loads branding from tenant doc (primaryColor, logo, favicon)
- [x] `portalDataHub` serves unified snapshot for authenticated tenant
- [x] Activity + notification pushed on provision events

## Current status

**92% — Complete (core workspace)**

### Already built

- `provisioningService.js` — full workspace graph: company, departments, owner, agent, KB, CRM, analytics, billing, automation templates
- `companyService.js` — CRUD, suspend/archive, settings subcollection (branding + general)
- `departmentService.js` — CRUD + default department seed
- `userService.js` — team list, invite stub, role update
- `workspaceService.js` + `portalDataHub.js` — workspace metadata in hub snapshot
- `onboardingService.js` — provision on start, branding/settings on complete
- Portal auth loads real `profile.companyId`; demo fallback only in lax mode
- Settings workspace overview tab with nav links
- `docs/architecture/WORKSPACE.md`

### Remaining work

- Admin UI for company suspend/archive (Super Admin Agent 18)
- Firestore production persistence when billing unblocked
- Email delivery for team invites (Integration Agent)
- Industry pack install edge cases for packs marked `installable: false`
