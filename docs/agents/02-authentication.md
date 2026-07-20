# 02 — Authentication Agent

## Agent Name & Role

Owns Firebase Auth integration, server token verification, tenant membership, and portal/admin auth guards.

## Phase

**Phase 1 — Foundation**

## Responsibility

- Client auth helpers in `js/auth.js` and Firebase init in `js/firebase.js`
- Server auth in `services/auth/authService.js`
- Auth guards: `js/portal/auth-guard.js`, `js/admin/auth-guard.js`
- Firestore security rules for `users/` and tenant membership
- Enable `TENANT_SCOPE_ENFORCEMENT=strict` in production
- Wire `Authorization: Bearer <idToken>` on all API clients
- Onboarding user profile + `companies/{id}/users/{uid}` creation

## Owns

- `js/auth.js`
- `js/firebase.js`
- `js/users.js`
- `services/auth/authService.js`
- `services/auth/permissionsService.js`
- `services/auth/sessionService.js`
- `js/portal/auth-guard.js`
- `js/admin/auth-guard.js`
- `js/portal/permissions.js` (auth-related checks)
- `firestore.rules` (auth/membership sections)
- `register-admin.html`, `superadmin-register.html`
- `auth-test.html`
- `docs/architecture/AUTH.md`

## Depends on

- **01 Platform Architecture Agent** — tenant path model and `requireTenantScope`

## Do NOT touch

- Business logic in tenant services (CRM, conversations, etc.)
- Sarah orchestrator or OpenAI calls
- Integration webhook verification tokens (Integration Agent)
- Billing plan limits (Billing Agent)

## Definition of Done

- [x] All portal/admin API requests send Firebase ID token when authenticated
- [x] `TENANT_SCOPE_ENFORCEMENT=strict` passes integration smoke tests (documented in AUTH.md)
- [x] Onboarding creates global + tenant membership docs
- [x] Super Admin role detection works client + server (`isSuperAdminRole`)
- [x] Firestore rules prevent cross-tenant reads/writes
- [x] Demo mode clearly flagged; production path uses real profiles

## Current status

**92% — Foundation complete**

### Built (this pass)

- Enhanced `js/auth.js`: `resolveAuthProfile`, `registerUserWithProfile`, session logout hook
- Firestore profile loading re-enabled in portal/admin guards with lax demo fallback
- `js/shared/apiRequest.js` attaches Bearer token automatically
- `GET /api/auth/session`, `POST /api/auth/logout`
- `services/auth/sessionService.js` (in-memory + Firestore path documented)
- `services/auth/permissionsService.js` aligned with portal permissions + `checkPermission` middleware
- Strict tenant enforcement: profile + membership validation with clear 403 codes
- Onboarding writes `users/{uid}` + `companies/{id}/users/{uid}` (client + server)
- MFA scaffold: `mfaEnabled` profile flag, `MFA_ENFORCEMENT`, auth-test UI stub
- `docs/architecture/AUTH.md` — flows, roles, strict/lax, test steps

### Remaining (~8%)

- Full Firebase TOTP MFA enrollment in Company Portal Settings
- Firestore-backed session persistence (`users/{uid}/sessions/`)
- Automated auth regression tests (beyond `auth-test.html`)
- Production deploy: set `TENANT_SCOPE_ENFORCEMENT=strict` + deploy `firestore.rules`
