# ZiricAI Production Deployment Checklist

Use this checklist before going live with WhatsApp, portals, and multi-tenant Firestore.

## 1. Environment variables

Copy `.env.example` → `.env` (never commit `.env`).

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | No | Default `3000` |
| `NODE_ENV` | Yes (prod) | Set `production` for static asset caching |
| `VERIFY_TOKEN` | Yes | Must match Meta webhook verify token |
| `PHONE_NUMBER_ID` | Yes | WhatsApp Cloud API phone number ID |
| `WHATSAPP_TOKEN` | Yes | Meta system user / permanent token |
| `OPENAI_API_KEY` | Yes | AI replies + Sarah |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
| `STORAGE_BACKEND` | Yes | Use `firestore` in production |
| `DEFAULT_COMPANY_ID` | Recommended | Fallback tenant for unscoped webhooks |
| `TENANT_SCOPE_ENFORCEMENT` | Yes | Use `strict` in production |
| `QUEUE_CONCURRENCY` | No | Default `1`; increase with care |
| `ANALYTICS_BATCH_SIZE` | No | Default `25` |
| `ANALYTICS_FLUSH_MS` | No | Default `30000` |

Firebase client config is embedded in HTML/JS for portal auth — ensure production Firebase project IDs match.

## 2. Install & run

```bash
npm install
npm run dev          # local development (STORAGE_BACKEND=memory ok)
```

Production:

```bash
# Linux/macOS
NODE_ENV=production STORAGE_BACKEND=firestore TENANT_SCOPE_ENFORCEMENT=strict npm start

# Windows PowerShell
$env:NODE_ENV="production"; $env:STORAGE_BACKEND="firestore"; $env:TENANT_SCOPE_ENFORCEMENT="strict"; npm start
```

Optional process manager (PM2):

```bash
pm2 start server.js --name ziricai --env production
pm2 save
```

## 3. Firebase deploy

```bash
firebase login
firebase use ziricai   # or your project ID

# Security rules + indexes (required before firestore backend)
firebase deploy --only firestore:rules,firestore:indexes

# Hosting (static HTML/JS/CSS) — optional if using Express static only
firebase deploy --only hosting
```

Verify rules cover tenant subcollections: `events`, `automationRuns`, `marketplace`, analytics rollups.

## 4. STORAGE_BACKEND migration

1. Deploy Firestore rules and indexes first.
2. Set `STORAGE_BACKEND=firestore` in production `.env`.
3. Restart server — adapter logs `[storage] Using firestore adapter`.
4. Run onboarding or `POST /api/platform/provision/company` for each tenant.
5. Migrate legacy root collections via superadmin tools (see `docs/architecture/MIGRATION.md`).

## 5. Meta WhatsApp webhook

1. Public HTTPS URL required (ngrok for dev, real domain for prod).
2. **Legacy callback:** `https://<domain>/webhook`
3. **Multi-tenant callback:** `https://<domain>/webhooks/whatsapp/<companyId>`
4. Subscribe to `messages` field in Meta Developer Console.
5. Verify token = `VERIFY_TOKEN` in `.env`.
6. Smoke test: `GET /api/health` → `whatsapp: true`.

## 6. Security checklist

- [ ] `TENANT_SCOPE_ENFORCEMENT=strict` in production
- [ ] Firestore rules deployed (`firestore.rules`)
- [ ] No secrets in git (`.env` gitignored)
- [ ] Superadmin routes protected by Firebase auth + role check
- [ ] Platform provisioning routes (`/api/platform/provision/*`) restricted (reverse proxy / auth) in prod
- [ ] Meta webhook signature validation enabled when available
- [ ] CORS / reverse proxy configured if API on separate host

## 7. Smoke tests after deploy

```bash
curl https://<domain>/api/health
curl https://<domain>/api/integrations/health
curl "https://<domain>/api/portal/hub/<companyId>"
curl https://<domain>/api/marketplace/catalog
```

Send a test WhatsApp message and confirm:

1. `[webhook] Incoming POST` in server logs
2. `conversationPipeline` → `messageWorker` processes job
3. Analytics event recorded (`MESSAGE_RECEIVED`)

## 8. npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local dev server |
| `npm start` | Same as dev (production env via shell) |
| `npm run production` | Alias for `node server.js` — set `NODE_ENV=production` in env |
| `npm run verify:sprint1` | Sprint 1 onboarding chain verification |
| `npm run verify:journey` | Sprint 3 customer journey smoke test |

## 9. Monitoring

- Server logs: request method/URL, integration hub, event bus, worker
- `GET /api/integrations/health` — channel status + retry queue
- `GET /api/health` — storage backend, queue stats
- Firestore usage dashboard in Firebase Console

## 10. Rollback

1. Set `STORAGE_BACKEND=memory` and restart (loses persistence — emergency only).
2. Redeploy previous Firestore rules if tenant lockout occurs.
3. Revert Meta webhook URL to last known good ngrok/domain.
