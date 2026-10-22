# Sarah Ops — Core Capability Specification

| Field | Value |
|-------|--------|
| **Document ID** | SARAH-OPS-CORE-01 |
| **Version** | 1.0 |
| **Date** | 22 October 2026 |
| **Product** | ZiricAI — AI Business Operating System |
| **Employee** | Sarah Ops |
| **Status** | Functional specification for implementation planning |
| **Completion checklist** | [`SARAH_OPS_MVP_GATE.md`](./SARAH_OPS_MVP_GATE.md) |
| **Predecessor pattern** | [`SF_CORE_01_MVP_GATE.md`](./SF_CORE_01_MVP_GATE.md) (Sarah Finance) |

---

## 1. Executive summary

Sarah Ops is the **operational execution and coordination** AI employee within ZiricAI. She helps a business organise work, coordinate people, track tasks, identify delays, manage operational follow-ups, and ensure assigned work progresses toward completion.

Sarah Ops must go **beyond answering questions**. She must perform **supported operational actions** through ZiricAI's existing backend, using actual company records, authorised tools, and verifiable workflow states.

A business owner should be able to ask Sarah to create a task, assign it, update status, check overdue work, investigate a reported delay, and summarise completed work—and Sarah should **execute** supported actions rather than only explain how the user could do them.

### 1.1 Infrastructure (reuse — no duplicate systems)

Sarah Ops uses existing ZiricAI infrastructure:

| Component | Role |
|-----------|------|
| `taskService` | Authoritative task CRUD (`*ForAccess` for HTTP/Sarah) |
| Sarah `listTasks` / `createTask` | Read and create via tools |
| Portal task API | Updates (`updatePortalTask` → `updateTaskForAccess`) |
| `operations.js` | Operations portal — overview, task board, Sarah shell |
| Queue + `aiTaskExecutor` | AI-assigned task execution (separate pathway) |
| Auth, tenant membership, permissions | Server-enforced on every operation |

Sarah Ops must **not** introduce a duplicate task database, second lifecycle, or unnecessary orchestration framework.

