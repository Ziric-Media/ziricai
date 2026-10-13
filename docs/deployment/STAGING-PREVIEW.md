# Business Portal — private Deploy Preview (staging)

Planning doc for **ziricai-app** Netlify Deploy Previews + **Railway staging API** + **Firebase `ziricai-staging`**.

Production (`app.ziricai.com`, `ziricai-production.up.railway.app`, Firebase `ziricai`) must not receive preview traffic or writes.

## Git scope (staging branch)

- Branch: `staging/business-portal-open-create`
- Security commits: `070ab18` → `b20a4ac` (exclude `9c81732` verifier-only commit unless explicitly added later)
- Do not `git add -A`; exclude unrelated working-tree changes

## Firebase (`ziricai-staging`)

| Item | Value |
|------|--------|
| Project ID | `ziricai-staging` |
| Firestore database ID | `(default)` — not the prod `ziricai` named DB `default` |
| Auth | Email/Password; add each preview hostname under **Authorized domains** |

### Netlify build (Deploy Preview context)

| Variable | Required |
|----------|----------|
| `FIREBASE_PROJECT_ID` | `ziricai-staging` |
| `FIREBASE_API_KEY` | Staging web app |
| `FIREBASE_APP_ID` | Staging web app |
| `FIREBASE_MESSAGING_SENDER_ID` | Staging web app |
| `FIREBASE_AUTH_DOMAIN` | Usually `ziricai-staging.firebaseapp.com` |
| `FIREBASE_STORAGE_BUCKET` | Usually `ziricai-staging.firebasestorage.app` |
| `FIREBASE_DATABASE_ID` | `(default)` |
| `API_BASE_URL` | Staging Railway origin, **no trailing slash** |
| `APP_BASE_URL` | Exact preview URL used for testing |
| `USE_CDN_FIREBASE` | `true` |
| `NODE_VERSION` | `20` |

Deploy Firestore rules/indexes **only** against `ziricai-staging`:

```bash
firebase use ziricai-staging
firebase deploy --only firestore:rules,firestore:indexes
```

## Railway (`ziricai-api-staging`)

| Variable | Staging intent |
|----------|----------------|
| `NODE_ENV` | `production` |
| `TENANT_SCOPE_ENFORCEMENT` | `strict` |
| `STORAGE_BACKEND` | `firestore` (staging project only) |
| `FIREBASE_PROJECT_ID` | `ziricai-staging` |
| `FIREBASE_CLIENT_EMAIL` | Staging Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Staging secret (Railway only) |
| `APP_BASE_URL` | Preview URL (CORS) |
| `PLATFORM_API_KEY` | New staging-only secret |

Start command: `node api/server.js` (repo root).

## API routing safeguard

`app/netlify.toml` proxies `/api/*` to **production** Railway. Previews must set **`API_BASE_URL`** at build time so `prepare-sites.js` injects a staging `apiBase`.

On `*.netlify.app` hosts, `js/shared/apiRequest.js` **throws** if staging `API_BASE_URL` is missing or points at production — no silent fallback.

## Post-build validation

After Netlify build (Deploy Preview context):

```bash
node scripts/verify-staging-preview-build.mjs app/index.html
```

Set optional gate env:

- `STAGING_EXPECT_FIREBASE_PROJECT_ID=ziricai-staging`
- `STAGING_FORBID_API_HOST=ziricai-production.up.railway.app`

## Isolation gate (before browser write tests)

1. View source: `firebase.projectId` = `ziricai-staging`, `apiBase` = staging Railway
2. Network tab: no requests to `ziricai-production.up.railway.app`
3. `GET <staging-railway>/api/health` → 200
4. Auth + tenant boundary checks on staging only
5. Confirm prod Firestore tenants (Central Motors, Client Zero, etc.) unchanged

Gate A sign-off and production deploy remain separate.
