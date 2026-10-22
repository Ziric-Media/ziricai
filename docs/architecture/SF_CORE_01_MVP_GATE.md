# Sarah Finance — MVP completion gate

**Purpose:** Finish **basic** Sarah Finance so the programme can move to Sarah Ops, HR, and Admin. This is **not** the full SF-CORE-01 finance employee.

**Authoritative status:** [`SF_CORE_01_GAP_MATRIX.md`](./SF_CORE_01_GAP_MATRIX.md) (MVP vs deferred rows).  
**Full spec programme (historical / advanced):** [`SF_CORE_01_FULL_PROGRAM.md`](./SF_CORE_01_FULL_PROGRAM.md).

---

## Six MVP capabilities

| # | Capability | MVP requirement |
|---|------------|-----------------|
| 1 | Understand finances | Answer from authorised tenant data: invoices, transactions, GL, summaries |
| 2 | Create invoices & quotations | Draft + correct totals + confirm before persist |
| 3 | Basic accounting records | COA, GL accounts, manual journal drafts, trial balance read |
| 4 | Explain honestly | Summarise available data; state gaps; no invented profit/cash/bank figures |
| 5 | Protect data | Tenant isolation, confirm-gated writes, honest errors |
| 6 | Finance portal | Open module, view records, Sarah for supported tasks — no broken nav |

---

## Acceptance gate (must pass)

| Check | Required result | Primary evidence |
|-------|-----------------|------------------|
| Ask about finances | Real tenant data via read tools | F5 F-001–F-005; loopback chat |
| Invoice / quotation | Draft + totals | F5 F-007–F-009; F2 verify |
| Confirm action | Persisted record | F5 F-008, F-010 |
| Ledger accounts | Correct COA/GL | F3 / F3b verify |
| Trial balance | Supported projection | F3 verify + Sarah GL tools |
| Permissions | No cross-tenant / unsafe writes | F-016, tool-policy script |
| Unsupported questions | Clear limitation | F-006 manual (MVP subset) |
| Portal journey | Core screens load | Static verify + manual smoke |

**Not required for MVP:** Closing every F-001–F-030 row; bank feeds; reconciliation engine; budgets/forecasts; period close; statutory reports; tax filing; Sarah payment execution; industry presets.

---

## Explicitly deferred (document only)

- Bank feeds and full bank reconciliation (SF-05)
- Advanced budgets, forecasting, financial planning (SF-07)
- Sarah / automated payment execution (F4) — **remain disabled** until [payment remediation](./FINANCE_PAYMENT_REMEDIATION_AND_TEST_PLAN.md) sign-off
- Month-end close, statutory reporting, advanced tax (SF-10–SF-12)
- Complex audit-stream and recovery (F-021–F-024)
- BOS quotation E2E (F-014–F-017) beyond basic quotation draft
- Industry-specific accounting rules and integrations

**Still fix:** Security, data-integrity, and correctness defects in **existing** MVP paths (including F-006 collections vs AR).

---

## Verification commands (local)

```bash
node scripts/verify-finance-sarah-acceptance-suite.mjs
node scripts/verify-finance-sarah-f006-probe.mjs
node scripts/verify-finance-sarah-f006-probe.mjs --seed
```

Loopback: `FINANCE_ACCEPTANCE_SKIP_PREPARE=1 npm run dev:finance-acceptance` on `:3099` when F-016 / F1 loopback cases are needed.

Archive stdout under `docs/architecture/evidence/` with date. Historical passes are not current passes.

---

## MVP gate decision (2026-10-22)

| Area | Meets MVP? | Notes |
|------|------------|-------|
| Sarah read + drafts + GL | **Yes (local)** | `verify-finance-sarah-acceptance-suite.mjs` PASS (re-run same day) |
| Permissions | **Yes (local)** | F-016, tool-policy |
| Honest reporting | **Yes (local, MVP subset)** | F-006 S3 fixed via orchestrator prefetch; S1/S7 pass on loopback — full F-006 log not required for MVP |
| Portal | **Conditional** | Core module in `js/portal/`; sync `app/` + live smoke before calling production-ready |
| Production-accepted | **No** | Pilot not run; Railway API version not verified |

**Local MVP gate:** **Met** for Sarah backend + loopback behaviour. **Not met** for production sign-off.

**Programme action:** Stop **new** Sarah Finance scope; Sarah Ops — spec [`SARAH_OPS_CORE_CAPABILITY_SPEC.md`](./SARAH_OPS_CORE_CAPABILITY_SPEC.md), gate [`SARAH_OPS_MVP_GATE.md`](./SARAH_OPS_MVP_GATE.md); keep advanced SF rows deferred in gap matrix.
