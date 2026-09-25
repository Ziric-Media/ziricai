# PORTAL-4C-6C-C — Revoke / Entitlement Lifecycle (contract)

**Status:** 4C-6C-C implementation contract (post 6C-B sign-off)  
**Baseline:** Grant POST closed; install hook **frozen** (`marketplaceInstaller.js` not entitlement-aware)

---

## Read-only inspection (pre-implementation)

| Area | Current state |
|------|----------------|
| **Persistence** | `saveEntitlement()` on memory + Firestore repos; doc path `companies/{companyId}/marketplaceEntitlements/{packId}` |
| **Effective status** | `resolveEntitlementEffectiveStatus()` — `none` \| `active` \| `revoked` \| `expired` (time from `expiresAt` on stored `active`) |
| **Tenant read** | `toTenantEntitlementView()` — `entitled` only when effective `active`; strips `grantedBy`, `revokedBy`, `revokeReason`, `salesReference` |
| **Grant (6C-B)** | `POST /api/platform/marketplace/entitlements` → `grantMarketplaceEntitlement()` |
| **Revoke HTTP** | **Not present** — only test/repo `saveEntitlement({ status: 'revoked' })` in verifier |
| **Install** | `runInstallWizard` paid path unchanged; entitlement does not affect `requiresPayment` |

**Gap for 6C-C:** platform-only **soft revoke** and **expiry update** APIs + service methods + verifier proofs. No installer, UI, or payment changes.

---

## Lifecycle contract (approved 6C-A semantics)

### Transitions

| Transition | Actor | API | Stored `status` | Tenant `entitled` | Install (frozen) |
|------------|-------|-----|-----------------|-------------------|------------------|
| **Grant / re-grant** | Platform | `POST …/entitlements` | `active` | `true` if not time-expired | Still **402** / `requiresPayment` |
| **Soft revoke** | Platform | `DELETE` or `PATCH` revoke | `revoked` | `false` | Still **402** |
| **Expire (time)** | System read | — | `active` + past `expiresAt` | effective `expired`, `false` | Still **402** |
| **Set / clear expiry** | Platform | `PATCH` `{ expiresAt }` | `active` | per effective status | Still **402** |
| **Re-grant after revoke** | Platform | `POST` grant | `active` (clears revoke fields) | `true` if not expired | Still **402** |

**Perpetual default:** `expiresAt: null` on grant when omitted.  
**No automatic uninstall** on revoke or expiry — lifecycle writes do not touch install registry or uninstall tools.

### Authorization

- All lifecycle **mutations** use `requirePlatformAccess()` (superadmin or `PLATFORM_API_KEY`).
- Tenants: **GET only** on `/api/marketplace/entitlements/*`; no revoke/grant under `/api/marketplace/*`.

### HTTP surface (6C-C)

```text
POST   /api/platform/marketplace/entitlements
       → grant (unchanged from 6C-B)

PATCH  /api/platform/marketplace/entitlements/:companyId/:packId
       → { "action": "revoke", "revokeReason"?: string }
       → { "expiresAt": ISO | null }   // set or clear expiry on existing entitlement

DELETE /api/platform/marketplace/entitlements/:companyId/:packId
       → soft revoke (optional JSON/query revokeReason)
```

**PATCH rules:**

- Exactly one intent per request: `action: "revoke"` **or** `expiresAt` key present — not both.
- Revoke on missing doc → **404** `ENTITLEMENT_NOT_FOUND`.
- Revoke when already `revoked` → **200** idempotent (preserve prior revoke metadata unless reason supplied — refresh `revokedBy`/`updatedAt` only on non-idempotent path; idempotent returns existing).
- Expiry PATCH on missing doc → **404**; on `revoked` → **400** (use POST re-grant).
- Expiry PATCH allowed when stored `active` (including time-expired effective state — extends access window without new grant doc semantics).

### Audit (server-controlled)

| Write | Doc fields | `auditLog` |
|-------|------------|------------|
| Revoke | `revokedAt`, `revokedBy`, `revokeReason`, `updatedAt`; preserve `grantedAt` / `grantedBy` | `platform_marketplace_entitlement_revoke` |
| Expiry update | `expiresAt`, `updatedAt`; preserve grant fields | `platform_marketplace_entitlement_expiry_update` |

Clients cannot set `revokedBy` / `grantedBy` directly on PATCH/DELETE.

### Critical invariant (6C-C)

```text
grant  → tenant GET entitled:true  → install still requiresPayment
revoke → tenant GET entitled:false → install still requiresPayment
```

Install-integration gate remains **locked**.

---

## Out of scope (6C-C)

- `marketplaceInstaller.js`, 402 HTTP mapping, Portal/Admin UI, checkout, commit, push, deploy
- Hard delete of entitlement documents (soft revoke only)
