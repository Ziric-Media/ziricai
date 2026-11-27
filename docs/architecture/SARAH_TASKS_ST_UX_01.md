# ST-UX-01 — Task assignment & conversation workspace

**Status:** Implemented (v1) · programme branch `programme/sarah-u1-u5-r0`

## Principle

Every assigned task gets its own **Sarah session** (`mode: task`), lifecycle state, and **conversation workspace** (composer + details + progress).

## Lifecycle states

| State | Meaning |
|-------|---------|
| `draft` | Form not yet assigned (client-only proto) |
| `assigned` | Submitted to Sarah |
| `acknowledging` | Sarah typing acknowledgment |
| `awaiting_approval` | Plan proposed; user must go-ahead |
| `in_progress` | Sarah working |
| `awaiting_user` | Sarah waiting for user input |
| `completed` | Done |
| `cancelled` / `failed` | Terminal |

## Sarah phases (UI)

`typing` · `working` · `idle` — drive 3-dot bubbles in task workspace.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/personal-sarah/tasks` | Create; `assignToSarah: true` (default) runs assign |
| POST | `/api/personal-sarah/tasks/:id/assign` | Assign existing task |
| POST | `/api/personal-sarah/tasks/:id/chat` | User message in task conversation |
| GET | `/api/personal-sarah/tasks/:id/workspace` | Task + session messages |

## Approval rules (v1)

- **Reminder** — assign, acknowledge, help via chat; no execution approval.
- **Preparation** — interactive chat; no gate on checklist.
- **Applications / delegate / execution** — plan + **awaiting_approval** until user says go-ahead.

## Follow-on (ST-UX-02+)

Government directory, Network org Sarah bridge, deep-link push to `taskId`.