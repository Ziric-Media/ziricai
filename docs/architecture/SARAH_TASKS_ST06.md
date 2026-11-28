# ST-06 — Personalisation (v1)

**Status:** v1 shipped

## Server

- Doc: `personalSarah/{uid}/memories/task_personalisation_v1`
- **Templates** — save from task, create new task + assign + intelligence
- **Learning** — increment counts on task complete; **routines** = types completed ≥2×
- **Intelligence hook** — reapplies saved template checklist; suggestion when count ≥2

## API

| Method | Path |
|--------|------|
| GET | `/api/personal-sarah/tasks/personalisation` |
| POST | `/api/personal-sarah/tasks/:id/save-template` |
| POST | `/api/personal-sarah/tasks/from-template` |
| POST | `/api/personal-sarah/tasks/from-routine` |

## Client

- Hub **Your routines** strip
- Templates tab → **Saved by you**
- Workspace → **Save as template**

## Not in v1

- Scheduled recurrence (cron reminders)
- Cross-device template sync audit
- LLM-learned preferences