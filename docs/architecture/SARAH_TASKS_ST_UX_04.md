# ST-UX-04 — Workspace actions & task notifications

**Status:** v1 shipped

## Workspace

- Quick **Go ahead** / **Not yet** when `awaiting_approval`
- **Mark complete** and **Cancel task**
- **Checklist** toggles on Progress tab (PATCH `checklist` + `progress`)
- Disabled composer when completed/cancelled

## Notifications

| Trigger | Inbox + push | deepLink |
|---------|----------------|----------|
| Assign with approval plan | Yes | `tasks/{id}` |
| User go-ahead → Sarah working reply | Yes | `tasks/{id}` |
| PATCH complete / cancel | Yes | `tasks/{id}` |

My Notifications and FCM `sarah_task` open the task workspace.

## Prefs

Task pushes use OS alert (no separate toggle v1); respects quiet hours via shared push path where applicable.