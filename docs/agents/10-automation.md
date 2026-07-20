# 10 — Automation Agent

## Agent Name & Role

Owns workflow automation engine, triggers, actions, builder UI, and event-driven execution.

## Phase

**Phase 4 — Automation**

## Responsibility

- Automation engine (`handleEvent`, `runWorkflow`)
- Trigger matcher and action executor
- Workflow registry (tenant automations)
- Legacy `workflowService.js` and templates
- Portal `automation` module and admin automation builder
- Automation event handler on event bus
- Sarah `createAutomation` tool

## Owns

- `services/automation/` (automationEngine, triggerMatcher, actionExecutor, workflowRegistry)
- `services/workflows/workflowService.js`
- `services/workflows/workflowTemplates.js`
- `services/workflows/workflowEngine.js`
- `services/tenants/automationService.js`
- `services/events/automationEventHandler.js`
- `js/portal/modules/automation.js`
- `js/admin/modules/automation.js`
- `js/admin/modules/automation-builder.js`
- `js/admin/modules/automation-templates.js`
- `js/admin/modules/automation-integrations.js`
- `js/admin/services/workflows.js`
- `docs/architecture/ANALYTICS_AUTOMATION.md`

## Depends on

- **01 Platform Architecture Agent** — event bus
- **08 Conversations Agent** — message/conversation triggers
- **07 CRM Agent** — CRM update actions
- **11 Notifications Agent** — notify actions

## Do NOT touch

- Integration adapter send implementation (call Integration Hub API)
- Analytics aggregation (Analytics Agent)
- Marketplace pack install (Marketplace Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Automation Agent. Own workflow engine, triggers, actions, builder UI.

Read docs/architecture/ANALYTICS_AUTOMATION.md, services/automation/automationEngine.js, workflowRegistry.js.
Compare legacy workflowService.js vs tenant automationRegistry.

Tasks:
1. Migrate in-memory workflows to companies/{id}/automations subcollection.
2. Ensure automationEventHandler receives all relevant EventTypes from eventBus.
3. Portal automation module: list workflows, enable/disable, view run history.
4. Admin automation-builder: save to tenant registry via API.
5. Implement core actions: send_message, update_crm, create_task, notify (wire to services).

Do NOT rewrite integration adapters or analytics aggregates.
Return: action inventory (implemented/stub), storage migration plan, UI gaps.
```

## Definition of Done

- [ ] Workflows persisted under tenant `automations` + `automationRuns`
- [ ] Event triggers match and execute without infinite loops
- [ ] Portal + admin builder saves/loads tenant workflows
- [ ] Run history visible with success/error details
- [ ] Marketplace pack workflows install correctly
- [ ] Legacy workflowService deprecated or synced

## Current status

**65% — Partial**

### Already built

- Full automation engine with run logging
- Trigger matcher + action executor scaffold
- Workflow registry with upsert/list/run APIs
- Admin automation builder, templates, integrations modules
- Portal automation module
- Event handler registered at startup (QA verified)
- Workflow templates for industries

### Remaining work

- Legacy `workflowService.js` still **in-memory**
- Some action types may be **stubs** in actionExecutor
- Portal run history UI incomplete
- No visual DAG validation in builder
- Automation success rate in analytics uses defaults when no runs
