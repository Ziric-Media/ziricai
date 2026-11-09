# Sarah Trust & Consent

**Scope:** User-controlled permissions, auditable AI-to-AI communication, and verifiable business identity — a **core product differentiator** for Sarah App.

---

## Principles

1. **User is sovereign** — recommendations yes; consequential actions only with approval.
2. **Minimum necessary disclosure** — field-level, purpose-bound, time-bound.
3. **Revocable** — any grant can be withdrawn; future actions stop; audit retained.
4. **Transparent** — activity history shows what Sarah did, which Sarah, and which grant applied.
5. **Verified businesses** — Company Sarah identity binds to a registered tenant, not a client-supplied name.

---

## Permission domains (user-controlled)

| Domain | User controls | Default |
|--------|---------------|---------|
| **My Knowledge access** | Which sections Personal Sarah may read | All sections user marked `sarahMayUse` |
| **Business chat context** | Whether Personal Sarah may summarize Chats threads | Opt-in per company or global |
| **Sarah Network** | Which companies Personal Sarah may contact on user's behalf | Per enquiry approval |
| **Field disclosure** | Exact fields/documents sent to a Company Sarah | Per grant |
| **Business contact** | Whether a company may push notifications / marketing | Off unless follow + notify enabled |
| **Auto-follow** | Chat does **not** auto-follow (separate action) | Off |

Settings live in **Profile → Privacy & Sarah Trust**.

---

## Grant types (`consents/{uid}/grants/{grantId}`)

| `actionType` | Meaning | Typical expiry |
|--------------|---------|----------------|
| `disclose_fields` | Share specific profile/KB fields with `recipientCompanyId` | One-time or session |
| `disclose_document` | Share one document id | One-time |
| `sarah_network_enquiry` | Personal Sarah may send structured request to company | One request id |
| `book_appointment` | Execute booking tool | One booking |
| `submit_application` | Submit form to company workflow | One submission |
| `purchase` | Commit to quoted price | One transaction |
| `payment` | Charge payment method | One payment |
| `company_may_notify` | Marketing/service notifications | Recurring until revoked |

Grant record fields:

- `status`: `pending` | `approved` | `denied` | `revoked` | `expired`
- `recipient`: `{ companyId, conversationId?, requestId? }`
- `dataScope`: `{ sectionKeys[], fieldPaths[], documentIds[] }`
- `purpose`: human-readable string shown in UI
- `approvedAt`, `expiresAt`, `revokedAt`, `revokedBy` (`user` | `system`)
- `auditTrail`: links to `sarahNetwork/audit` events

**Rule:** A grant for `disclose_fields` does **not** authorize `submit_application`.

---

## Approval UX flow

1. Personal Sarah determines a consequential action is needed.
2. API returns `pendingApproval` with `grantDraft` (not executed).
3. Sarah App shows **Sarah Trust** card: who receives what, for what purpose, until when.
4. User **Approve** / **Deny** / **Edit scope**.
5. Server writes grant + executes action idempotently.
6. Activity log entry with grant id.

Company Sarah **never** sees pending grants until user approves disclosure portions.

---

## Sarah Network consent

For `personal_to_company` messages:

| Step | Consent check |
|------|----------------|
| User opens chat with verified company | Implicit consent to **conversation** only |
| Personal Sarah asks school A for fees | Explicit `sarah_network_enquiry` or bundled multi-select approval |
| Personal Sarah sends user's CV | Explicit `disclose_document` scoped to that school |

Envelope `consent.grantId` required on server-side dispatch ([SARAH_NETWORK_PROTOCOL.md](./SARAH_NETWORK_PROTOCOL.md)).

---

## Company verification

| Level | Meaning | Discover badge |
|-------|---------|----------------|
| `unlisted` | Not in Discover | — |
| `listed_unverified` | Self-registered profile | “Unverified” |
| `verified` | MC or automated KYC passed | “Verified business” |
| `suspended` | Abuse / fraud | Hidden |

Consumer **Company Sarah** chats should require at least `listed_unverified`; high-trust flows (payments, applications) require `verified`.

Verification audit in Mission Control (future module); no tenant can set own `verified` flag client-side.

**Paid advertising must not grant verification.** RS03 Boost and RS04 Discover sponsorship are separate from `verified` status.

---

## Status, Discover, and sponsored content

| Rule | Enforcement |
|------|-------------|
| Sponsored posts and Discover cards are **labelled** | UI + API `sponsored: true`, `campaignId` |
| Organic Discover and For You ranking remain | Sponsored slots capped; no pay-to-win Personal Sarah recommendations |
| User ad preferences | Profile settings (future): reduce sponsored frequency |
| Content reporting | Report post/profile → moderation queue (MC) |
| Impersonation | Verified badge policy; takedown for fake businesses/creators |
| Creator/user publishing | Account permissions + rate limits; spam detection |

See [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md).

---

## Revocation

| Action | Effect |
|--------|--------|
| Revoke grant | Block linked action; invalidate `grantId` for new requests |
| Revoke company notify | Stop push/email from that tenant |
| Block company | No new chats; hide from feed |
| Disable “Personal Sarah reads Chats” | Summaries stop; no retroactive tenant access |

Historical audit and completed transactions remain for legal retention windows.

---

## Auditable communication

Every Personal ↔ Company interaction logs:

- `actorType`, `uid`, `companyId`
- `messageClass`: `user_visible` | `network_structured` | `system`
- `grantIds[]`
- `requestId` / `responseId`

User-facing **Activity** tab: plain language (“Sarah asked SmileMore about appointment times — you approved sharing your name and phone”).

---

## Competitive positioning

Trust is not a settings screen — it is **default-deny disclosure**, **visible approvals**, and **verified businesses**. Marketing message: *“Sarah works for you. Businesses never get your whole life story unless you say so.”*

---

## POPIA alignment

- Lawful basis: consent + contract for service
- Purpose specification on each grant
- Data minimization via `dataScope`
- Right to withdraw consent → revoke grant APIs
- Right to access → export ([SARAH_APP_DATA_PROTECTION.md](./SARAH_APP_DATA_PROTECTION.md))

---

## Related

- [SARAH_APP_IDENTITY_AND_ACCESS.md](./SARAH_APP_IDENTITY_AND_ACCESS.md)
- [PERSONAL_SARAH_ARCHITECTURE.md](./PERSONAL_SARAH_ARCHITECTURE.md)
