# Sarah App — Production Deployment Readiness

**Phase:** 1 (after Gate 2 U0 sign-off)  
**Audit date:** 2026-11-04  
**Do not execute steps until authorized.**

---

## 1. Current deployment evidence

| Component | Evidence | Last known state |
|-----------|----------|------------------|
| **Railway API** | [sarah-app-u3-deploy-2026-11-04.json](../audit/sarah-app-u3-deploy-2026-11-04.json) | Deployments `1e7bb31b…` include **U1–U3** only |
| **Netlify Sarah** | Same audit | Site **`ziricai-sarah`**, URL https://ziricai-sarah.netlify.app |
| **Company Portal** | Same audit | **app.ziricai.com** restored after mistaken deploy |
| **U4 / U5 / R0 API** | Git + local tests | **Not confirmed on Railway** — requires redeploy from commit containing routes |
| **Custom domain** | SARAH_APP_DEPLOYMENT.md | **`sarah.ziricai.com` pending** |

---

## 2. Pre-deploy repository checklist

| # | Task | Owner | Done |
|---|------|-------|------|
| R1 | Commit all Sarah U1–U5 + R0 + docs to `main` (or release branch) | Dev | ☐ |
| R2 | Reconcile `main` with `origin/main` (behind 7) without losing production fixes | Dev | ☐ |
| R3 | Run full Sarah test suite locally | Dev | ☐ |
| R4 | Verify `api/app.js` mounts consumer, network, conversations, revenue routes | Dev | ☐ |
| R5 | Confirm no accidental changes to WhatsApp gateway env for Client Zero / Central Motors | Ops | ☐ |

---

## 3. Railway API deployment

| # | Task | Notes |
|---|------|-------|
| A1 | Deploy from approved commit | Include U4–U5 + R0 |
| A2 | Verify `GET /api/health` | Public liveness |
| A3 | Smoke (authenticated): `POST /api/users/bootstrap` | Consumer token |
| A4 | Smoke: `GET /api/discover/companies` | After bootstrap |
| A5 | Confirm `STORAGE_BACKEND` / Firestore credentials | Production persistence for tenant mirror |
| A6 | `OPENAI_API_KEY` | Optional; demo fallbacks if absent |
| A7 | `SARAH_NETWORK_PILOT_COMPANY_IDS` | Default `smilemore-demo` |

**Routes to verify post-deploy:**

- `/api/users/*`, `/api/personal-sarah/*`, `/api/personal-knowledge/*`
- `/api/sarah-network/*`, `/api/user-conversations/*`, `/api/discover/companies`
- `/api/revenue/catalogue/public`, `/api/revenue/config/public` (read-only)

---

## 4. Netlify Sarah App site

| # | Task | Reference |
|---|------|-----------|
| N1 | Site linked to repo; base dir `users/` | [users/netlify.toml](../../users/netlify.toml) |
| N2 | Build: `cd .. && npm ci && node scripts/prepare-sites.js users` | prepare-sites.js |
| N3 | Env: Firebase client vars, `API_BASE_URL` empty (proxy) | SARAH_APP_DEPLOYMENT.md |
| N4 | Deploy after `prepare-sites` includes latest `js/users` | |
| N5 | **Do not** point `users/` build at `ziricai-app` site | Incident lesson |

---

## 5. Firebase

| # | Task |
|---|------|
| F1 | Authorized domains: `sarah.ziricai.com`, `ziricai-sarah.netlify.app` |
| F2 | `firebase deploy --only firestore:rules` (consumer paths) |
| F3 | Confirm Auth providers unchanged for existing portal users |

---

## 6. DNS

| Type | Name | Target |
|------|------|--------|
| CNAME | `sarah` | `ziricai-sarah.netlify.app` (or Netlify alias UI) |

Apply **after** green Netlify build.

---

## 7. Environment variables (summary)

| Variable | Sarah relevance |
|----------|-----------------|
| `FIREBASE_*` / Admin SDK | Auth + Firestore |
| `OPENAI_API_KEY` | Personal + Company Sarah quality |
| `STORAGE_BACKEND` | firestore vs memory |
| `SARAH_NETWORK_PILOT_COMPANY_IDS` | Discover pilot |
| `REVENUE_COMMERCIAL_OVERRIDE=disabled` | Kill switch (recommended prod default) |
| `PLATFORM_API_KEY` | MC revenue read routes |

---

## 8. Production verification (non-mutating first)

1. Load Sarah PWA — login/register  
2. Bootstrap profile — 200/201  
3. Public catalogue — `GET /api/revenue/config/public` → all `commercialActivation` false  

Then mutating pilot: see [SARAH_APP_SMILEMORE_PILOT_ACCEPTANCE.md](./SARAH_APP_SMILEMORE_PILOT_ACCEPTANCE.md).

---

## 9. Risks if deploying without hardening

| Risk | Mitigation |
|------|------------|
| User chats lost on API restart | U5 hardening — Firestore `userConversations` |
| Consent grants lost | Persist grants or inline UI before marketing |
| U4/U5 missing on API | Verify route list on deployed commit |
| Rules not deployed | Client Firestore reads may fail if added later |

---

## 10. Gate

**Gate 3 (U5 pilot)** requires completion of sections 2–8 with stakeholder approval.
