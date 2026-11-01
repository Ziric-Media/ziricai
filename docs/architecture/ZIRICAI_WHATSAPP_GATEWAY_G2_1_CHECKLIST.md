# G2.1 — Production deployment and verification

Formal checkpoint **before** any G3 remediation. No tenant or registry mutations in this phase.

## Programme context

| Milestone | Status |
|-----------|--------|
| G1 — Registry schema & authority | **Merged** (repo) |
| G2 — Read-only reconciliation | **Merged** (repo) |
| **G2.1 — Production deployment & verification** | **This document** |
| G3 — Operator-approved remediation | **Not authorized** |
| G4 — Registry-first routing | Pending |
| Client Zero (6157) | **Frozen** |

## Safeguards (unchanged)

- Do **not** auto-deactivate duplicate **3699** integrations.
- Do **not** assign registry `wa-env-…3699` until G3, and only **after** duplicates are safely resolved.
- Do **not** change Client Zero, Meta assets, or Railway credentials except as part of an approved milestone.

## Preconditions

- [ ] G1 + G2 code reviewed and merged to the branch Railway deploys from.
- [ ] Stakeholder sign-off on proceeding with **deploy only** (no G3).

## Step 1 — Review merged G1/G2 changes

Verify these paths exist and match spec:

- `services/platform/whatsappGatewayRegistry.js`
- `services/platform/reconcileWhatsAppPhoneAssignments.js`
- `services/platform/whatsappNumberPoolService.js` (registry normalization on read/write)
- `api/app.js` — `GET /api/platform/whatsapp-numbers/reconciliation`
- `scripts/reconcile-whatsapp-phone-assignments-readonly.mjs`
- `js/admin/api.js` — `fetchWhatsAppReconciliation`

## Step 2 — Verify platform authentication (code review)

Endpoint: `GET /api/platform/whatsapp-numbers/reconciliation`

- Middleware: `requirePlatformAccess()` (same as other `/api/platform/whatsapp-numbers` routes).
- Allowed callers:
  - Super Admin Firebase session, or
  - `PLATFORM_API_KEY` via `x-platform-api-key`, `x-api-key`, or `Authorization: Bearer <key>`.
- Unauthenticated → **401**; authenticated non–super-admin without key → **403**.

Optional local negative test (after deploy): `curl` without credentials → expect 401.

## Step 3 — Deploy API (explicit authorization only)

Deploy the Railway service that hosts `api/app.js` when deployment is **explicitly authorized**. Do not run G3 in the same change window.

## Step 4 — Compare production endpoint vs read-only script

After deploy:

```bash
# A) Direct Firestore (baseline — same as pre-deploy)
npx @railway/cli run node scripts/reconcile-whatsapp-phone-assignments-readonly.mjs --suffix=3699

# B) HTTP (replace BASE and key)
curl -sS -H "x-platform-api-key: $PLATFORM_API_KEY" \
  "$BASE/api/platform/whatsapp-numbers/reconciliation?phoneSuffix=3699"
```

Or run parity helper (post-deploy):

```bash
node scripts/g2-1-verify-reconciliation-parity.mjs --suffix=3699 --baseUrl=https://YOUR_RAILWAY_HOST
```

Requires `PLATFORM_API_KEY` in the environment for the HTTP leg.

## Step 5 — Acceptance criteria

Report from **B** must match **A** on:

- `summary.phoneIdsInReport` === 1
- `summary.duplicateActivePhoneIds` === 1
- `summary.registryMisaligned` === 1
- `conflicts[0].activeIntegrationCount` === 4
- Same four `companyId` values (order may differ; sort before compare)
- Same classifications for each tenant (`keep_active_candidate` vs `deactivate_candidate`)
- Registry pool id suffix **3699**, allocation **available** (pre-G3)

## Step 6 — Preserve evidence baseline for G3

Store immutable copies:

- Pre-deploy script output: `docs/audit/whatsapp-reconciliation-baseline-suffix-3699-2026-10-31.json`
- Post-deploy: add `docs/audit/whatsapp-reconciliation-post-g2-1-deploy-suffix-3699-<date>.json` (script + API responses)

G3 remediation must reference these baselines; any drift without explanation blocks G3.

## Sign-off

| Role | Name | Date | Deploy authorized | Parity verified |
|------|------|------|-------------------|-----------------|
| Programme owner | | | | |
| Operator | | | | |
