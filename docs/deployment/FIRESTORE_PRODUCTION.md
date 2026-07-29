# Link Firestore to ziricai.com (Production)

Step-by-step guide to connect your Firebase Firestore collections to ZiricAI production: Railway API, Netlify static sites (marketing, app, admin), and Firebase Console.

**Canonical schema:** [`docs/architecture/FIRESTORE_SCHEMA.md`](../architecture/FIRESTORE_SCHEMA.md)

---

## 1. Collection map

### Root collections

| Path | Purpose | Who writes |
|------|---------|------------|
| `users/{uid}` | Global auth profile (email, role, companyId) | Client on sign-in; API on provisioning |
| `companies/{companyId}` | Tenant root metadata | API (Admin SDK) + superadmin |
| `platform/{...}` | Marketplace catalog (packs, reviews, ratings) | Superadmin / API |

### Tenant subcollections (`companies/{companyId}/...`)

| Subcollection | Document ID | Notes |
|---------------|-------------|-------|
| `users` | Firebase uid | Tenant membership |
| `roles` | auto | RBAC |
| `departments` | auto | Org structure |
| `aiEmployees` | agent id | AI agents |
| `knowledgeBases` | e.g. `kb-{companyId}` | KB root |
| `documents` | auto | KB documents (migrated from legacy `knowledge`) |
| `customers` | normalized phone | CRM + WhatsApp |
| `customers/{id}/messages` | auto | Message thread |
| `conversations` | phone/uuid | Inbox |
| `conversations/{id}/messages` | auto | Thread messages |
| `contacts` | auto | Pre-lead contacts |
| `leads` | auto | Pipeline |
| `appointments` | auto | Calendar |
| `tasks` | auto | Task queue |
| `automations` | auto | Workflows |
| `events` | auto | Analytics events (server write) |
| `automationRuns` | auto | Workflow runs |
| `analyticsDaily` / `analyticsHourly` / `analyticsMetrics` | date/hour/id | Rollups |
| `billing` / `subscriptions` | auto | Billing |
| `integrations` | auto | WhatsApp, OpenAI, etc. |
| `notifications` | auto | Portal inbox |
| `files` | auto | Upload metadata |
| `settings` | key | Tenant config blobs |
| `provisioning` | e.g. `links` | Workspace links |
| `marketplace/installed/{packId}` | pack id | Installed marketplace packs |

### Legacy root collections (Phase 1 — migrate away)

| Legacy path | Tenant target | Migration |
|-------------|---------------|-----------|
| `customers/{phone}` | `companies/{id}/customers/{phone}` | `npm run migrate:tenants` |
| `agents/{id}` | `companies/{id}/aiEmployees/{id}` | `npm run migrate:tenants` |
| `knowledge/{id}` | `companies/{id}/documents/{id}` | `npm run migrate:tenants` |
| `memories/{id}` | (deprecated) | Server-only |
| `conversations/{id}` | `companies/{id}/conversations/{id}` | Manual / script |

If you created collections manually in Firebase Console, compare names to this table. **New code expects tenant-scoped paths** under `companies/{companyId}/`. Flat root collections still work for WhatsApp webhook via legacy adapter but should be migrated.

---

## 2. Firebase Console checklist

1. **Project:** Use the same project as your collections (default: `ziricai`).

2. **Enable Firestore** (if not already):
   - Build → Firestore Database → Create database
   - Production mode → pick region (e.g. `eur3` near Railway EU)

3. **Authorized domains** (Authentication → Settings → Authorized domains):
   - `ziricai.com`
   - `www.ziricai.com`
   - `app.ziricai.com`
   - `admin.ziricai.com`
   - `marketing.ziricai.com`
   - `localhost` (dev)

4. **Service account for Railway:**
   - Project Settings → Service accounts → Generate new private key
   - Save JSON securely — **never commit to git**
   - Use fields: `project_id`, `client_email`, `private_key`

5. **Deploy rules and indexes from repo:**

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use ziricai   # or your project id
   firebase deploy --only firestore
   ```

   This deploys `firestore.rules` and `firestore.indexes.json`.

6. **Web app config** (Project Settings → General → Your apps → Web):
   - Copy apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
   - Set as Netlify build env vars (see §4) — not in git

---

## 3. Railway environment variables

Set in Railway → your API service → Variables.

### Required for Firestore persistence

| Variable | Example / notes |
|----------|-----------------|
| `STORAGE_BACKEND` | `firestore` |
| `FIREBASE_PROJECT_ID` | `ziricai` |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@ziricai.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Full PEM key; paste with `\n` for newlines or use JSON option below |
| `FIREBASE_API_KEY` | Web API key (for server token verification via REST) |

**Alternative (single var):**

| Variable | Value |
|----------|-------|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Entire service account JSON as one line |

### Required for production (non-Firestore)

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `TENANT_SCOPE_ENFORCEMENT` | `strict` |
| `PLATFORM_API_KEY` | long random secret |
| `APP_BASE_URL` | `https://app.ziricai.com` |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` |
| `OPENAI_API_KEY` | `sk-...` (recommended) |