**Repository anchor (confirm before coding):** see [Appendix A — Repository baseline](#appendix-a--repository-baseline-2026-10-22).

### 1.2 Product objective

Build a dependable core operational employee that can:

1. Understand operational workload from authorised data.
2. Create and organise work.
3. Assign tasks to authorised people.
4. Update and track progress.
5. Identify overdue work and **recorded** blockers.
6. Coordinate supported steps from request to completion.
7. Produce accurate operational reports.
8. Respect permissions and maintain traceable records.

### 1.3 Scope principle

This document describes the **long-term core capability model**. The **first release is the Sarah Ops MVP**, not the entire future Operations department.

Implement the smallest reliable set that proves Sarah can manage **real tasks** from the portal and through authorised AI tools. Advanced scheduling, industry processes, sophisticated automation, and resource optimisation remain **deferred** (Section 15).

---

## 2. Sarah Ops' role in ZiricAI

| AI employee | Primary responsibility |
|-------------|------------------------|
| Sarah Finance | Financial records, questions, supported finance workflows |
| **Sarah Ops** | **Operational execution, tasks, coordination, progress** |
| Sarah HR | Employee administration and HR |
| Sarah Admin | General administration and coordination |

Sarah Ops focuses on operational work; she is **not** a general-purpose employee with unrestricted access to every company system.

### 2.1 What Sarah Ops owns

Operational coordination of tasks and work items: assignment, progress, due dates, **recorded** blockers (where stored), and completion—via authorised tools only.

She may read other company information only when an **authorised tool** provides it and the read is needed for an approved operational task.

### 2.2 What Sarah Ops does not own

Sarah Ops does **not** independently own:

- Accounting, payments, or financial calculations (Sarah Finance).
- Employee records, payroll, or HR decisions (Sarah HR).
- General administration outside her permissions (Sarah Admin).
- Execution engine for every AI employee.
- Industry-specific operating procedures in the core release.
- Unrestricted access to external applications.

For cross-department work, Sarah identifies the dependency and coordinates an **authorised handover**—she does not perform the other department's work.

---

## 3. Core operating principles

### 3.1 Real data, not invented information

Retrieve company data through authorised backend tools. If a task does not exist, status cannot be retrieved, or no blocker is recorded, **disclose the limitation**.

**Never invent:** task IDs, assignments, completion, due dates, blockers, approvals, unsupported progress percentages, or success after failure.

### 3.2 Action over explanation

For supported actions, **execute** via tools (Section 7). Example: *"Create a task for Thabo to prepare the supplier report by Friday"* → resolve assignee from authorised users, resolve due date (company timezone), create via backend, verify persistence, confirm ID and fields. Ask focused clarifications when essential data is missing—do not guess.

### 3.3 One source of truth

`taskService` and persisted records are authoritative. Conversation history and model output must not override actual task state.

### 3.4 Tenant isolation

Every operation is scoped to the authenticated user's authorised company. Conversational `companyId` is not proof of access; the backend enforces tenant and permissions.

### 3.5 Planning vs execution

Plans may be proposed without writes. Execution requires an authorised tool and reporting of the **actual** outcome. Intention ≠ completed task.

### 3.6 Human accountability

Sarah assists authorised people; she does not bypass approvals, invent approvals, or silently perform consequential actions outside authority.

---

## 4. Core capability map (OPS-01 – OPS-06)

Long-term functional areas. **MVP subset** is defined in Section 15.

### OPS-01: Operations overview and intelligence

**Purpose:** Reliable view of current operational workload.

**Sarah should:** summarise by status; list by assignee; identify overdue; show due-in-period; flag unassigned where supported; summarise in-progress/completed; fetch by ID when supported; explain **recorded** blockers; compare periods only when data supports it; state source and limitations.

**Example questions:** *What is outstanding?* *Which tasks are overdue?* *What is Thabo working on?* *What blocked the supplier report?*

**Behaviour:** Distinguish not started, in progress, completed, overdue (derived), blocked **only when recorded**, unknown/unavailable. In progress + overdue can co-exist. Do not call overdue tasks "blocked"; do not treat missing data as proof of no work.

**MVP:** Real task retrieval and accurate summaries. Advanced analytics deferred.

### OPS-02: Task creation and management

**Purpose:** Turn requests into persisted tasks.

**Fields:** Use existing schema only (title, description, assignee, due date, status, id, tenant, metadata)—see Appendix A.

**Create workflow:** Parse request → extract fields → resolve assignee → normalise dates → `createTaskForAccess` → verify → confirm to user.

**Update workflow:** Identify task → permission check → validate patch → authorised update → confirm only after backend success.

**Cancel/delete:** Follow existing API contract only; no conversational deletion shortcuts.

**MVP:** List, create, **update via Sarah tool** (gap today), verify persistence and permissions.

### OPS-03: Assignment, ownership and progress tracking

Assign/reassign when permitted; show owner; list by assignee; report unassigned; update supported status; use timestamps when available.

**Assignment:** No assign-by-assumed-name; disambiguate duplicate names; no silent substitute assignees.

**Progress:** Assignee ≠ started; user saying "done" ≠ done unless authorised status change (or future evidence-based rules).

**MVP:** Existing schema (`open`, `in_progress`, `done`); portal and Sarah show consistent state.

### OPS-04: Operational workflow coordination

Conceptual sequence: request → create → assign → begin → progress → blocker (if recorded) → resolve → complete → report.

**No second workflow engine.** Multi-task requests: report partial success honestly.

**MVP:** Simple coordination through task records. Workflow designer / dependency graph deferred.

### OPS-05: Overdue work, blockers and follow-ups

Overdue from due date + incomplete status; due-soon lists; **recorded** blocker text (e.g. `notes` where no dedicated blocker field); unassigned summary; recommend next steps.

**Blockers:** Facts only when recorded. If none recorded, say the system has **no recorded blocker**—do not invent supplier/people/approval stories.

**Follow-ups:** MVP may recommend; automated send/escalate requires authorised integrations—do not simulate.

### OPS-06: Operational reporting and accountability

Reports grounded in retrieved scope: current summary, outstanding, overdue, by assignee, completed in period, blocker summary, manager status snapshot.

Distinguish counts, derived overdue, user context, estimates, and incomplete retrieval.

**MVP:** Basic reports from real tasks. Productivity scoring and predictive analytics deferred.

---

## 5. Task lifecycle and data integrity

Conceptual states for **acceptance language** (code wins—see Appendix A):

| Concept | Meaning |
|---------|---------|
| Open / not started | Recorded, not begun (`open`) |
| In progress | Work begun (`in_progress`) |
| Completed | Authorised complete (`done`) |
| Overdue | Derived: incomplete and past due date |
| Blocked | Recorded in supported fields (e.g. notes)—not inferred from overdue |
| Cancelled / archived | Only if implementation supports |

### 5.1 Required integrity behaviour

Reject invalid IDs/payloads; verify tenant; validate assignees; reject unsupported transitions; prefer idempotency where available; clear errors; never map API failure to success; preserve audit fields per service contract.

---

## 6. User roles and permissions

Logical categories (use **actual** ZiricAI roles/permissions—`canViewTasks`, `canCreateTasks`, task PATCH policy):

| Logical role | Expected access |
|--------------|-----------------|
| Operations viewer | View permitted tasks and summaries |
| Task contributor | View/update within authority |
| Operations manager | Assignments and statuses in scope |
| Company owner | Owner permissions on tasks |
| Sarah Ops | Tools + **caller's** effective permissions only |
| Platform administrator | Platform controls only via existing MC policy |

### 6.1 Mandatory rules

Server-side checks on every read/write; no UI-only auth; no bypass of portal API rules; tenant from trusted auth; no privilege escalation via chat; no cross-tenant disclosure; no permissive fallback on denial.

Reuse existing helpers—no parallel permission framework.

---

## 7. Sarah Ops tool architecture

### 7.1 Reuse (inspect before coding)

- `services/tenants/taskService.js`
- `services/sarah/tools/listTasks.js`, `createTask.js`, `taskToolCommon.js`
- Portal: `PATCH` via `updateTaskForAccess` (routes in customer ops / portal API)
- `js/portal/modules/operations.js`
- Surface: `portal-operations` (`services/sarah/portalSarahSurfaces.js`)
- `services/operations/aiTaskExecutor.js`, queue workers

### 7.2 Logical tool capabilities

| Capability | Purpose | MVP |
|------------|---------|-----|
| `listTasks` | Scoped task list | **Required** (exists) |
| `createTask` | Persist new task | **Required** (exists) |
| `updateTask` | Patch supported fields | **Required** (implement) |
| `getTask` | Single task | Only if list insufficient |
| Overview / overdue reads | Summaries | Required **behaviour**; may derive from `listTasks` |
| Recorded blockers | Read notes/metadata | Conditional on schema |
| AI execution | Queue + executor | **Separate verification** |

Names follow existing registration conventions; do not duplicate equivalent tools.

### 7.3 Tool execution contract

Validate input → resolve auth/tenant → enforce permission → mutate via service layer → structured truthful result → Sarah reply matches tool outcome.

### 7.4 `updateTask` requirements (MVP priority)

Portal updates exist; Sarah tool **does not** (baseline gap). New tool must:

- Accept task id + supported patch keys only.
- Validate values and transitions (`TASK_STATUSES`).
- Confirm caller may update that task.
- Enforce tenant isolation via `updateTaskForAccess`.
- Return persisted task or structured failure; never ignore invalid fields silently; never create a duplicate instead of updating.

---

## 8. Tool policy and prompt guardrails

### 8.1 Dedicated operations policy

`portal-operations` needs an explicit allowlist (Finance-style `financeSarahToolPolicy.js`): default-deny for non-ops tools; no automatic inheritance of full owner catalogue on Operations chat.

### 8.2 Prompt guardrails

Sarah Ops instructions must state:

- Role: operational task coordination.
- Facts via authorised tools only.
- No invented tasks, statuses, assignments, blockers, or success before tool OK.
- No Finance/HR tools unless explicitly authorised cross-functional workflow.
- Clarify ambiguous task id, assignee, due date.
- Distinguish recommendation vs completed operation.
- Honest partial failure reporting.
- No promised auto follow-ups without integration.

### 8.3 Tool selection

Factual question → read tool(s). Supported change → mutation tool. Multi-step → verify each step. Unsupported → explain limit and dependency.

---

## 9. End-to-end workflows (acceptance scenarios)

| ID | Workflow | MVP priority |
|----|----------|--------------|
| **A** | Create and assign (resolve user, due date, persist, confirm) | **P0** |
| **B** | Update progress (identify task, transition, `updateTask`, verify) | **P0** |
| **C** | Identify overdue (scope, timezone, exclude done, derive overdue) | **P0** |
| **D** | Investigate blocker (read recorded facts; no invented causes) | **P0** |
| **E** | Daily ops summary (counts, overdue, due today, gaps disclosed) | **P1** |
| **F** | Multi-task coordination (partial success reporting) | **P1** |
| **G** | AI-assigned execution (queue + executor; separate tests) | **P1 verify** |

Detailed steps are as in product brief Sections 9.A–9.G; failures must not claim success.

---

## 10. Portal and user experience

Primary workspace: `operations.js` — overview, task board, Sarah shell.

- Overview/KPIs from real data; distinguish loading / empty / error / populated.
- Task board: view, create, update, status change, assignments, due dates, visible errors.
- Sarah: NL create/list/update/status/overdue/summary; **no mock success**.
- **Consistency:** Sarah ↔ portal share same records and compatible permissions after refresh.

---

## 11. AI task execution vs task management

| | Task management | AI task execution |
|--|-----------------|-------------------|
| **Means** | Sarah create/list/update | Queue + `aiTaskExecutor` |
| **Claim** | Record state changed | Only if executor recorded outcome |

Creating *"Prepare supplier report"* does not imply the report was generated externally. Verify executor separately (`verify-ai-task-execution-suite.mjs`).

---

## 12. Auditability, reliability, error handling

Use existing activity/audit on tasks where present (`taskActivity.js`). Handle: not found, ambiguous match, invalid date/status/assignee, permission denied, tenant mismatch, service error, partial multi-op success. Retries: use existing idempotency where available. Verification must show which tools ran and backend outcome.

---

## 13. Operational KPIs (MVP-simple)

| KPI | Basis |
|-----|--------|
| Total / open / in-progress / completed | Task status in scope |
| Overdue | Incomplete + past `dueAt` |
| Unassigned | Missing assignee when field supported |
| Due today | Due date + timezone |
| Recorded blockers | Explicit fields (e.g. notes)—not inferred |

Do not show KPIs without supportable data. Advanced scoring deferred.

---

## 14. Acceptance testing strategy

### 14.1 Core acceptance cases

| ID | Test | Expected result |
|----|------|-----------------|
| OPS-AT-001 | List tasks | Real tasks in authorised scope |
| OPS-AT-002 | Create task | Persisted + identifier returned |
| OPS-AT-003 | Assign task | Valid tenant user recorded |
| OPS-AT-004 | Update status | Supported change persisted |
| OPS-AT-005 | Update due date / field | Validated change persisted |
| OPS-AT-006 | Read after update | New persisted state |
| OPS-AT-007 | Query overdue | Correct derivation |
| OPS-AT-008 | Nonexistent blocker question | No invented blocker |
| OPS-AT-009 | Nonexistent task | Not found reported |
| OPS-AT-010 | Invalid assignee | Reject; no substitute |
| OPS-AT-011 | Unauthorised mutation | Server rejects |
| OPS-AT-012 | Cross-tenant | No leak or write |
| OPS-AT-013 | Service error | Failure reported, not success |
| OPS-AT-014 | Sarah create → portal read | Same record |
| OPS-AT-015 | Portal update → Sarah read | Updated state |
| OPS-AT-016 | Partial multi-task failure | Split reporting |
| OPS-AT-017 | AI-assigned task execute | Executor contract |
| OPS-AT-018 | Overview KPIs | Match authoritative tasks |

### 14.2 Verification commands (repository-confirmed)

Run and archive under `docs/architecture/evidence/` with date:

```bash
node scripts/verify-sarah-operations-tasks-local.mjs
node scripts/smoke-operations-centre-v1-local.mjs --memory-only
node scripts/verify-ai-task-execution-suite.mjs
# Optional (Firebase + local API):
node scripts/verify-sarah-operations-portal-live.mjs
```

**Suite:** `node scripts/verify-sarah-operations-acceptance-suite.mjs` (chains policy, tasks-local, ops smoke, AI executor).

Unit tests: `test/sarah-view-finance-transactions.test.mjs` is Finance; add/extend ops tool tests alongside implementation.

### 14.3 Acceptance evidence

Per test: ID, preconditions, action, expected, actual, pass/fail, output reference, defect ID if fail.

**Local verify ≠ commit ≠ deploy ≠ production acceptance.**

---

## 15. Sarah Ops MVP — immediate implementation scope

### Required now

- Real overview/task reads via tools.
- Real task creation via Sarah.
- **`updateTask` Sarah tool** (existing service).
- **`portal-operations` tool policy** + prompt guardrails.
- No invented statuses/blockers/success claims.
- Sarah ↔ portal consistency.
- Core permission and tenant isolation tests.
- Consolidated acceptance runner + archived evidence.
- Separate AI executor verification recorded.
- Updated [`SARAH_OPS_MVP_GATE.md`](./SARAH_OPS_MVP_GATE.md).

### Explicitly deferred

Workflow automation builders; dependency graphs; auto reminders/escalations; workforce scheduling; predictive analytics; productivity scoring; industry templates; deep external ops integrations; multi-Sarah cross-execution; duplicate task engines.

**Still fix** security/correctness defects in existing paths even when feature is deferred.

---

## 16. MVP completion gate

Sarah Ops is ready for handover when Section 15 required items pass, OPS-AT-001–018 (MVP subset as agreed in gate) pass with evidence, AI executor verified separately, deferred work documented, and production deploy remains a **separate approved** step.

**Stop:** Do not implement deferred Section 15 items to "complete" this spec. Proceed to **Sarah HR** MVP.

---

## 17. Future industry-specific extensions

Construction, education, mining, retail, healthcare (non-clinical), hospitality, logistics, property, funeral, automotive, faith organisations, professional services—**future configuration**, not MVP. Must not weaken core security or task integrity.

---

## 18. Implementation instructions for Cursor

1. Read this spec and [`SARAH_OPS_MVP_GATE.md`](./SARAH_OPS_MVP_GATE.md).
2. Inspect task schema, `taskService`, Sarah tools, `portal-operations`, `operations.js`, auth/permissions, queue/executor tests.
3. Map requirements to **implemented vs gap** (Appendix A is starting point only).
4. Reuse services; implement **Section 15 only**.
5. Add tests for persistence, update permissions, policy, portal consistency, truthful failures.
6. Run verification; archive output; update MVP gate disposition.
7. Stop when MVP gate passes.

Do not commit, push, or deploy without reviewing branch and change set. No production without explicit approval.

**Final objective:** Sarah Ops reliably manages real operational work through existing infrastructure; then freeze core scope and start Sarah HR.

---

## Appendix A — Repository baseline (2026-10-22)

*Confirm against current branch before implementation; supersede in gap matrix when evidence exists.*

| Item | Baseline |
|------|----------|
| Task statuses | `open`, `in_progress`, `done` (`taskPermissionPolicy.js`) |
| Client-mutable patch keys | `title`, `description`, `status`, `priority`, `dueAt`, `assigneeUid`, `notes`, AI assignee fields, etc. |
| Dedicated `blocker` field | **Not present** — use `notes` / description for recorded blockers until schema extends |
| Sarah tools | `listTasks`, `createTask`, **`updateTask`** registered |
| Ops tool policy | **`operationsSarahToolPolicy.js`** (`portal-operations` allowlist) |
| Surface | `portal-operations` defined; stickiness/policy TBD |
| Portal updates | `updatePortalTask` in `js/portal/api.js` |
| Permissions on tools | `canViewTasks`, `canCreateTasks`; updates via task access in service |
| Verify scripts | `verify-sarah-operations-tasks-local.mjs`, `smoke-operations-centre-v1-local.mjs`, `verify-ai-task-execution-suite.mjs`, optional `verify-sarah-operations-portal-live.mjs` |
| Finance MVP status | Local gate met — [`SF_CORE_01_MVP_GATE.md`](./SF_CORE_01_MVP_GATE.md) |

---

## Appendix B — Document map

| Document | Role |
|----------|------|
| **SARAH-OPS-CORE-01** (this file) | Full functional vision + principles + acceptance catalogue |
| **SARAH_OPS_MVP_GATE.md** | Short checklist, commands, stop condition, evidence disposition |
| **CUSTOMER_OPS.md** | Adjacent CRM/inbox/appointments (not Ops task core) |
