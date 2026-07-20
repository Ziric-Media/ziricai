# 16 — Marketplace Agent

## Agent Name & Role

Owns Industry Pack catalog, install wizard, versioning, and marketplace UI in portal and admin.

## Phase

**Phase 7 — Marketplace**

## Responsibility

- Marketplace registry and pack manifests
- Industry pack service (install, update, rollback)
- Marketplace installer and versioning
- Employee pack bundles
- Portal and admin marketplace modules
- Pack-driven provisioning (agents, KB, workflows, CRM, analytics, reports)

## Owns

- `services/platform/marketplaceRegistry.js`
- `services/platform/marketplaceTemplate.js`
- `services/platform/industryPackService.js`
- `services/platform/marketplaceInstaller.js`
- `services/platform/marketplaceVersioning.js`
- `services/platform/employeePacks.js`
- `js/portal/modules/marketplace.js`
- `js/admin/modules/marketplace.js`
- `docs/architecture/MARKETPLACE.md`
- `docs/architecture/MARKETPLACE_SCHEMA.md`

## Depends on

- **03 Company Workspace Agent** — target tenant for install
- **05 AI Employees Agent** — pack agents
- **06 Knowledge Base Agent** — pack documents
- **10 Automation Agent** — pack workflows
- **07 CRM Agent** — pack CRM templates

## Do NOT touch

- AI Supervisor scoring logic (`services/intelligence/aiSupervisor.js` — separate future agent scope)
- Third-party AI Store publisher portal (future roadmap only)
- Payment for paid packs (Billing Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Marketplace Agent. Own industry pack catalog, install wizard, and marketplace UI.

Read docs/architecture/MARKETPLACE.md and MARKETPLACE_SCHEMA.md.
Audit marketplaceRegistry.js, industryPackService.js, runInstallWizard flow.

Tasks:
1. Verify GET /api/marketplace/catalog and installed/:companyId return consistent data.
2. Portal marketplace: browse, detail, install with progress feedback; invalidate hub after install.
3. Ensure install creates agents, KB docs, workflows, CRM templates, analytics seed, reports.
4. Implement checkForUpdates + applyUpdate UX in portal.
5. Document pack ID aliases and versioning in MARKETPLACE_SCHEMA.md.

Do NOT modify Sarah orchestrator or integration adapters.
Return: pack inventory count, install test results, UI gaps.
```

## Definition of Done

- [ ] Catalog API serves all industry packs with categories
- [ ] Install wizard provisions all pack components idempotently
- [ ] Portal + admin marketplace browse/install/update flows work
- [ ] Installed packs list per tenant with version info
- [ ] Reviews/ratings API functional (submitReview)
- [ ] Pack rollback documented and testable

## Current status

**88% — Near complete**

### Already built

- Extensive marketplace registry (~700 lines) with 4+ industry packs
- Install wizard via `runInstallWizard` → provisioning chain with **post-install validation**
- Workflows provisioned to automation engine (`workflowRegistry`) — visible in portal Automation module
- Versioning + update check APIs
- Portal + admin marketplace modules with verified install summary
- Architecture docs + schema
- Review submission scaffold

### Remaining work

- Third-party AI Store is **future roadmap only**
- Update/rollback UX in portal incomplete
- Paid pack checkout not wired to Billing Agent
- Enterprise SSO/SCIM items documented as future in registry comments
