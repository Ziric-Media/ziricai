# 22 — DevOps & Deployment Agent

## Agent Name & Role

**DevOps & Deployment Agent** — owns production infrastructure, CI/CD, environment management, monitoring, and release operations for ZiricAI.

## Phase

**Phase 11 — Production Ops**

## Responsibility

- Firebase Hosting configuration and deploy pipelines
- Netlify/Vercel (or alternate static host) setup when not using Firebase Hosting alone
- Cloud Functions / server runtime deployment (Express on VM, Cloud Run, or Firebase Functions adapter)
- Environment variable management (`.env.example`, secrets in CI, prod vs staging)
- CI/CD pipelines (GitHub Actions under `.github/workflows/`)
- Database backup strategy (Firestore export schedules, restore drills)
- Monitoring, uptime checks, and alerting (health endpoints, synthetic probes)
- Error logging and crash reporting (structured logs, Sentry/Datadog hooks)
- Security scanning (dependency audit, SAST, secrets scan in CI)
- Production deployment runbooks and release management (semver tags, changelogs)
- Rollback procedures (hosting revert, Firestore rules rollback, env pin)
- Database migration script execution in controlled windows (`scripts/migrate-*`)

## Owns

- `firebase.json`
- `.firebaserc`
- `.github/workflows/` (create and maintain)
- `docs/deployment/` (runbooks, env docs, rollback guides)
- `scripts/migrate-*` (execution orchestration, not business logic — Agent 01 owns script content)
- `.env.example` (sync with server startup vars — coordinate with Agent 20)
- Deployment configs (PM2 ecosystem, Docker, Cloud Run manifests when added)
- Production hosting rewrites and SSL/domain documentation

## Depends on

- **[01 Platform Architecture](./01-platform-architecture.md)** — storage backend, tenant paths, migration strategy
- **[20 QA & Production](./20-qa-production.md)** — smoke tests, production checklist, release sign-off criteria

## Do NOT touch

- Tenant business logic in `services/tenants/`
- Feature UI modules (`js/portal/`, `js/admin/`)
- Firestore schema design (Agent 01) — only deploy rules/indexes
- Auth permission matrix (Agent 02) — only enforce env vars in prod
- Marketplace pack content (Agent 16)

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the DevOps & Deployment Agent. Own CI/CD, hosting, env vars, monitoring, and production releases.

Read docs/deployment/PRODUCTION_CHECKLIST.md, docs/architecture/CTO_AUDIT_REPORT.md, and .env.example.
Read firebase.json, server.js startup env usage, and docs/architecture/MIGRATION.md.

Tasks:
1. Create .github/workflows/ci.yml: npm install, node server import check, optional smoke against /api/health.
2. Create .github/workflows/deploy-firebase.yml (or document manual deploy): firestore rules+indexes, hosting.
3. Add scripts/smoke/smoke-test.js + npm run smoke (coordinate with Agent 20 checklist).
4. Document rollback: revert hosting, pin STORAGE_BACKEND, restore Firestore export.
5. Add monitoring section to docs/deployment/ — uptime probe on /api/health, log aggregation pattern.
6. Sync .env.example with every process.env read in server.js and services/core/tenantContext.js.
7. Document production values: NODE_ENV=production, STORAGE_BACKEND=firestore, TENANT_SCOPE_ENFORCEMENT=strict.

Do NOT implement product features. Infrastructure, scripts, and deployment docs only.
Return: workflow paths, smoke command, prod env checklist, rollback steps documented.
```

## Definition of Done

- [ ] `.github/workflows/ci.yml` runs on PR/push (install + server start/import check)
- [ ] `npm run smoke` documented and runnable against local or staging URL
- [ ] `.env.example` matches all server-required variables (verified against codebase)
- [ ] `docs/deployment/` includes rollback runbook and migration execution guide
- [ ] Firebase deploy documented: rules, indexes, hosting (or alternate host documented)
- [ ] Monitoring/uptime/error-logging approach documented with owner hooks
- [ ] Production secrets never committed; CI uses GitHub secrets pattern documented
- [ ] Release checklist ties to Agent 20 PRODUCTION_CHECKLIST.md

## Current status

**0% — Not Started**

### Already built (scaffold from other agents)

- `docs/deployment/PRODUCTION_CHECKLIST.md` — env vars, Firebase deploy commands, webhook setup
- `.env.example`, `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
- `scripts/migrate-demo-to-tenants.js` with `npm run migrate:tenants`
- `package.json` scripts: `dev`, `start`, `migrate:tenants`
- Server static caching for `NODE_ENV=production` in `server.js`
- CTO audit identifies missing CI, smoke automation, and unauthenticated prod routes as blockers

### Remaining work

- **No `.github/workflows/`** in repository
- **No automated smoke test script** (`npm run smoke` missing)
- **No PM2/Docker/Cloud Run** production process definition
- **No backup/restore runbook** for Firestore
- **No monitoring or crash reporting** integration
- **No security scanning** in CI
- **Rollback procedure** documented only at high level in PRODUCTION_CHECKLIST
- **Platform provisioning routes** need network/auth hardening before public deploy (see CTO audit P0)
