# Railway API deployment

ZiricAI’s Express API (`api/server.js`) runs on Railway. Netlify static sites (marketing, app, admin) proxy `/api/*` to this host so browsers use same-origin requests and avoid CORS.

## Architecture

```
Browser (app.ziricai.com)
  → GET /api/health
  → Netlify proxy (app/netlify.toml)
  → https://ziricai-production.up.railway.app/api/health
  → Express (api/server.js)
```

Optional later: point `api.ziricai.com` CNAME at Railway and update Netlify redirects to the custom domain.

## 1. Create the Railway service

1. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select this repository.
2. **Root directory:** repo root (not `api/` — `services/` must be available).
3. **Start command:** `node api/server.js` (also set in `railway.json` and `package.json` `"start"`).
4. Railway sets **`PORT`** automatically — the server listens on `process.env.PORT` and binds `0.0.0.0`.
5. **Health check path:** `/api/health` (alias: `/health`).

After deploy, note the public URL (e.g. `https://ziricai-production.up.railway.app`).

## 2. Required Railway environment variables

Copy from `.env.example`. Minimum for a healthy deploy:

| Variable | Example / value | Notes |
|----------|-----------------|-------|
| `NODE_ENV` | `production` | Enables production caching, CORS rules |
| `STORAGE_BACKEND` | `memory` (initial) or `firestore` | Use `memory` until Firestore is configured; `auto` tries Firestore then falls back |
| `TENANT_SCOPE_ENFORCEMENT` | `strict` | Required in production (see `docs/deployment/SPRINT5_SECURITY.md`) |
| `PLATFORM_API_KEY` | long random secret | Super-admin / provisioning via `X-Platform-Api-Key` |
| `OPENAI_API_KEY` | `sk-...` | AI replies + Sarah |
| `APP_BASE_URL` | `https://app.ziricai.com` | CORS + link generation |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` | CORS |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` | CORS |
| `ZIRICAI_ROOT_URL` | `https://ziricai.com` | Optional apex CORS |

WhatsApp (when ready):

| Variable | Description |
|----------|-------------|
| `VERIFY_TOKEN` | Meta webhook verify token |
| `PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID |
| `WHATSAPP_TOKEN` | Meta system user / WhatsApp access token |

Optional:

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_CONCURRENCY` | `1` | Message worker concurrency |
| `DEFAULT_COMPANY_ID` | — | Auto-provision tenant on startup |
| `FIRESTORE_PING_TIMEOUT_MS` | `8000` | Auto storage backend Firestore probe timeout |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model override |
| `MFA_ENFORCEMENT` | `off` | MFA policy |
| `DEMO_SEED` | — | Seed demo data (memory backend) |

Railway may inject `RAILWAY_PUBLIC_DOMAIN` — CORS allows `https://${RAILWAY_PUBLIC_DOMAIN}` when set.

### Firebase / Firestore

For `STORAGE_BACKEND=firestore`, ensure Firebase client config in `js/firebase.js` is valid and Firestore rules are deployed. No `firebase-admin` package is required for the current adapter (client SDK + REST token verify).

## 3. Custom domain `api.ziricai.com` (optional)

1. Railway → service → **Settings** → **Networking** → **Custom Domain** → add `api.ziricai.com`.
2. DNS: CNAME `api` → Railway-provided target.
3. Update Netlify redirects in `app/netlify.toml`, `admin/netlify.toml`, `marketing/netlify.toml`:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://api.ziricai.com/api/:splat"
  status = 200
  force = true
```

4. Set Meta webhook URL to `https://api.ziricai.com/webhook`.

Until the custom domain is live, use `https://ziricai-production.up.railway.app`.

## 4. Netlify static sites (build-time env)

Set on **each** Netlify site (marketing, app, admin) in **Production** context:

| Variable | Value | Why |
|----------|-------|-----|
| `API_BASE_URL` | *(empty string)* | Browser calls same-origin `/api/*`; Netlify proxies to Railway |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` | Cross-site links |
| `APP_BASE_URL` | `https://app.ziricai.com` | Cross-site links |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` | Cross-site links |
| `USE_CDN_FIREBASE` | `true` | Firebase via esm.sh on static hosts |
| `NETLIFY` | `true` | Set in each `netlify.toml` `[build.environment]` |

Do **not** set `API_BASE_URL` to the Railway URL on Netlify unless you want direct cross-origin API calls (requires CORS on Railway).

Each `netlify.toml` already proxies:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://ziricai-production.up.railway.app/api/:splat"
  status = 200
  force = true
```

Redeploy all three Netlify sites after changing redirects or env vars.

## 5. Verify connection

### Railway direct

```bash
curl https://ziricai-production.up.railway.app/api/health
```

Expected (when fully initialized):

```json
{
  "status": "ok",
  "storage": "memory",
  "timestamp": "..."
}
```

During startup you may briefly see `"status": "starting"` with HTTP 503.

### Via Netlify proxy

```bash
curl https://app.ziricai.com/api/health
curl https://admin.ziricai.com/api/health
curl https://marketing.ziricai.com/api/health
```

### Browser

1. Open `app.ziricai.com` → DevTools → Network.
2. Sign in; confirm `/api/auth/session` returns 200 (not 502).
3. View page source — `__ZIRICAI_CONFIG__` should have `"apiBase":""` on Netlify builds.

## 6. Troubleshooting

### Railway returns 502 “Application failed to respond”

- Confirm **start command** is `node api/server.js` from repo root.
- Set `STORAGE_BACKEND=memory` to rule out Firestore probe hangs.
- Check Railway **Deploy Logs** for `[startup] Fatal` or crash stack traces.
- Ensure required env vars are set (`NODE_ENV=production` recommended).

### Netlify `/api/*` returns 502

- Railway service is down or unhealthy — fix Railway first.
- Redirect target in `netlify.toml` must match live Railway URL.
- Trigger a new Netlify deploy after updating `netlify.toml`.

### CORS errors in browser

- Prefer empty `API_BASE_URL` on Netlify so requests stay same-origin.
- If calling Railway directly, ensure origin is in `api/server.js` CORS list (`app.ziricai.com`, `admin.ziricai.com`, `marketing.ziricai.com`, `ziricai.com`, Railway URL).

### Firebase sign-in works but data fails

- API proxy or Railway backend issue — not Firebase Auth.
- Check `/api/health` on the site origin (e.g. `app.ziricai.com/api/health`).

## 7. Local parity

```bash
npm install
npm run prepare:sites
npm run dev
# http://localhost:3000/api/health
```

Simulate Netlify build:

```powershell
$env:NETLIFY='true'; $env:API_BASE_URL=''; node scripts/prepare-sites.js app
```

See also: [NETLIFY.md](./NETLIFY.md)
