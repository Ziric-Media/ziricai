# SNET-01a — ADR: Opaque Sarah Network IDs (SN-ID)

**Status:** Accepted (implemented in SNET-01a)
**Date:** 2026-11-08
**Context docs:** [SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md](./SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md) §4, [SNET_01_MASTER_FUNCTIONAL_SPEC.md](./SNET_01_MASTER_FUNCTIONAL_SPEC.md) §4

## Context

The network has no identity of its own: a tenant is a `companyId` (non-uniform, encodes demo/test/pilot semantics, is a Firestore path key and appears in webhooks/URLs), a person is a Firebase `uid`, and "Company Sarah" is the string `company_sarah:{companyId}`. One business can span several tenants (Central Motors: `demo-central-motors`, `central-motors-rtb`). Re-using `companyId` publicly would leak environment semantics and widen the attack surface.

## Decision

1. **SN-ID is a new, opaque, platform-minted, immutable identifier.**

   ```
   sn_{type}_{16 chars}      e.g. sn_org_7K2M9QXH4T3VWB5D
   ```

   - `16 chars` = 80 random bits (`crypto.randomBytes(10)`), Crockford base32 (no `I L O U`). Validated by `^sn_(biz|org|brn|ai|per)_[0-9A-HJKMNP-TV-Z]{16}$`.
   - Random only — **no sequential counters** (avoids enumeration and a global write hotspot).
   - Never derived from, or reversible to, `companyId`, `uid` or a tenant slug. Never changes once minted; if an entity is retired it is `suspended`/delisted, never re-keyed.
   - An SN-ID is **not a secret and not proof of authorization**. APIs that accept it still enforce auth + tenant/consumer scope and resolve `snId → companyId` server-side.

2. **Types** (`type` segment):

   | Type | Entity | Status in SNET-01a |
   |------|--------|--------------------|
   | `org` | Tenant-bound organisation (one per `companyId`) | **Minted** at provisioning / directory publish |
   | `biz` | Umbrella business (parent of N tenants/orgs, e.g. Central Motors) | Reserved; set via `parentSnId` later |
   | `brn` | Branch / location | Reserved |
   | `ai`  | Agent (Company Sarah, employee agent, Personal Sarah) | Reserved (SNET-05). Supersedes the audit's provisional `agt` label |
   | `per` | Person (maps to Firebase `uid`) | Reserved; minted lazily on first network action, no bulk backfill |

3. **`companyId` and tenant slug remain the tenant key.** SN-ID is a separate namespace added *alongside* existing ids (`uc_*`, `sarah_app::*`, `snr_*`, `personId ≡ uid` are unchanged — dual-key period, no rewrites). Consumers never supply `companyId` for authorization decisions on network APIs.

4. **One org entity per tenant** (+ optional `parentSnId` to a `biz` entity later) — simpler isolation and per-tenant consent than N:1 `companyIds[]`.

5. **Mapping is a Firestore reverse index, written create-if-absent in a transaction** so mint is idempotent and safe under concurrency/backfill.

## Firestore paths (server-written via Admin SDK; client default-deny)

```
networkEntities/{snId}
  snId, kind ('org'), status ('draft'|'listed'|'suspended'), version, schemaVersion,
  refs: { companyId },                   # join to today's world
  displayName, handle (null; vanity, mutable, not identity),
  verification: { state: 'unverified' }, createdAt, updatedAt

networkRefs/{kind}__{refKey}             # e.g. org__smilemore-demo
  snId, kind, companyId, createdAt       # create-if-absent => idempotent

businessDirectory/{companyId}            # existing constant; published Discover card (legacy key kept)
```

Constants live in `services/database/schema.js` (`NETWORK_ENTITIES`, `networkEntityPath`, `networkRefPath`, `BUSINESS_DIRECTORY`). Memory adapter is used when `STORAGE_BACKEND=memory` or Admin SDK is unavailable (tests/local).

**Directory decision (audit §11.4):** keep `businessDirectory/{companyId}` as the *published card* and `networkEntities` as *identity*; do not introduce a second directory. Directory docs stay keyed by `companyId` for backward compatibility (SmileMore `smilemore-demo`); linking a card to its `snId` goes through `networkRefs`.

## Lifecycle (SNET-01a)

- `provisionCompany` → `ensureOrgEntity(companyId)` → `status: draft` (not listable).
- `upsertBusinessDirectoryEntry` / first directory hydrate of a seed → entity `listed` when `discoverability === 'public'`, else `draft`. `suspended` is never auto-downgraded.
- Reads: `GET /api/network/v1/entities?companyId=` and `GET /api/network/v1/entities/:snId`, restricted to members of the owning company (or superadmin).

## Consequences

- Tenants provisioned before this change have no entity until published or backfilled (backfill script is SNET-01 work; `GET` returns `404 ENTITY_NOT_FOUND`).
- Test/demo/UNKNOWN eligibility is **not** enforced server-side yet; listing is still gated by the directory's `discoverability` and the pilot allow-list. Server-side eligibility remains SNET-01a item 5 in the audit.
- Rename of `agt` → `ai` is documentation-only; no `agt` ids were ever minted.

## Alternatives rejected

- **Re-label `companyId`:** leaks test/demo semantics, no N:1 support, public exposure of tenant path key.
- **Sequential IDs:** enumerable; needs a transactional counter.
- **UUID v4:** acceptable but long/ugly for handles and QR links; typed prefix aids routing and log triage.
