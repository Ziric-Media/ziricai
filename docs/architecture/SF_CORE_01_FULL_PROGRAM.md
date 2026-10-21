# SF-CORE-01 — Full program (Sarah Finance + workspace Finance)

**Spec reference:** SF-CORE-01 v1.0 — matrix in [`SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md`](./SARAH_FINANCE_SF_CORE_01_F0_AUDIT.md).

---

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| **F0** | Audit | **Done** |
| **F1** | SF-01 read intelligence | **Done** |
| **F2** | Confirm-gated invoice / quotation / ledger entry | **Done** |
| **F3** | Trial balance projection + default COA template | **Done** |
| **F3b** | Tenant `financeGlAccounts` + `financeJournalEntries` + Sarah/API | **Done** |
| **F4** | Sarah invoice payments | **Ready** — set `FINANCE_SARAH_PAYMENTS_ENABLED=1` on API after [payment remediation](./FINANCE_PAYMENT_REMEDIATION_AND_TEST_PLAN.md) sign-off; portal UI may stay disabled |
| **F5** | Automated acceptance F-001–F-030 (where automatable) | **Partial** — [`SF_CORE_01_F5_ACCEPTANCE_MATRIX.md`](./SF_CORE_01_F5_ACCEPTANCE_MATRIX.md), `verify-finance-sarah-f5-acceptance.mjs` |

**Still not claimed:** Bank feeds, automated reconciliation, budgets/forecasts, period close locks, statutory filings, full production acceptance sign-off.

---

## F3b — Tenant COA + manual journals

- **Storage:** `companies/{id}/financeGlAccounts`, `financeJournalEntries` (auto-seed default COA on first read).
- **API:** `GET/POST .../gl-accounts`, `GET/POST .../journal-entries`, `GET .../journal-entries/:id`.
- **Sarah read:** `viewFinanceChartOfAccounts`, `viewFinanceJournalEntries`, `viewFinanceTrialBalance` (includes journals).
- **Sarah write:** `prepareFinanceManualJournalDraft` → `confirmFinanceWrite`.

---

## Verification

```bash
node scripts/verify-finance-sarah-acceptance-suite.mjs
```

Includes F3b, F4 readiness, F5 acceptance (payments off by default).

### F5 deferred (manual / future phases)

Budgets (F-012–F-013), BOS quotation E2E (F-014–F-017), payment production (F-018–F-020), audit stream (F-021–F-024), statutory reports (F-028–F-029), full production sign-off on live tenants.

---

## Deploy

1. Railway — all F1–F3b code; optional `FINANCE_SARAH_PAYMENTS_ENABLED=1` for F4.
2. Netlify portal.
3. Smoke: COA list, post balanced journal via Sarah confirm flow, trial balance includes journal lines.
