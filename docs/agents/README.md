# ZiricAI Specialist Agents — Index

22 Cursor subagent specifications for the ZiricAI platform (20 specialists + CTO + DevOps).  
Master roadmap: [`../ROADMAP.md`](../ROADMAP.md)

## Quick Start

1. Pick an agent from the table below (follow recommended order in ROADMAP)
2. Open its spec file
3. Copy the **Cursor subagent prompt** section
4. Run via Cursor Task tool
5. Update **Current status** in the agent file when done

---

## Agent Index

| # | Agent | Phase | File | Status | % |
|---|-------|-------|------|--------|---|
| 01 | Platform Architecture | 1 — Foundation | [01-platform-architecture.md](./01-platform-architecture.md) | Partial | 75% |
| 02 | Authentication | 1 — Foundation | [02-authentication.md](./02-authentication.md) | Partial | 60% |
| 03 | Company Workspace | 1 — Foundation | [03-company-workspace.md](./03-company-workspace.md) | Partial | 65% |
| 04 | Sarah AI | 2 — AI Core | [04-sarah-ai.md](./04-sarah-ai.md) | Partial | 70% |
| 05 | AI Employees | 2 — AI Core | [05-ai-employees.md](./05-ai-employees.md) | Partial | 65% |
| 06 | Knowledge Base | 2 — AI Core | [06-knowledge-base.md](./06-knowledge-base.md) | Partial | 60% |
| 07 | CRM | 3 — Customer Ops | [07-crm.md](./07-crm.md) | Partial | 55% |
| 08 | Conversations | 3 — Customer Ops | [08-conversations.md](./08-conversations.md) | Partial | 60% |
| 09 | Appointments | 3 — Customer Ops | [09-appointments.md](./09-appointments.md) | Partial | 35% |
| 10 | Automation | 4 — Automation | [10-automation.md](./10-automation.md) | Partial | 65% |
| 11 | Notifications | 4 — Automation | [11-notifications.md](./11-notifications.md) | Partial | 55% |
| 12 | Integration | 5 — Integrations | [12-integration.md](./12-integration.md) | Partial | 60% |
| 13 | Billing | 5 — Integrations | [13-billing.md](./13-billing.md) | Partial | 45% |
| 14 | Analytics | 6 — Intelligence | [14-analytics.md](./14-analytics.md) | Partial | 65% |
| 15 | Reporting | 6 — Intelligence | [15-reporting.md](./15-reporting.md) | Partial | 25% |
| 16 | Marketplace | 7 — Marketplace | [16-marketplace.md](./16-marketplace.md) | Partial | 70% |
| 17 | Dashboard | 8 — Customer Dashboard | [17-dashboard.md](./17-dashboard.md) | Partial | 70% |
| 18 | Super Admin | 9 — Admin | [18-super-admin.md](./18-super-admin.md) | Partial | 65% |
| 19 | Performance | 19 — Production | [19-performance.md](./19-performance.md) | Partial | 40% |
| 20 | QA & Production | 19 — Production | [20-qa-production.md](./20-qa-production.md) | Partial | 45% |
| 21 | CTO Audit | Final | [21-cto-audit.md](./21-cto-audit.md) | Complete | 100% |
| 22 | DevOps & Deployment | 11 — Production Ops | [22-devops-deployment.md](./22-devops-deployment.md) | Not Started | 0% |

**Weighted platform average (agents 01–20): ~58%** · **CTO audit score: 52/100**

---

## Phase Groupings

### Phase 1 — Foundation
[01 Platform Architecture](./01-platform-architecture.md) · [02 Authentication](./02-authentication.md) · [03 Company Workspace](./03-company-workspace.md)

### Phase 2 — AI Core
[04 Sarah AI](./04-sarah-ai.md) · [05 AI Employees](./05-ai-employees.md) · [06 Knowledge Base](./06-knowledge-base.md)

### Phase 3 — Customer Operations
[07 CRM](./07-crm.md) · [08 Conversations](./08-conversations.md) · [09 Appointments](./09-appointments.md)

### Phase 4 — Automation
[10 Automation](./10-automation.md) · [11 Notifications](./11-notifications.md)

### Phase 5 — Integrations
[12 Integration](./12-integration.md) · [13 Billing](./13-billing.md)

### Phase 6 — Intelligence
[14 Analytics](./14-analytics.md) · [15 Reporting](./15-reporting.md)

### Phase 7 — Marketplace
[16 Marketplace](./16-marketplace.md)

### Phase 8 — Customer Dashboard
[17 Dashboard](./17-dashboard.md)

### Phase 9 — Admin
[18 Super Admin](./18-super-admin.md)

### Phase 19 — Production
[19 Performance](./19-performance.md) · [20 QA & Production](./20-qa-production.md)

### Final
[21 CTO Audit](./21-cto-audit.md)

### Phase 11 — Production Ops
[22 DevOps & Deployment](./22-devops-deployment.md)

---

## Recommended Next 3 Agents (Gap-Based)

| Priority | Agent | Rationale |
|----------|-------|-----------|
| **1** | [22 DevOps & Deployment](./22-devops-deployment.md) | CTO audit P0: no CI, smoke automation, or deploy/rollback runbooks — blocks production |
| **2** | [02 Authentication](./02-authentication.md) | Unauthenticated provisioning routes; `TENANT_SCOPE_ENFORCEMENT=lax` by default |
| **3** | [01 Platform Architecture](./01-platform-architecture.md) | Legacy flat collections still serve webhook/CRM; run `migrate:tenants` cutover |

---

## Agent File Template

Each agent file contains:

- Agent Name & Role
- Phase
- Responsibility (bullets)
- Owns (paths)
- Depends on (other agents)
- Do NOT touch (boundaries)
- Cursor subagent prompt (copy-paste for Task tool)
- Definition of Done (checklist)
- Current status (built vs remaining)

---

## Related Documentation

| Doc | Purpose |
|-----|---------|
| [ROADMAP.md](../ROADMAP.md) | Master plan, dependency graph, execution waves |
| [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) | System diagram |
| [architecture/MIGRATION.md](../architecture/MIGRATION.md) | Legacy→tenant migration |
| [deployment/PRODUCTION_CHECKLIST.md](../deployment/PRODUCTION_CHECKLIST.md) | Go-live checklist |
