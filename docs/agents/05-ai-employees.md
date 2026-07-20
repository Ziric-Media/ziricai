# 05 — AI Employees Agent

## Agent Name & Role

Owns tenant-scoped AI agent/employee CRUD, defaults, prompts, and portal/admin agent management UI.

## Phase

**Phase 2 — AI Core**

## Responsibility

- AI employee service with dual-write to legacy `agents` adapter
- Default agent selection (`isDefault` flag)
- System prompt templates and model configuration
- Portal `agents` module and admin `agents` module
- Provisioning agent creation via marketplace and onboarding
- Link agents to knowledge bases and conversations

## Owns

- `services/tenants/aiEmployeeService.js`
- `js/portal/modules/agents.js`
- `js/admin/modules/agents.js`
- `js/admin/services/agents.js`
- `prompts/systemPrompt.js`
- `services/platform/employeePacks.js`
- Legacy adapter agent methods in `services/storage/memoryAdapter.js`, `firestoreAdapter.js`

## Depends on

- **01 Platform Architecture Agent** — `aiEmployees` subcollection
- **03 Company Workspace Agent** — provisioning on company create
- **06 Knowledge Base Agent** — `knowledgeBaseId` linkage

## Do NOT touch

- Sarah orchestrator loop (Sarah AI Agent)
- OpenAI reply generation in message worker (Conversations Agent)
- Marketplace catalog definitions (Marketplace Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the AI Employees Agent. Own aiEmployeeService and agent UI modules only.

Audit services/tenants/aiEmployeeService.js, js/portal/modules/agents.js, js/admin/modules/agents.js.
Trace provisionAgent() in provisioningService.js.

Tasks:
1. Ensure list/save/delete agents use tenant path companies/{id}/aiEmployees first.
2. Portal agents module: CRUD UI wired to API (not demo-only data).
3. Default agent resolution (getDefaultAiEmployee) used by conversation pipeline.
4. Align system prompt editor with prompts/systemPrompt.js and per-agent overrides.
5. Document agent fields in FIRESTORE_SCHEMA if missing.

Do NOT modify Sarah orchestrator or marketplace registry packs.
Return: API endpoints needed/added, UI gaps, dual-write status.
```

## Definition of Done

- [ ] CRUD for AI employees via tenant-scoped API
- [ ] Portal and admin UIs load/save real Firestore data in production mode
- [ ] Default agent used for inbound message routing
- [ ] Agent links to knowledge base ID
- [ ] Legacy adapter dual-write documented with removal date
- [ ] Model + systemPrompt editable per agent

## Current status

**85% — Integrated with AI Core**

### Already built

- Tenant CRUD API: `GET/POST/PATCH/DELETE /api/companies/:companyId/ai-employees`
- `aiEmployeeService` — primary path `companies/{id}/aiEmployees` with legacy dual-write
- Role system prompt templates in `services/ai-core/employeePrompts.js`
- `createAiEmployee`, `findAiEmployeeByNameOrRole`, `getDefaultAiEmployee`
- Default agent resolution for `messageWorker` via `aiCoreBridge`
- Each agent links to `knowledgeBaseId` (`kb-{companyId}`)
- Portal `agents.js` loads from tenant API (demo fallback when empty)
- Sarah `createEmployee` tool creates via `aiCoreBridge` with KB auto-provisioned
- Marketplace pack install provisions agents + KB link

### Remaining work

- Portal/admin full CRUD UI (create/edit/delete buttons still disabled in portal)
- Agent performance metrics per employee
- Legacy `agents/` root collection removal timeline
- Agent versioning / publish workflow
