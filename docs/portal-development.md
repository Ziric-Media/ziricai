# Company Portal — Development Source of Truth

## Build pipeline

```
company-portal.html  →  scripts/prepare-sites.js  →  app/index.html  →  Netlify (app.ziricai.com)
js/portal/           →  scripts/prepare-sites.js  →  app/js/portal/
css/                 →  scripts/prepare-sites.js  →  app/css/
```

## Rules

1. **Edit canonical sources only:** `js/portal/`, `company-portal.html`, and `css/`.
2. **`app/js/portal/` and `app/index.html` are generated** by `node scripts/prepare-sites.js app` (also run automatically on Netlify build).
3. **Do not manually edit `app/js/portal/`** without syncing the same change to `js/portal/`.
4. After source changes, run:

   ```bash
   node scripts/prepare-sites.js app
   npm run verify:portal-foundation
   ```

5. Portal empty states: use `renderEmptyState()` from `js/portal/core/widgets/emptyState.js`.
6. API failures: use `errorState()` from `js/admin/ui.js`. Permission denied is an error, not an empty state.
7. Module state: import `{ state, setState }` from `../core/dataStore.js` (not `../state.js`).

## Verification

```bash
npm run verify:portal-foundation
```
