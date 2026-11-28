# Sarah Tasks — ST-01 programme (UX-first)

**Status:** ST-01E engineering complete (pending Spencer item 6) · **ST-02 v1 live** · **ST-03 reminder series v1** (inbox slots per `reminderSchedule`).

## Product principles

1. **Evolve** the current six purple category cards — do not replace main navigation.
2. **Every task type** gets its own form, checklist, and completion workflow (not generic title/details).
3. **Three task kinds** (design + billing rules later): Reminder · Preparation · Execution.
4. **Completion** requires user confirm or authorised execution success — not “reminder fired”.
5. **Reliable scheduling** is ST-02+ (Firestore + server scheduler + push when app closed).

## Milestones

| ID | Scope | Deliverable |
|----|--------|-------------|
| ST-01A | Dashboard | Preparation tab, Sarah’s Next Actions, horizontal tabs |
| ST-01B | Forms | Type picker per category + dedicated forms (priorities 1–5) |
| ST-01C | Detail | Open task → detail, checklist, status actions |
| ST-01D | Templates | Before You Leave profiles, trip/interview prep plans |
| ST-01E | Gate | UX review + formal approval → unlock ST-02 |
| ST-02 | Engine | **v1 shipped** — Firestore tasks API, allowance, client sync (`/api/personal-sarah/tasks`) |
| ST-03 | Reminders | **v3 on prod** — per-slot delivery, server scheduler (~60s), FCM push; test matrix below |
| ST-UX-01 | Task workspace | **v1 shipped** — Assign to Sarah, per-task session, composer, typing/working |
| ST-UX-02 | Category forms | **v1 shipped** — organisation fields, execution approval rules, assign handoff |
| ST-UX-03 | Government directory | **v1 shipped** — SA dept/service form, government ack + approval path |
| ST-UX-04 | Workspace actions | **v1 shipped** — approval chips, complete/cancel, checklist, task notifications |
| ST-UX-03b | Network org bridge | **v1 shipped** — org typeahead, workspace Network matches, Discover deep link |
| ST-04 | Intelligence | Generated checklists, timelines, suggestions |
| ST-05 | Execution | Research, drafts, bookings with approval |
| ST-06 | Personalisation | Routines, templates, learning |

## Implementation priorities (ST-01B/D)

1. Before You Leave — reusable profiles, custom items, checklist completion  
2. Trip preparation — timeline + packing checklist  
3. Job interview — sections + mock-interview hook (chat)  
4. Meeting — travel time, attendees, multi-reminder (UX; server multi-fire ST-03)  
5. Shopping & applications — dedicated field sets (proto store until ST-02)

## Current prototype limits (honest UX copy)

- Unsigned / free create: local fallback or allowance block.  
- In-app chimes for extra meeting reminders while Sarah is open; server schedules inbox rows per slot.  
- ST-03+ still owns push-when-closed hardening and delivery history.

## ST-01B2 (pre sign-off)

- [x] Dedicated schemas for applications, shopping, personal, delegate, preparation subtypes  
- [x] Task detail: snooze, reschedule, reminder schedule display  
- [x] Meeting multi-reminder (client schedule; server multi-fire ST-03)  
- [x] Mock interview → Sarah Work chat with prompt  
- [x] Recurring reminder form polish (weekdays, until date)

## Approval checklist (ST-01E)

- [x] Category → type → form flows for all six categories (`SCHEMA_FORMS` + meeting/interview/trip/departure)  
- [x] Task detail + checklist progress (server `task-*` PATCH, progress bar)  
- [x] Before You Leave profiles editable (add/remove items, save profile)  
- [x] Dashboard Next Actions + Preparation tab  
- [x] Visual identity unchanged (purple / white)  
- [x] Spencer proceed → ST-03 engineering (UAT may run in parallel)

## Spencer UAT — test then fix

1. **Paid account** — Create interview prep → `task-*` id → refresh → checklist PATCH persists.  
2. **Meeting** — Two reminder offsets + travel → each slot should notify (inbox; push if device registered).  
3. **App open** — 15s poll: chime + Tasks list refresh when due.  
4. **App backgrounded** — Within ~60s of due time, OS push (requires notification consent + push device).  
5. **Snooze** on task detail → new time fires once.  
6. **Cancel** → task disappears from lists.  
7. **Free tier** — create blocked with clear allowance message.

Paste: task id, expected vs actual, screenshot of My Notifications if push fails.

## Spencer UAT — ST-UX-02 / 03 / 04 (after ST-01 checklist)

1. **Applications → Government service** — pick DHA + Smart ID → Assign → workspace opens; Sarah ack mentions department; lifecycle **awaiting approval** with plan.
2. **Go ahead** chip or “yes, go ahead” → Sarah working message; optional push/inbox row with deep link back to workspace.
3. **Job / university form** — organisation field present; assign → approval path for execution types.
4. **Mark task complete** in workspace composer row.
5. Tap a **Sarah Tasks** notification (or open from push `tasks/<taskId>`) → lands in task workspace.