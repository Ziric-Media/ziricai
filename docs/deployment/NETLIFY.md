# Netlify multi-site deployment

ZiricAI is split into four deploy surfaces:

| Subdomain | Folder | Purpose |
|-----------|--------|---------|
| `marketing.ziricai.com` | `marketing/` | Landing page, industry pages, onboarding wizard |
| `app.ziricai.com` | `app/` | Company portal (SPA) |
| `admin.ziricai.com` | `admin/` | Super admin console |
| `api.ziricai.com` | `api/` + root `services/` | Express API, webhooks, workers |

Source HTML/CSS/JS lives at the repo root (`ziricai.html`, `js/`, `css/`). Before deploy, `scripts/prepare-sites.js` copies assets into each publish folder.

## Netlify site setup

Create **three separate Netlify sites** (marketing, app, admin). For each site in the Netlify dashboard:

1. **Repository** — connect this repo
2. **Base directory** — `marketing`, `app`, or `admin` (matches the folder name)
3. **Build command** — already in each folder's `netlify.toml` (`cd .. && npm ci && node scripts/prepare-sites.js <site>`)
4. **Publish directory** — `.` (relative to base directory)
5. **Custom domain** — assign subdomain (see DNS below)

The API is **not** a Netlify static site. Deploy `api/server.js` on Railway, Render, Fly.io, or similar:

```bash
# Start command (from repo root)
node api/server.js
```

Set `PORT` from the host. Point `api.ziricai.com` CNAME to that service.

## DNS / subdomain mapping

| Record | Target |
|--------|--------|
| `marketing.ziricai.com` | Netlify (marketing site) |
| `app.ziricai.com` | Netlify (app site) |
| `admin.ziricai.com` | Netlify (admin site) |
| `api.ziricai.com` | Railway/Render/Fly (Node API) |

Static sites proxy `/api/*` to `https://api.ziricai.com/api/*` via `[[redirects]]` in each `netlify.toml`.

## Environment variables

### API backend (`api/server.js` / Railway)

Copy from `.env.example`. Required for production:

| Variable | Description |
|----------|-------------|
| `PORT` | Host-assigned port |
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | AI replies |
| `STORAGE_BACKEND` | `firestore` in production |
| `TENANT_SCOPE_ENFORCEMENT` | `strict` in production |
| `PLATFORM_API_KEY` | Server-side ops key |
| `VERIFY_TOKEN`, `PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | WhatsApp webhooks |
| `APP_BASE_URL` | `https://app.ziricai.com` |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` |

Firebase Admin credentials (if using Firestore) via host env or service account file.

### Netlify static sites (build-time)

Set in Netlify → Site settings → Environment variables (production context):

| Variable | Example |
|----------|---------|
| `API_BASE_URL` | `https://api.ziricai.com` |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` |
| `APP_BASE_URL` | `https://app.ziricai.com` |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` |
| `USE_CDN_FIREBASE` | `true` (uses esm.sh for Firebase on static hosts) |

These are injected into `window.__ZIRICAI_CONFIG__` during `prepare-sites.js`.

Client Firebase config remains in `js/firebase.js` (web app keys are public).

## Local development

```bash
npm install
npm run prepare:sites    # sync marketing/, app/, admin/ from source
npm run dev              # API + all static sites on :3000
```

| URL | Site |
|-----|------|
| http://localhost:3000/ | Marketing |
| http://localhost:3000/app/ | Company portal |
| http://localhost:3000/admin/ | Super admin |
| http://localhost:3000/api/health | API health |

Legacy root HTML files (`ziricai.html`, `company-portal.html`, etc.) redirect to the new paths when served via the dev server.

Individual site watchers (optional):

```bash
npm run dev:marketing   # prepare + dev (same server)
npm run dev:app
npm run dev:admin
npm run dev:api         # API only
```

After editing root `js/`, `css/`, or source HTML, re-run:

```bash
npm run prepare:sites
```

## API deployment options

### Recommended: External Node (Railway / Render)

- **Pros:** Full Express, webhooks, message queue worker, multer uploads, long-lived connections
- **Cons:** Separate host billing

Start command: `node api/server.js`  
Health check: `GET /api/health`

### Not recommended: Netlify Functions

The codebase uses Express with 100+ routes, background workers, and WhatsApp webhooks. Migrating to Netlify Functions would require significant refactoring.

Static sites use Netlify redirects to proxy `/api/*` to the external API host.

## Verification

```bash
npm run verify:sprint1
npm run verify:journey
```

These run service-layer tests (memory backend) and do not depend on HTML paths.

## Manual Netlify dashboard checklist

