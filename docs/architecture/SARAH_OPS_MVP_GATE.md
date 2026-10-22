# Sarah Ops — MVP completion gate (checklist)

**Spec (full vision + OPS-AT cases):** [`SARAH_OPS_CORE_CAPABILITY_SPEC.md`](./SARAH_OPS_CORE_CAPABILITY_SPEC.md) (SARAH-OPS-CORE-01 v1.0)  
**Programme sequence:** Sarah Finance MVP → **Sarah Ops MVP** → Sarah HR → Sarah Admin  
**Freeze (2026-10-22):** Core Ops scope frozen at local MVP gate; no further feature expansion until HR MVP progresses. Branch target: `feature/sarah-ops-mvp` (base `d93963d`).  
**Finance reference:** [`SF_CORE_01_MVP_GATE.md`](./SF_CORE_01_MVP_GATE.md)

This file is the **short stop condition and evidence register**. Implementation detail lives in the spec (Sections 7–8, 15, 18).

---

## What Sarah Ops must do (MVP in one line)

Perform **real** task read/create/update on authorised tenant data; report overdue and **recorded** facts honestly; enforce permissions; stay consistent with the Operations portal—**without** a duplicate task system.

---

## MVP capability checklist (maps to spec OPS-01 – OPS-06)

| # | MVP capability | Done when |
|---|----------------|-----------|
| 1 | Operations overview | Sarah summaries use `listTasks` (or equivalent); limits stated |
| 2 | Create & manage tasks | `createTask` + **`updateTask`** tool; persistence verified |
| 3 | Assignment & progress | Assignee resolution; statuses `open` / `in_progress` / `done` |
| 4 | Coordination | Multi-task requests report partial success honestly |
| 5 | Overdue & blockers | Derived overdue; no invented blockers (OPS-AT-008) |
| 6 | Controls | Tenant isolation, role denials, tool policy on `portal-operations` |

---

## Acceptance gate (must pass locally)

| Gate | Spec IDs | Evidence (run fresh; archive under `docs/architecture/evidence/`) |
|------|----------|----------------------------------------------------------------------|
| Task list/create/permissions | OPS-AT-001, 002, 010, 011 | `node scripts/verify-sarah-operations-tasks-local.mjs` |
| Task update via Sarah | OPS-AT-004, 005, 006 | *Add with `updateTask` tool + tests* |
| Overdue / no fake blocker | OPS-AT-007, 008 | Probe or extended local tests |
| Portal service layer | OPS-AT-014, 015, 018 | `node scripts/smoke-operations-centre-v1-local.mjs --memory-only` |
| Cross-tenant / errors | OPS-AT-012, 013 | Extend tests per Finance F-016 pattern |
| AI execution (separate path) | OPS-AT-017 | `node scripts/verify-ai-task-execution-suite.mjs` |
| Optional live chat + API | OPS-AT-014 (chat) | `node scripts/verify-sarah-operations-portal-live.mjs` (credentials) |

**Runner:** `scripts/verify-sarah-operations-acceptance-suite.mjs`

**Not required for MVP:** OPS-AT-016 full automation until multi-task chat probe exists; industry workflows; workflow designer; auto messaging.

---

## Known gaps (baseline 2026-10-22 — confirm before claiming pass)

| Gap | MVP action |
|-----|------------|
| No `updateTask` Sarah tool | Implement per spec §7.4 |
| No `operationsSarah` tool policy | Implement per spec §8.1 |
| No ops prompt block in `systemPrompt.js` | Implement per spec §8.2 |
| No consolidated acceptance runner | Add suite script |
| No archived PASS bundle for Ops | Run commands above; save stdout |

---

## Verification commands

```bash
node scripts/verify-sarah-operations-acceptance-suite.mjs
```

Individual steps: `verify-sarah-operations-tool-policy.mjs`, `verify-sarah-operations-tasks-local.mjs`, `smoke-operations-centre-v1-local.mjs --memory-only`, `verify-ai-task-execution-suite.mjs`.

Optional: `node scripts/verify-sarah-operations-portal-live.mjs`

---

## Stop condition

Sarah Ops MVP is **complete** when:

1. Spec **Section 15 “Required now”** is implemented.
2. Core gate rows above **pass** with dated evidence.
3. [`SARAH_OPS_MVP_GATE.md`](./SARAH_OPS_MVP_GATE.md) disposition table updated (pass/fail/deferred).
4. Deferred items remain in spec §15 only—not implemented for “completeness.”

**Then:** Freeze Sarah Ops scope; start **Sarah HR** MVP spec/gate.

**Production-accepted:** Not claimed until explicit deploy approval and pilot smoke (same ladder as Finance).

---

## Gate disposition (update after each evidence run)

| Area | Status | Notes |
|------|--------|-------|
| Spec published | **Done** | SARAH-OPS-CORE-01 v1.0 |
| `listTasks` / `createTask` | **Verified (local)** | 2026-10-22 acceptance suite |
| `updateTask` | **Verified (local)** | Sarah tool + taskService |
| Tool policy + prompts | **Verified (local)** | `operationsSarahToolPolicy.js`, system prompt |
| Acceptance suite runner | **Done** | `verify-sarah-operations-acceptance-suite.mjs` PASS 2026-10-22 |
| AI executor | **Verified (local)** | Chained in suite |
| Portal Operations | **Partial** | Service smoke PASS; live chat optional |
| Behavioural chat (OPS-AT-008…) | **Open** | Loopback chat probes not yet archived |
| Production-accepted | **No** | |
