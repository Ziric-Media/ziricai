# 07 — CRM Agent

## Agent Name & Role

Owns tenant CRM: contacts, leads, customers, notes, tasks, timeline, and CRM UI in portal and admin.

## Phase

**Phase 3 — Customer Operations**

## Responsibility

- CRM tenant service (contacts, leads, customers)
- Legacy `customerService.js` bridge (phone-normalized IDs)
- Lead scoring and CRM workspace configuration
- Portal `customers` module and admin customers UI/detail
- WhatsApp upsert customer flow
- CRM templates from marketplace packs

## Owns

- `services/customerService.js` (legacy)
- `services/tenants/crmService.js`
- `services/storage/seedDemoCustomers.js`
- `js/portal/modules/customers.js`
- `js/admin/modules/customers.js`
- `js/admin/modules/customers-ui.js`
- `js/admin/modules/customers-detail.js`
- `js/admin/services/customers.js`
- `server.js` (customer/CRM API routes)

## Depends on

- **01 Platform Architecture Agent** — customer subcollection paths
- **03 Company Workspace Agent** — `ensureCrmWorkspace`
- **08 Conversations Agent** — customer creation from messages

## Do NOT touch

- WhatsApp webhook routing (Integration Agent)
- Analytics aggregates (Analytics Agent)
- Appointment scheduling (Appointments Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the CRM Agent. Own contacts, leads, customers, notes, tasks, timeline.

Audit services/customerService.js, services/tenants/crmService.js, and CRM API routes in server.js.
Review js/portal/modules/customers.js and js/admin/modules/customers*.js.

Tasks:
1. Map all CRM reads/writes: legacy customers/{phone} vs companies/{id}/customers.
2. Implement or wire createContact/createLead tenant APIs if missing from UI.
3. Ensure leadScore, stages, tags flow from conversationIntelligence into CRM.
4. Portal customer detail: notes, tasks, timeline from tenant paths.
5. Remove demo-only customer lists when Firestore has data.

Do NOT modify integration adapters or analytics engine.
Return: entity coverage table (contact/lead/customer), API list, migration blockers.
```

## Definition of Done

- [ ] Full CRM entity model: contacts, leads, customers with promotion flow
- [ ] Customer profile API tenant-scoped with notes, tasks, timeline
- [ ] Portal + admin customer UIs use live API (not demo-only)
- [ ] Phone normalization consistent (`normalizePhone`)
- [ ] Marketplace CRM templates applied on pack install
- [ ] Legacy flat `customers/` read path deprecated

## Current status

**55% — Partial**

### Already built

- Rich legacy `customerService.js` (profile, notes, tasks, timeline)
- `crmService.js` with contact/lead/customer service classes
- Admin customers module with detail view
- Portal customers module
- Demo seed script
- Intelligence hooks (`conversationIntelligence.js`) for lead scoring

### Remaining work

- `listCustomers()` still calls **legacy adapter primarily**
- Contacts/leads subcollections **underused** vs flat customers
- No dedicated leads pipeline UI in portal
- CRM workspace settings stored but not editable in settings module
- Cross-tenant admin customer views need collection group indexes