- [ ] Create 3 Netlify sites with correct base directories
- [ ] Set production env vars on each static site
- [ ] Assign custom domains + enable HTTPS
- [ ] Deploy API to Railway/Render with env vars
- [ ] Point `api.ziricai.com` to API host
- [ ] Configure Meta webhook URL: `https://api.ziricai.com/webhook`
- [ ] Set `TENANT_SCOPE_ENFORCEMENT=strict` on API
- [ ] Add Firebase authorized domains: all four subdomains

## Directory layout (after prepare)

```
/
├── marketing/          # Netlify publish — landing
│   ├── index.html
│   ├── industry-*.html
│   ├── css/ js/ assets/
│   └── netlify.toml
├── app/                # Netlify publish — portal
│   ├── index.html
│   ├── onboarding.html
│   ├── css/ js/ assets/
│   └── netlify.toml
├── admin/              # Netlify publish — super admin
│   ├── index.html
│   ├── css/ js/ assets/
│   └── netlify.toml
├── api/
│   ├── server.js       # Express entry
│   ├── netlify.toml    # docs only
│   └── public/         # optional health stub
├── services/           # Shared backend (stays at root)
├── js/ css/ assets/    # Source of truth for frontends
└── scripts/prepare-sites.js
```

## Troubleshooting

### `Base directory does not exist: …/marketing`

**Symptom (Netlify build log):**

```
Failed during stage 'Reading and parsing configuration files':
When resolving config: Base directory does not exist: /opt/build/repo/marketing
Failing build: Failed to parse configuration
```

**Root cause:** The Netlify site has **Base directory** set to `marketing`, but that folder is not in the Git branch Netlify builds (usually `main`). This happens when the monorepo restructure exists only on your machine and was never committed/pushed.

**Not caused by:** `.gitignore` ( `marketing/` is not ignored ) or a bad build command — Netlify fails before the build runs because the base folder is missing from the clone.

**Verify locally:**

```bash
git ls-files marketing/          # should list marketing/netlify.toml (and related files)
git ls-tree -r HEAD --name-only  # on GitHub's commit, marketing/ should appear
Test-Path marketing/netlify.toml # PowerShell — should be True
node scripts/prepare-sites.js marketing   # should print: Prepared marketing/
```

**Fix:** Commit and push the deploy surface folders plus build inputs, then trigger a new deploy.

Minimum for the **marketing** Netlify site:

- `marketing/netlify.toml` (required so the base directory exists)
- `scripts/prepare-sites.js`
- `package.json`, `package-lock.json`
- Source HTML: `ziricai.html`, `industry-*.html`
- Source assets: `js/`, `css/`, `assets/`

The Netlify build runs `prepare-sites.js`, which regenerates `marketing/index.html`, `css/`, and `js/` during deploy — you do not need to hand-edit those inside `marketing/` before push, but `marketing/netlify.toml` must be in git.

**Push commands (from repo root):**

```bash
git add marketing/ scripts/ package.json package-lock.json
git add ziricai.html industry-*.html js/ css/ assets/
git add netlify.toml docs/deployment/NETLIFY.md
# Optional: add app/ admin/ api/ services/ when those Netlify sites are ready
git commit -m "Add marketing site folder and Netlify monorepo deploy layout"
git push origin main
```

**Netlify dashboard — confirm after push:**

| Setting | Marketing site |
|---------|----------------|
| Branch | `main` |
| Base directory | `marketing` |
| Build command | *(leave empty — use `marketing/netlify.toml`)* |
| Publish directory | *(leave empty — `publish = "."` in toml)* |

Clear any duplicate build command in the UI if it overrides `marketing/netlify.toml`. The configured command is:

```toml
cd .. && npm ci && node scripts/prepare-sites.js marketing
```

That `cd ..` is intentional: Netlify starts in `marketing/`, then moves to the repo root for `npm ci` and the prepare script.

### Root `netlify.toml` vs site folders

The file at the repo root (`netlify.toml`) is **documentation only** when each Netlify site uses its own base directory (`marketing`, `app`, or `admin`). Netlify reads config from the base directory, not the root.

**Single-site fallback:** To deploy from the repo root without a base directory, you would need a full root `[build]` section (publish dir, command, redirects). The recommended setup is three Netlify sites with base directories — do not point the marketing site at the repo root while base directory is still set to `marketing`.

### Build succeeds locally but fails on Netlify

1. Confirm `NODE_VERSION = "20"` in the site's `netlify.toml` (already set).
2. Confirm production env vars in Netlify match the table above (`API_BASE_URL`, etc.).
3. Re-run locally with Netlify-like env:  
   `$env:NETLIFY='true'; node scripts/prepare-sites.js marketing` (PowerShell)
4. Check build log for missing source files — `prepare-sites.js` reads `ziricai.html` and `industry-*.html` from the repo root (or `_sources/` if present).
