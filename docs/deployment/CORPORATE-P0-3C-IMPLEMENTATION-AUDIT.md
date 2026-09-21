# CORPORATE-P0-3C — Implementation audit (pre-commit)

**Status:** IMPLEMENTED — **not committed**; **deploy blocked**  
**Base:** `4860bc4` (P0-3E closed)  
**Worktree:** `.p0-3c-impl`

## Scope (authorized)

| # | Change | Files |
|---|--------|-------|
| 1 | Canonical-first `listTenantConversations`; legacy only with `includeLegacy` | `services/tenants/conversationService.js` |
| 2 | Legacy GET routes strict tenant + canonical reads | `api/app.js`, `services/api/routeRegistry.js` |
| 3 | Production fail-closed missing `companyId` | `services/conversationService.js`, `services/integrations/conversationPipeline.js` |
| 4 | MC API-backed: no Firestore message/list fallbacks in production | `admin/js/admin/services/conversations.js`, `js/admin/services/conversations.js` |

**Out of scope (unchanged):** CRM timeline, Sarah memory, retry queue, legacy store deletion, worker/Portal UI redesign.

## Verifier

`npm run verify:corporate-p0-3c`

## Regression bundle (required before deploy)

`verify:corporate-p0-3a`, `verify:corporate-p0-3b`, `verify:corporate-p0-3e`, `verify:portal-3c-inbox-contract`, `verify:corporate-p0-1`, `verify:corporate-p0-2`
