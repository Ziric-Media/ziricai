# 18 — Super Admin Agent

## Agent Name & Role

Owns the ZiricAI Super Admin Console: cross-tenant operations, company management, and platform command center.

## Phase

**Phase 9 — Admin**

## Responsibility

- Super Admin HTML shell and bootstrap
- Admin module registry and router
- Cross-tenant company list and selector
- Command center and platform operations dashboards
- Admin auth guard (superadmin role only)
- Platform metrics, supervisor reviews, provisioning oversight

## Owns

- `ziric-superadmin-console.html`
- `js/admin/` (entire folder except shared `js/auth.js`)
- `css/admin-dashboard.css`
- `services/operations/platformOperations.js`
- `services/operations/commandCenterService.js`
- `services/intelligence/aiSupervisor.js`
- `register-admin.html`, `superadmin-register.html`

## Depends on

- **01 Platform Architecture Agent** — multi-tenant data model
- **02 Authentication Agent** — superadmin role enforcement
- **16 Marketplace Agent** — platform marketplace management

## Do NOT touch

- Company Portal modules (`js/portal/`) — separate product surface
- Tenant-scoped business logic implementation (delegate to tenant services)
- Production deployment scripts (QA Agent)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Super Admin Agent. Own ziric-superadmin-console.html and js/admin/.

Audit js/admin/main.js, router.js, moduleRegistry.js, auth-guard.js.
Review command-center.js, companies.js, platformOperations.js, aiSupervisor.js.

Tasks:
1. Replace DEMO_COMPANIES fallback with live listCompanies from Firestore/API when available.
2. Company selector scopes all admin API calls with selected companyId or platform-wide mode.
3. Command center dashboard loads getCommandCenterDashboard + platform metrics APIs.
4. Ensure non-superadmin users redirected to company portal (mirror portal auth-guard).
5. Document admin module map in js/admin/core/moduleRegistry.js.

Do NOT refactor portal BOS or tenant service internals.
Return: module inventory, demo fallback removal plan, API gaps.
```

## Definition of Done

- [ ] Only superadmin role accesses admin console
- [ ] Company selector loads live tenant list
- [ ] Command center shows platform-wide metrics
- [ ] All admin modules registered in moduleRegistry
- [ ] AI Supervisor reviews visible in admin UI
- [ ] Provisioning oversight (create company, install pack) from admin

## Current status

**65% — Partial**

### Already built

- Full admin SPA: dashboard, command center, companies, marketplace, agents, knowledge, conversations, customers, automation, analytics, billing, settings
- Module registry scaffold
- Platform operations + command center services
- AI Supervisor service for quality reviews
- Admin auth guard with superadmin check
- Shared UI utilities with portal (`js/admin/ui.js`)

### Remaining work

- Bootstrap still seeds **DEMO_COMPANIES** immediately
- Firestore company list may **hang** — timeout fallback documented in main.js
- Sarah in Super Admin marked **future**
- Cross-tenant analytics views incomplete
- No audit log UI for platform operations