### Safe fallback behavior

- If `STORAGE_BACKEND=firestore` but Admin credentials are **missing**, the API **falls back to memory** and logs a warning (data not persisted).
- Check `GET /api/health` — `storage` must be `"firestore"` and `storageFallback` must be `null`.

### Example Railway block

```
NODE_ENV=production
STORAGE_BACKEND=firestore
TENANT_SCOPE_ENFORCEMENT=strict
PLATFORM_API_KEY=<your-secret>
FIREBASE_PROJECT_ID=ziricai
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_API_KEY=<web-api-key>
APP_BASE_URL=https://app.ziricai.com
ADMIN_BASE_URL=https://admin.ziricai.com
MARKETING_BASE_URL=https://marketing.ziricai.com
OPENAI_API_KEY=sk-...
```

Redeploy after saving variables.

---

## 4. Netlify (marketing, app, admin)

Set on **each** Netlify site → Site configuration → Environment variables → **Production**:

| Variable | Value |
|----------|-------|
| `USE_CDN_FIREBASE` | `true` |
| `NETLIFY` | `true` (already in each `netlify.toml`) |
| `API_BASE_URL` | *(empty string)* |
| `FIREBASE_API_KEY` | from Firebase Console web app |
| `FIREBASE_AUTH_DOMAIN` | `ziricai.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `ziricai` |
| `FIREBASE_STORAGE_BUCKET` | `ziricai.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | from Console |
| `FIREBASE_APP_ID` | from Console |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` |
| `APP_BASE_URL` | `https://app.ziricai.com` |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` |

Build runs `npm run prepare:sites`, which injects `window.__ZIRICAI_CONFIG__.firebase` into HTML. Client code reads config from `js/firebase-config.js`.

**Trigger redeploy** on all three sites after setting vars.

---

## 5. Verify connection

### Health check (Railway)

```bash
curl https://ziricai-production.up.railway.app/api/health
```

Expected when Firestore is linked:

```json
{
  "status": "ok",
  "storage": "firestore",
  "storageConfigured": "firestore",
  "firestoreAdmin": true,
  "storageFallback": null,
  "firebaseProjectId": "ziricai"
}
```

If `storage` is `"memory"` and `storageFallback` explains missing credentials, fix Railway vars and redeploy.

### Via Netlify proxy

```bash
curl https://app.ziricai.com/api/health
```

### Local / CI script

```bash
# .env with Admin credentials
STORAGE_BACKEND=firestore npm run verify:firestore
```

### Sign-in test

1. Open `https://app.ziricai.com`
2. Sign in with Firebase Auth
3. Firebase Console → Firestore → `users/{your-uid}` should exist or update
4. If onboarding creates a company: `companies/{companyId}` and `companies/{companyId}/users/{uid}`

---

## 6. Migrate legacy flat collections

If data lives in root `customers`, `agents`, or `knowledge`:

```bash
# Preview
npm run migrate:tenants:dry

# Run (requires Admin credentials in .env)
DEFAULT_COMPANY_ID=your-company-id npm run migrate:tenants
```

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `storage: "memory"` on Railway | Set Admin creds + `STORAGE_BACKEND=firestore`, redeploy |
| `NOT_FOUND` in logs | Create Firestore database in Console |
| Permission denied (client) | Deploy `firestore.rules`; ensure user doc + tenant membership exist |
| Sign-in works, API 502 | Railway down — fix API first (see [RAILWAY.md](./RAILWAY.md)) |
| Missing index errors | `firebase deploy --only firestore:indexes` |
| CORS errors | Keep `API_BASE_URL` empty on Netlify (same-origin proxy) |

---

## 8. Related docs

- [RAILWAY.md](./RAILWAY.md) — API deploy and env vars
- [NETLIFY.md](./NETLIFY.md) — static sites and proxy
- [FIRESTORE_SCHEMA.md](../architecture/FIRESTORE_SCHEMA.md) — full schema
- [MIGRATION.md](../architecture/MIGRATION.md) — legacy → tenant cutover
- [SPRINT5_SECURITY.md](./SPRINT5_SECURITY.md) — `TENANT_SCOPE_ENFORCEMENT=strict`
