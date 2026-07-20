# 11 — Notifications Agent

## Agent Name & Role

Owns tenant in-app notifications, alert delivery, portal notification drawer, and push hooks.

## Phase

**Phase 4 — Automation**

## Responsibility

- Notification tenant service (create, list, mark read)
- Legacy messaging notification push
- Portal notifications module and header drawer
- Activity feed integration
- Automation "notify" action target
- Future push notification hooks (mobile roadmap)

## Owns

- `services/tenants/notificationService.js`
- `services/messaging/messagingService.js` (notification sections)
- `js/portal/modules/notifications.js`
- `js/portal/modules/activity.js`
- `services/portal/portalDemo.js` (PORTAL_DEMO_NOTIFICATIONS)
- Portal shell notification drawer in `js/portal/main.js`

## Depends on

- **01 Platform Architecture Agent** — notifications subcollection
- **03 Company Workspace Agent** — activity on provision
- **10 Automation Agent** — notify actions

## Do NOT touch

- Email/SMS outbound (Integration Agent)
- Analytics event recording (Analytics Agent)
- Firebase Cloud Messaging setup (future — document only)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Notifications Agent. Own in-app alerts and portal notification UX.

Audit services/tenants/notificationService.js, js/portal/modules/notifications.js, portal main drawer.
Check hub data for notifications in portalDataHub.js / dataService.js.

Tasks:
1. Replace PORTAL_DEMO_NOTIFICATIONS fallback with listTenantNotifications API.
2. Add mark-read / mark-all-read API routes if missing.
3. Wire automation notify action to createNotification().
4. Portal drawer: unread badge count synced with hub prefetch.
5. Activity module distinguishes system vs user events.

Do NOT modify conversation pipeline or integration email adapter.
Return: API routes added, demo fallback removal status, UX checklist.
```

## Definition of Done

- [ ] Notifications CRUD tenant-scoped
- [ ] Portal drawer shows live unread count
- [ ] Mark read updates Firestore + hub cache invalidation
- [ ] Automation actions create notifications
- [ ] Activity feed shows provision/conversation/system events
- [ ] Demo notifications only in explicit demo mode

## Current status

**55% — Partial**

### Already built

- `notificationService.js` with create, listUnread, markRead
- Dual-read from legacy adapter
- Portal notifications module + drawer in main.js
- Activity module in portal lazy loader
- Provisioning pushes activity + notifications
- Schema + index for read + createdAt

### Remaining work

- Hub still merges **demo notification arrays**
- No email/push delivery — in-app only
- Admin console lacks notification management
- Notification preferences in settings module not wired
- No real-time subscription — hub TTL refresh only
