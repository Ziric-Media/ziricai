# MC-U-4B — Support Case Contract (APPROVED)

**Gate:** MC-U-4B — closed **APPROVED** (2026-09-19)  
**Prerequisite:** MC-U-4A (Support Architecture Audit)  
**Next:** MC-U-4C — tenant store + tenant APIs + Portal (no MC/platform aggregation)

---

## Terminology

| Layer | Name |
|--------|------|
| Domain object | **SupportCase** |
| Firestore | `supportCases`, `supportCaseActivities` |
| API JSON | `supportCase` / `items[]` |
| Event (unchanged) | **`SupportTicketCreated`** |

---

## Architecture boundary

```text
Tenant Portal (create/view) → Firestore SupportCase (SoT) → tenant APIs
    → Platform API aggregation (MC-U-4D) → Mission Control (read-only)
```

Mission Control **must not** write to `supportCases` in v1 (4C–4F).

---

## Approved decisions (4B)

| Decision | Final |
|----------|--------|
| Case creation | Any **authenticated tenant member** |
| PATCH / status / assign | **owner**, **manager**, **support** only |
| Reopen `resolved` | **No** in v1 |
| MC mutation | **None** in v1 |
| Platform counts | **Honest** exact or **partial** — never imply exact when scan is capped |

---

## Lifecycle (canonical)

Statuses (storage + API): `open` | `assigned` | `waiting` | `resolved`

- No `in_progress`, `closed`, or automatic reopen in v1.
- Transitions: see MC-U-4B proposal; `resolved` is terminal.

---

## Tenant storage

- `companies/{companyId}/supportCases/{caseId}` — authoritative case
- `companies/{companyId}/supportCaseActivities/{activityId}` — flat activity log (`caseId` field)
- Firestore auto-ID; `companyId` on every document
- API boundaries: `toIsoTimestamp()`

---

## Platform API semantics (MC-U-4D — not implemented in 4C)

`GET /api/operations/platform-support-cases`:

- `meta.unavailable: true` — pipeline not connected / read disabled
- `meta.unavailable: false`, empty `cases` — connected, genuinely empty
- `meta.partial: true` — bounded scan, tenant failures, or truncated aggregation

### Counts invariant (4D)

**`cases`** — bounded/paginated platform result (e.g. per-tenant list cap for inbox rows).

**`counts`** — must **never** imply platform-wide exactness when the underlying scan is capped.

- Either **exact** counts from an appropriate aggregate, **or**
- **`partial: true`** counts derived from the **same bounded scan** as documented in `meta.note`.

Example failure mode to avoid: a tenant with 500 open cases contributing only 25 to a platform `"open"` count presented as exact.

---

## External ticketing

In-app SoT first; `externalProvider` / `externalId` reserved; Zendesk/Freshdesk deferred.

---

## MC-U-4C scope

Implement only: schema constants → `supportCaseService` → tenant routes → Portal Support UI.  
No changes to `getPlatformSupportCases()` or Mission Control modules until MC-U-4D.
