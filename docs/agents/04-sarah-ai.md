# 04 — Sarah AI Agent

## Agent Name & Role

Owns Sarah — the conversational AI operating assistant with tool-calling orchestration in the Company Portal.

## Phase

**Phase 2 — AI Core**

## Responsibility

- Sarah orchestrator, context, memory, permissions, tool registry
- All tools under `services/sarah/tools/`
- API routes: `POST /api/sarah/chat`, `GET /api/sarah/tools`
- Portal Sarah UI (`sarah-chat.js`, `sarah-ui.js`)
- OpenAI function-calling loop and demo fallback mode
- Tool permission matrix mirroring portal roles

## Owns

- `services/sarah/` (entire folder)
- `js/portal/sarah/sarah-chat.js`
- `js/portal/sarah/sarah-ui.js`
- `docs/architecture/SARAH.md`
- `server.js` (Sarah route sections)
- Landing page Sarah widget behavior documented in SARAH.md (read-only for heuristic widget)

## Depends on

- **02 Authentication Agent** — user context and permissions
- **03 Company Workspace Agent** — companyId resolution
- **05 AI Employees Agent** — createEmployee tool
- **06 Knowledge Base Agent** — uploadKnowledge, trainAI tools
- **07 CRM Agent** — searchCRM tool

## Do NOT touch

- Core tenant repository or migration scripts
- Integration adapter implementations (connectWhatsApp delegates to Integration Agent)
- Marketplace pack install logic
- Admin console Sarah (future — document only)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Sarah AI Agent. Own services/sarah/ and js/portal/sarah/ only.

Read docs/architecture/SARAH.md and services/sarah/sarahOrchestrator.js.
List all tools in services/sarah/tools/ and mark stub vs live.

Tasks:
1. Replace stub tools (generateReport, etc.) with real service calls OR document deferral.
2. Ensure sarahMemory persists sessions (in-memory Map → Firestore strategy if specified).
3. Verify tool permission checks in services/sarah/permissions.js match js/portal/permissions.js.
4. Portal Sarah must invalidate hub cache after mutating tools (check sarah-ui.js).
5. Add tenant scope to /api/sarah/chat when not in demo mode.

Do NOT refactor tenant services or portal modules outside sarah/.
Return: tool inventory table (live/stub), API gaps, and UX issues found.
```

## Definition of Done

- [ ] All registered tools execute real tenant service calls (or explicitly marked future)
- [ ] Sarah chat respects role permissions server-side
- [ ] Portal UI streams/ displays tool results and navigation hints
- [ ] Memory strategy documented and implemented for multi-turn sessions
- [ ] Demo fallback only when `OPENAI_API_KEY` missing
- [ ] SARAH.md updated with tool status matrix

## Current status

**88% — Integrated with AI Core**

### Already built

- Full orchestrator with OpenAI function calling + rich heuristic demo fallback
- 17+ tools registered in `tools/index.js`
- `platformKnowledge.js` — comprehensive ZiricAI FAQ (shared with landing page)
- `createEmployee`, `uploadKnowledge`, `trainAI` wired to `aiCoreBridge` + tenant services
- Multi-turn session context (`lastAgentName`, `lastKnowledgeBaseId`) in `sarahMemory.js`
- Portal + landing Sarah share FAQ via `js/shared/platformKnowledge.js`
- Architecture docs with AI Core integration diagram

### Remaining work

- Session memory Firestore persistence (strategy documented)
- Super Admin Sarah UI marked **future**
- `generateReport`, some `connect*` tools remain stubs
- Vector semantic search for platform help (optional enhancement)
