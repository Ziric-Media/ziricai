# PAY-02 — Payment programme roadmap (hosted one-time)

**Last updated:** 2026-11-17

| # | Work package | Status | Notes |
|---|----------------|--------|--------|
| 1 | **PAY-02D-I RS02** — Paystack TEST, Sarah Plus R99 | **Done** | [Closeout](./PAY-02D-I-RS02_FORMAL_CLOSEOUT.md) |
| 2 | **PAY-02E** — Checkout session consistency | **Done** | [Issue](./PAY-02E_CHECKOUT_SESSION_CONSISTENCY.md) · [Closeout](./PAY-02_ENGINEERING_CLOSEOUT.md) |
| 3 | **PAY-02D-I RS06** — Credit top-up TEST (500 credits, R99) | **Ready (hosted)** | [Runbook](./PAY-02D-I-RS06_RUNBOOK.md) |
| 4 | **PAY-02 final acceptance** | **Blocked on RS06 evidence** | Engineering gate: `pay-02-checkout-verify.mjs` |
| 5 | **PAY-03** — Automatic monthly renewals | **Future programme** | Retries, grace, cancel — not PAY-02 |

**Current production posture (post RS02 closeout):** `RS02_SARAH_CHECKOUT=false`, `RS06_CREDITS_CHECKOUT=false`, `REVENUE_COMMERCIAL_OVERRIDE=disabled`, Paystack TEST keys configured, deploy `6a54b2d6`.