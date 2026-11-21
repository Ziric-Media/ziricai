# Sarah App — Identity and Access

**Scope:** Shared ZiricAI identity with **portal-separated authorization** and **Sarah Trust & Consent**.

---

## One person, one UID

Firebase Authentication remains the single sign-on mechanism ([AUTH.md](./AUTH.md)).

A human may simultaneously hold:

| Hat | Record | Portal |
|-----|--------|--------|
| Individual | `userProfiles/{uid}` + consumer flags on `users/{uid}` | Sarah App |
| Employee / owner | `companies/{cid}/users/{uid}` | Company Portal |
| Platform operator | `users/{uid}.role = superadmin` (+ gateway flags) | Mission Control |

**Rule:** Holding a Sarah App account does **not** create tenant membership. Holding a Company Portal job does **not** grant access to another user’s My Knowledge.

---

## Proposed identity records

### `users/{uid}` (existing — extend)

| Field | Purpose |
|-------|---------|
| `email`, `displayName`, `photoURL` | Shared account |
| `role` | `superadmin` only for platform ops (unchanged) |
| `accountKinds` | e.g. `["consumer", "business"]` — **portal eligibility flags only** (see below) |
| `primaryCompanyId` | Legacy / business default (unchanged for portal strict mode) |
| `platformGatewayAccess` | MC gateway RBAC (unchanged) |
| `createdAt`, `updatedAt` | Audit |

### `userProfiles/{uid}` (new — consumer)

| Field | Purpose |
|-------|---------|
| `firstName`, `lastName`, `preferredName` | Greeting (“Hello Spencer”) |
| `locale`, `timezone` | Personal Sarah context |
| `onboardingCompletedAt` | App shell |
| `popiaConsentVersion` | Legal acceptance timestamp |

### `userPreferences/{uid}` (new)

Notifications, theme, Discover filters, **follow vs notify** toggles per company.

### `companies/{companyId}/users/{uid}` (existing)

Unchanged tenant RBAC (`owner`, `manager`, …).

---

## One identity, many hats (without privilege mixing)

The same person may simultaneously be:

| Hat | Authorization source | Must not grant |
|-----|----------------------|----------------|
| Sarah App user | `userProfiles/{uid}` + `requireConsumerScope()` | Tenant CRM, MC, other users’ data |
| Business owner / employee | `companies/{cid}/users/{uid}` + role | Consumer My Knowledge, other tenants |
| Customer of many businesses | `userConversations` participant | Portal operator tools |
| Platform operator | `users/{uid}.role = superadmin` (+ gateway flags) | Bulk consumer PII (default deny) |

**Critical rule:** `accountKinds` (or similar profile flags) indicate which portals the account **may attempt to open**. They **never** substitute for server-side checks:

| Portal | Required proof |
|--------|----------------|
| Sarah App | Valid Firebase token + consumer profile + `requireConsumerScope()` |
| Company Portal | Token + `users/{uid}` + `companies/{cid}/users/{uid}` membership + matching `companyId` |
| Mission Control | Token + superadmin role (or platform API key) |

A user with `accountKinds: ["consumer", "business"]` who lacks membership for `company-x` **must receive 403** on that tenant’s APIs. A business-only user without consumer profile **must receive 403** on `/api/personal-sarah/*`.

Signup flows:

- **Sarah App signup** → creates Auth user + `userProfiles/{uid}` + `accountKinds` includes `consumer` (no auto-tenant).
- **Company invite** → adds membership doc only; consumer profile optional.
- **Same email** joining both → append kinds; still two authorization paths.

---

## Middleware model (API)

| Middleware | Used by | Checks |
|------------|---------|--------|
| `requirePlatformAccess()` | Mission Control | Superadmin or platform API key |
| `requireTenantScope()` | Company Portal | Bearer + profile company + membership |
| **`requireConsumerScope()`** (new) | Sarah App | Bearer + `accountKinds` includes `consumer` + `userProfiles/{uid}` exists |
| **`requireConsumerOrTenant()`** (new) | Shared assets (e.g. avatar upload) | Either valid consumer or tenant member |

Consumer routes **must not** accept `companyId` alone as authorization. For Company Sarah chats, validate `userConversations` participation or create thread via Discover with authenticated user id.

---

## Sarah Trust & Consent

Full specification: [SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md).

### Action authority (defaults)

| Action | Personal Sarah | Company Sarah |
|--------|----------------|---------------|
| Answer general questions | Allowed | Allowed (tenant scope) |
| Search Discover / compare | Allowed | N/A |
| Recommend options | Allowed | Allowed |
| Prepare application pack | Allowed | Allowed (templates) |
| **Submit** application | **User approval** | **User approval** (consumer initiator) |
| **Book** appointment | **User confirmation** | **User confirmation** |
| **Send** personal document to business | **Explicit disclosure approval** | Cannot read personal KB |
| **Purchase / pay** | **Explicit approval** | Quote only until user confirms |
| **Share** health / finance categories | **Category-specific approval** | Never direct access |

### Approval record (`consents/{uid}/grants/{grantId}`)

Each grant stores:

- `actionType` (e.g. `disclose_document`, `book_appointment`, `submit_application`)
- `recipient` (`companyId`, optional `conversationId`)
- `dataScope` (fields or document ids)
- `financialImpact` (optional)
- `oneTime` | `recurring` + `expiresAt`
- `approvedAt`, `revokedAt`
- `auditRequestId` link to Sarah Network request

Sarah must not treat a broad past approval as permission for a different action.

---

## Session and device security

Reuse patterns from [sessionService.js](../../services/auth/sessionService.js) (`users/{uid}/sessions/{sessionId}`):

- Sarah App: device list, remote sign-out, refresh token rotation (Firebase default)
- Account deletion: cascade consumer collections per retention policy; **do not** delete tenant CRM data when a user deletes Sarah App account (anonymize participant refs in shared conversations)

---

## POPIA (South Africa) — architectural hooks

- **Purpose limitation:** personal knowledge sections tagged with `purpose` and `retentionDays`
- **Consent:** versioned privacy policy + granular disclosure grants
- **Access / deletion:** Profile → export and delete My Knowledge
- **Operator access:** Mission Control cannot browse consumer KB without legal process (no superadmin read on `personalKnowledge/` by default)

---

## Migration notes (future U1)

1. Existing Firebase users gain `accountKinds: ["business"]` only.
2. Sarah App signup sets `accountKinds` includes `consumer` without requiring `companyId`.
3. Same email may later accept a company invite → append `business` kind + membership doc.
4. Strict tenant mode unchanged for `/api/companies/*`.
