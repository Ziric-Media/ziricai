# Sarah Tasks — ST-01 programme (UX-first)

**Status:** ST-01 in progress · **ST-02 blocked until ST-01E sign-off** (Spencer / Astra).

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
| ST-02 | Engine | **In progress** — Firestore tasks API, allowance, client sync (`/api/personal-sarah/tasks`) |
| ST-03 | Reminders | Server scheduling, push, snooze, history |
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

- Proto tasks: `localStorage` + meeting reminders via live API only.  
- Multi-reminder, snooze on task detail, and closed-app delivery land in ST-02/ST-03.

## ST-01B2 (pre sign-off)

- [x] Dedicated schemas for applications, shopping, personal, delegate, preparation subtypes  
- [x] Task detail: snooze, reschedule, reminder schedule display  
- [x] Meeting multi-reminder (client schedule; server multi-fire ST-03)  
- [x] Mock interview → Sarah Work chat with prompt  
- [x] Recurring reminder form polish (weekdays, until date)

## Approval checklist (ST-01E)

- [ ] Category → type → form flows for all six categories  
- [ ] Task detail + checklist progress  
- [ ] Before You Leave profiles editable  
- [ ] Dashboard Next Actions + Preparation tab  
- [ ] Visual identity unchanged (purple / white)  
- [ ] Spencer go for ST-02 technical brief