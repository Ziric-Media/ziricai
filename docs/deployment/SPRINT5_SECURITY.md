# Sprint 5 — Security Hardening

## Implemented

### Route protection

| Route | Middleware |
|-------|------------|
| `GET /api/operations/metrics` | `requirePlatformAccess()` |
| `GET /api/operations/activity` | `requirePlatformAccess()` |
| `GET /api/operations/command-center` | `requirePlatformAccess()` |
| `POST /api/platform/provision/company` | `requirePlatformAccess()` + rate limit |
| `POST /api/platform/provision/agent` | `requirePlatformAccess()` + rate limit |

`requirePlatformAccess()` accepts:

1. Firebase superadmin session (`Authorization: Bearer <idToken>`), or
2. `X-Platform-Api-Key: <PLATFORM_API_KEY>` (or Bearer token matching key)

### Input validation

- `validateCompanyIdParam()` — alphanumeric + `_-` length 2–63
- `requireBodyFields()` — onboarding start/complete required fields

### Rate limiting

- `authRateLimit('provision'|'onboarding'|'auth')` on sensitive POST routes

### Audit log stub

- `services/audit/auditLog.js` — in-memory ring buffer
- Logs: `provision_company`, `provision_agent`, `session_loaded`, `cross_tenant_denied`, `platform_access_denied`

### Production env

```bash
TENANT_SCOPE_ENFORCEMENT=strict
STORAGE_BACKEND=firestore
NODE_ENV=production
PLATFORM_API_KEY=<long-random-secret>
```

Documented in `.env.example` and `firestore.rules` header comments.

## Firestore production gaps

| Gap | Mitigation |
|-----|------------|
| Platform registry in memory | Persist `platform/companies` collection |
| Audit log in memory | Write to Firestore `platformAudit` |
| Job queue in-process | Redis / Cloud Tasks |
| Webhook signature verification | Enable Meta app secret validation |
| CI strict-auth tests | Add `TENANT_SCOPE_ENFORCEMENT=strict` job |

## Verification

```bash
# Should return 401 without auth
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/operations/metrics

# With API key (when PLATFORM_API_KEY set)
curl -H "X-Platform-Api-Key: $PLATFORM_API_KEY" http://localhost:3000/api/operations/metrics
```

WhatsApp webhook `/webhook` remains unauthenticated (Meta verify token only) — by design.
