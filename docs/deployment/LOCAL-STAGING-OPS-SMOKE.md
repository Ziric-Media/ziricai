# Local staging smoke — Operations Centre v1

Use this for **end-to-end** verification on **`feature/operations-centre-v1`** without touching production Firebase or deploying.

## One project rule

Everything below must target **`ziricai-staging`** (or your chosen **non-production** project):

| Layer | Must match |
|--------|------------|
| Portal `__ZIRICAI_CONFIG__.firebase` | Staging web app API key + `projectId` |
| Server `FIREBASE_API_KEY` | Same staging web API key (token verify REST) |
| Admin SDK | Staging service account (`FIREBASE_CLIENT_EMAIL` / key or JSON) |
| Test user | Auth user **in that project** (e.g. Gate A owner) |
| Tenant data | Company + membership in staging Firestore |

Do **not** sign in with production `ziricai` users while Admin points at staging (401 / wrong tenant).

## Firebase CLI (optional)

CLI is installed separately (`firebase --version`). This repo maps **`staging`** → **`ziricai-staging`** in `.firebaserc`:

```bash
npm run firebase -- use staging
npm run firebase -- deploy --only firestore:indexes   # only when authorized
```

Default alias remains **`ziricai`** (production). Always `firebase use staging` before staging deploys.

## Provision staging smoke user (Admin SDK)

If Auth user / membership is missing, run locally (password via env only — never commit):

```powershell
$env:OPS_STAGING_SMOKE_EMAIL = "your-smoke-user@example.com"
$env:OPS_STAGING_SMOKE_PASSWORD = "…"
npm run provision:ops-staging-smoke-user -- --write-credentials
```

Requires **`staging-gate-a-portal`** (or `OPS_STAGING_SMOKE_COMPANY_ID`) to exist in Firestore. Refuses **`ziricai`** production project.

## Setup

1. Copy `.env.local-staging.example` → **`.env.local-staging`** (repo root; keep gitignored).
2. Fill **plain string** values from Firebase Console (staging).
   - **`FIREBASE_API_KEY` must not** look like `Promise { ... }` — that breaks `prepare-sites` and browser auth. Use the raw web API key only.
3. Keep base `.env` minimal; **`.env.local-staging` overrides** on API boot (`bootstrapEnv`).
4. Optional credentials file for live smoke (no secrets in repo):

   ```json
   {
     "label": "ops-centre-staging",
     "companyId": "staging-gate-a-portal",
     "email": "your-staging-owner@example.com",
     "password": "…",
     "uid": "…"
   }
   ```

   Set `OPS_SMOKE_CREDENTIALS=test-results/ops-centre-staging-credentials.json`.

   Required JSON fields (same as smoke script):

   | Field | Purpose |
   |--------|---------|
   | `email` | Staging Auth user |
   | `password` | Staging-only password (never production) |
   | `companyId` | e.g. `staging-gate-a-portal` |
   | `uid` | Optional; must match Auth if set |
   | `label` | Optional trace label in logs |

   Confirm in Firebase Console → **ziricai-staging** → Authentication that the user exists, and in Firestore that `companies/{companyId}/users/{uid}` membership (and/or global profile) matches the tenant.

## Verify alignment (no secrets printed)

```bash
node scripts/verify-local-firebase-alignment.mjs
```

Fix any **FAIL** before live smoke.

After creating `test-results/ops-centre-staging-credentials.json`:

```bash
npm run verify:staging-smoke-credentials
```

Target: **`STAGING_CREDENTIALS_PASS`**.

## Run API + portal

```bash
npm run dev:app
```

Requires valid staging `FIREBASE_API_KEY` in env (via `.env.local-staging`).

## Live HTTP smoke

With API on `http://127.0.0.1:3000`:

```bash
set OPS_SMOKE_SERVER_STORAGE=firestore
node scripts/smoke-operations-centre-v1-local.mjs --live
```

## Firestore indexes (viewer task lists)

Viewer-scoped lists filter on `assigneeUid` and order by `updatedAt`. If Firestore returns `FAILED_PRECONDITION`, compare with `firestore.indexes.json` (composite on `tasks`: `assigneeUid` + `updatedAt`). Deploy indexes only to **staging**:

```bash
firebase use ziricai-staging
firebase deploy --only firestore:indexes
```

## Browser check

1. Open `http://localhost:3000/app/`
2. View source: `firebase.projectId` = `ziricai-staging`, `apiKey` is a normal string (starts with `AIza`).
3. Sign in as staging test user → **Operate → Operations**.

## Out of scope here

- **SEC-02** static gap on `PATCH /api/companies/:companyId` — track separately; do not fold into Operations v1.
- **Sarah** `listTasks` / `createTask` — after live smoke + persistence pass.
