# Sarah App — Deployment and Domain (sarah.ziricai.com)

**Status:** Configuration prepared (U0); **not deployed**, DNS **not** changed, production apps **unchanged**.

---

## Domain strategy (locked for U1+)

| Product | Production domain |
|---------|-------------------|
| **Sarah App** | `https://sarah.ziricai.com` |
| Company Portal | `https://app.ziricai.com` |
| Mission Control | `https://admin.ziricai.com` |
| Marketing / sign-in | `https://marketing.ziricai.com` / `https://ziricai.com` |
| API | `https://ziricai-production.up.railway.app` |

Future standalone consumer domain (e.g. `sarah.ai`) can CNAME to the same Netlify site or replace primary custom domain without architectural change.

---

## Independent Netlify site

Sarah App uses publish folder **`users/`** (separate Netlify project from `ziricai-app` and `ziricai-admin`).

| File | Purpose |
|------|---------|
| [users/netlify.toml](../../users/netlify.toml) | Build command, API proxy, env defaults |
| `scripts/prepare-sites.js users` | Sync shell into `users/` (invoked by Netlify build only) |
| [sarah-app-shell.html](../../sarah-app-shell.html) | U0 placeholder shell (replaced in U1) |

**Build command (Netlify):**

```bash
cd .. && npm ci && node scripts/prepare-sites.js users
```

**Publish directory:** `users/` (base directory in Netlify dashboard = `users`)

---

## Manual setup checklist (when U1 approved)

### 1. Create Netlify site

1. Netlify → Add new site → link repo (or manual deploy).
2. **Base directory:** `users`
3. **Build command / publish:** from `users/netlify.toml`
4. Note **Site ID** for CLI: `netlify link --id <new-site-id>`

### 2. DNS (Netlify DNS for ziricai.com)

**When the site builds successfully**, add:

| Type | Name | Target |
|------|------|--------|
| CNAME | `sarah` | `<new-site>.netlify.app` |

Or use Netlify **Domain management → Add domain alias** `sarah.ziricai.com` on the Sarah App site.

**Do not** add DNS until first successful deploy is ready (avoids broken subdomain).

### 3. Netlify environment variables (production context)

Mirror app/admin Firebase vars; add Sarah-specific URLs:

| Variable | Production value |
|----------|------------------|
| `API_BASE_URL` | `` (empty — same-origin `/api` proxy) |
| `SARAH_APP_BASE_URL` | `https://sarah.ziricai.com` |
| `APP_BASE_URL` | `https://app.ziricai.com` |
| `ADMIN_BASE_URL` | `https://admin.ziricai.com` |
| `MARKETING_BASE_URL` | `https://marketing.ziricai.com` |
| `FIREBASE_*` | Same project as Company Portal (`ziricai`) |
| `NETLIFY` | `true` |
| `USE_CDN_FIREBASE` | `true` |

Staging site (optional): `sarah-staging.ziricai.com` or Netlify preview URLs with `FIREBASE_PROJECT_ID=ziricai-staging`.

### 4. Firebase Authentication — authorized domains

Firebase Console → **Authentication → Settings → Authorized domains** → add:

- `sarah.ziricai.com`
- `localhost` (already present for dev)

If using **Google / OAuth** providers, add redirect URIs as required by provider docs.

**Auth handler:** Same Firebase project as existing portals (shared identity).

### 5. Firebase Hosting (not used)

Sarah App is on **Netlify**, not Firebase Hosting — only Auth + Firestore + Storage apply.

### 6. Railway API

No change required for static deploy. When consumer routes exist (U2+), Railway already serves `/api/*`; Netlify proxies `users` site `/api/*` → Railway (same pattern as app/admin).

Optional later: `CORS` allow origin `https://sarah.ziricai.com` if any call uses absolute API URL instead of proxy.

---

## Environment separation

| Environment | Sarah App URL | API | Firebase project |
|-------------|---------------|-----|------------------|
| Local | `http://localhost:3000/users/` (future dev server) | `localhost:3000` or Railway staging | `.env.local-staging` |
| Netlify preview | `*.netlify.app` | Proxy or staging API | staging |
| Production | `https://sarah.ziricai.com` | Proxy → production Railway | `ziricai` |

`window.__ZIRICAI_CONFIG__.sites.sarah` injected at build via `SARAH_APP_BASE_URL`.

---

## PWA (U1 direction)

Placeholder shell includes:

- `manifest.webmanifest` (generated in U1)
- `theme-color`, mobile viewport
- Service worker **deferred** until U2 (cache static assets only)

Architecture remains **mobile-ready** for future native shells (Capacitor / React Native) calling same consumer API.

---

## Monitoring (independent)

| Tool | Site |
|------|------|
| Netlify analytics / build notifications | Sarah App site only |
| Railway logs | Filter `domain=consumer` when routes exist |
| Uptime | `GET https://sarah.ziricai.com/` (after go-live) |

Mission Control and Company Portal deploy pipelines **unchanged**.

---

## What was not done (explicit)

- No DNS record created
- No Netlify production deploy
- No Firebase Console changes
- No Railway env changes
- No Firestore rules or collections

---

## Related

- [SARAH_APP_SCALABILITY_AND_OPERATIONS.md](./SARAH_APP_SCALABILITY_AND_OPERATIONS.md)
- [U0_ACCEPTANCE_CHECKLIST.md](./U0_ACCEPTANCE_CHECKLIST.md)
