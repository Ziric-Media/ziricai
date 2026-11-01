# G3 — Duplicate remediation and registry alignment (draft plan)

**Status: EXECUTED (2026-11-01).** Authorization: explicit **Authorize G3** from programme owner. Evidence: `docs/audit/g3-post-change/remediation-3699-2026-11-01.json`.

## Scope

| Item | Value |
|------|--------|
| Phone Number ID (masked) | …3699 |
| Active integration docs (pre-G3) | 4 |
| Registry doc (pre-G3) | `wa-env-1209265748933699` — **available**, unassigned |
| Target end state (post-G3, if approved) | Exactly **one** active integration on …3699; registry **assigned** to approved tenant |

## Out of scope

- Client Zero (`ziricai`, …6157, tenant token) — **frozen**
- Registry-first webhook routing (G4)
- Deleting Firestore companies or bulk archive without per-record approval

## Evidence baseline

Before any change, attach:

1. G2.1 post-deploy parity report (script + API).
2. `docs/audit/whatsapp-reconciliation-baseline-suffix-3699-2026-10-31.json`

## Pre-change snapshots

For **each** tenant in the conflict (4 rows), capture before mutating:

- Firestore path: `companies/{companyId}/integrations/{docId}`
- Full integration document JSON (redact tokens if present)
- Company metadata: `companies/{companyId}` (name, created, tags, `p0-2` lineage if any)
- Last inbound/outbound WhatsApp activity (if available via ops logs)
- Operator note: intended purpose of this integration

Store under `docs/audit/g3-pre-change/<companyId>/` with timestamp.

## Per-tenant decision table (complete before execution)

| companyId | G2 classification | Owner / purpose (TBD) | Approve deactivate? (Y/N) | Approve keep active? (Y/N) | Signed by | Date |
|-----------|-------------------|------------------------|---------------------------|----------------------------|-----------|------|
| `central-motors-rtb` | keep_active_candidate | Backbone sample tenant | N/A | **Y** | programme owner | 2026-11-01 |
| `p0-2-final-muaguvq8-usmg` | deactivate_candidate | P0-2 QA duplicate on 3699 | **Y** | N | programme owner | 2026-11-01 |
| `p0-2-final-muagwqwu-wnn1` | deactivate_candidate | P0-2 QA duplicate on 3699 | **Y** | N | programme owner | 2026-11-01 |
| `p0-2c-live-muag3zbz-3vzt` | deactivate_candidate | P0-2 live test duplicate on 3699 | **Y** | N | programme owner | 2026-11-01 |

Do not execute until every **deactivate** row has explicit **Y** and signature.

## Execution order (only after approvals)

1. **Deactivate** approved duplicate integrations (status → inactive/disconnected per runbook; do not delete docs unless separately approved).
2. **Verify** reconciliation report: `activeIntegrationCount` === 1; classifications clean.
3. **Assign registry** `wa-env-…3699` to approved tenant (`central-motors-rtb` if still the approved keep candidate) via existing assign-pool API with `operatorId` and `reason`.
4. **Post-change verification** — re-run script + API; compare to expected end state.
5. **Rollback instructions** (prepare before step 1):
   - Restore integration doc fields from pre-change snapshot JSON.
   - Release registry assignment if assign succeeded but integration rollback needed.
   - Do **not** rollback without operator sign-off.

## Consequences of deactivation (to document per tenant)

- Inbound Hi messages will no longer route to that `companyId` for …3699.
- Outbound sends using that integration identity must fail or fall back per existing code paths.
- MC/Portal UX for that company may show disconnected WhatsApp — expected if duplicate was erroneous.

## Registry assignment rule

**Registry assign happens last**, only when:

- Exactly one active integration remains on …3699, and
- That integration’s `companyId` matches the assign target, and
- G3 execution sign-off is recorded.

## Authorization gate

G3 execution requires explicit message: **“Authorize G3”** (or equivalent) from programme owner, plus completed per-tenant approval table.
