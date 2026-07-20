# 09 — Appointments Agent

## Agent Name & Role

Owns tenant appointment scheduling: service layer, APIs, calendar UI, and Sarah bookAppointment tool.

## Phase

**Phase 3 — Customer Operations**

## Responsibility

- Appointment CRUD in tenant subcollection
- Upcoming appointments queries with status filters
- Sarah `bookAppointment` tool integration
- Portal calendar/scheduling module (to be built)
- Google Calendar / M365 connector hooks (via Integration Agent)
- Analytics events for appointment booked/cancelled

## Owns

- `services/tenants/appointmentService.js`
- `services/sarah/tools/bookAppointment.js`
- `services/integrations/connectors/googleCalendarAdapter.js` (appointment sync only)
- Future: `js/portal/modules/appointments.js` (not yet in lazyLoader)
- `server.js` (appointment API routes — to be added)

## Depends on

- **07 CRM Agent** — customerId linkage
- **08 Conversations Agent** — booking intents from messages
- **12 Integration Agent** — calendar connectors
- **14 Analytics Agent** — appointment metrics

## Do NOT touch

- Marketplace pack workflow definitions (Automation Agent)
- Billing for paid appointments (Billing Agent)
- Dashboard KPI widgets (Dashboard Agent — consume API only)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Appointments Agent. Backend service exists; UI and API routes are the gap.

Read services/tenants/appointmentService.js and services/sarah/tools/bookAppointment.js.
Check js/portal/core/lazyLoader.js — no appointments module exists yet.

Tasks:
1. Add REST routes: list/create/update/cancel appointments scoped by companyId.
2. Create js/portal/modules/appointments.js with calendar/list views.
3. Register module in lazyLoader, router, permissions, company-portal.html sidebar.
4. Wire bookAppointment Sarah tool to appointmentService (not stub).
5. Publish AppointmentBooked events to analytics per metricsRegistry.js.

Do NOT modify CRM customer list or integration webhook router.
Return: API spec, UI wireframes description, and files created.
```

## Definition of Done

- [ ] REST API for appointment CRUD tenant-scoped
- [ ] Portal appointments module with upcoming list + create form
- [ ] Sarah bookAppointment creates real appointment records
- [ ] Cancel/reschedule updates status and notifies customer (optional SMS)
- [ ] Analytics tracks appointments metric
- [ ] Firestore index for status + scheduledAt queries

## Current status

**35% — Partial**

### Already built

- `appointmentService.js` with list/create/update/cancel/listUpcoming
- Schema + index defined in FIRESTORE_SCHEMA (`appointments` subcollection)
- Sarah `bookAppointment` tool file exists
- Analytics registry includes `AppointmentBooked` metric
- Marketplace workflows reference appointment keywords
- Landing page marketing mentions appointments (not functional)

### Remaining work

- **No portal module** in `lazyLoader.js` MODULE_IDS
- **No API routes** in `server.js` for appointments
- Google Calendar connector is **stub**
- No admin appointments view
- No customer-facing confirmation messages on book/cancel
