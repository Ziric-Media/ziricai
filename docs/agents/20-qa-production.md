# 20 — QA & Production Agent

## Agent Name & Role

Owns quality assurance, smoke tests, production checklist, deployment validation, and regression coverage.

## Phase

**Phase 19 — Production**

## Responsibility

- Production deployment checklist maintenance
- Platform QA reports and smoke test scripts
- Health check endpoints validation
- Environment variable documentation (`.env.example`)
- End-to-end pipeline verification (webhook → analytics)
- Regression test harness (expand beyond `auth-test.html`)
- Release readiness sign-off criteria

## Owns

- `docs/deployment/PRODUCTION_CHECKLIST.md`
- `docs/architecture/PLATFORM_QA_REPORT.md`
- `.env.example`
- `auth-test.html`
- `firebase.json`, `.firebaserc`, `firestore.rules` (deployment validation)
- `package.json` scripts (test/dev/start)
- Future: `tests/` or `scripts/smoke/` directory

## Depends on

- **All specialist agents 01–19** — features to validate
- **01 Platform Architecture Agent** — env and storage backend
- **02 Authentication Agent** — strict mode verification
- **12 Integration Agent** — webhook smoke tests

## Do NOT touch

- Feature implementation in tenant services (file bugs for owning agents)
- Marketplace pack content definitions
- Marketing landing pages

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the QA & Production Agent. Own checklists, smoke tests, and release validation.

Read docs/deployment/PRODUCTION_CHECKLIST.md and docs/architecture/PLATFORM_QA_REPORT.md.
Run: node server.js (verify start), curl /api/health, /api/portal/hub/demo-central-motors, /api/integrations/health.

Tasks:
1. Create scripts/smoke/smoke-test.js covering health, hub, marketplace, webhook verify, Sarah tools list.
2. Update PRODUCTION_CHECKLIST.md with actual test commands and expected responses.
3. Verify .env.example includes all required vars from server startup.
4. Document manual QA matrix for portal modules (dashboard, conversations, marketplace install).
5. Update PLATFORM_QA_REPORT.md with dated run results.

Do NOT implement new product features — only tests, scripts, and docs.
Return: smoke test script path, pass/fail results, release blockers list.
```

## Definition of Done

- [ ] Automated smoke script runnable via `npm run smoke` (or documented command)
- [ ] PRODUCTION_CHECKLIST.md complete and verified
- [ ] `.env.example` matches all server env vars
- [ ] PLATFORM_QA_REPORT updated after each release candidate
- [ ] Critical paths tested: auth, webhook, hub, marketplace install, Sarah chat
- [ ] Known issues logged with owning agent references

## Current status

**45% — Partial**

### Already built

- PRODUCTION_CHECKLIST.md with env vars and deploy commands
- PLATFORM_QA_REPORT.md (2026-07-19) with pipeline verification
- `.env.example`, firebase deploy config
- Server starts without SyntaxError (QA verified)
- Smoke endpoints documented: health, hub, marketplace, integrations
- `auth-test.html` manual auth page

### Remaining work

- **No automated test suite** (only 1 auth-test.html)
- No CI pipeline in repo
- No `npm test` or `npm run smoke` script
- Load testing not performed
- Security penetration testing not documented
- Rollback procedure not scripted
