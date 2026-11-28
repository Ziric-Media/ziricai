# ST-05 — Task execution with approval (v1)

**Status:** v1 shipped

## Flow

1. **Plan approval** — `awaiting_approval` → user **go ahead**
2. **Execution** — Sarah posts an **artifact** (research, draft, booking plan, application pack)
3. **Lifecycle** → `awaiting_review`
4. **Submit approval** — user says **approve submit** → artifact `approved`, lifecycle `submitted_pending_external`
5. **Safety** — no payments, no government/portal auto-submit in v1

## Artifacts

Stored on task `artifacts[]`: `{ type, title, body, status, createdAt }`

## Modes

`executionModeForTask` — research | draft | booking | payment | application | delegate | assist

## Follow-on

- LLM-enriched research (Open Web tool)
- Real booking APIs
- Metered execution credits (Sarah Work alignment)