# PAY-02 — Engineering closeout (hosted one-time Paystack / Stripe)

**Date:** 2026-11-18  
**Scope:** RS02 Sarah Plus, RS06 credit pack, Paystack TEST path, session consistency (PAY-02E)  
**Out of scope:** PAY-03 automatic monthly renewals, LIVE keys, public checkout enabled in production

---

## Automated gate (local / CI)

```bash
node scripts/pay-02-checkout-verify.mjs
```

Includes: RS02 consumer + Paystack + Stripe, hardening, webhook security, refunds, RS06 credit pack, PAY-02E session repair.

Legacy alias: `node scripts/rs02-checkout-verify.mjs` (delegates to the script above).

---

## Programme status

| Item | Status |
|------|--------|
| RS02 one-time checkout (Paystack TEST) | **Proven** — [formal closeout](./PAY-02D-I-RS02_FORMAL_CLOSEOUT.md) |
| PAY-02E session `pending` vs ledger `captured` | **Done** — `ensureSessionCompleted` + tests |
| RS06 credit pack (code + tests) | **Done** — hosted TEST window not yet run |
| Operator session repair | **Done** — `scripts/repair-checkout-sessions-pending.mjs` |
| Production checkout flags | **Off** — `RS02_SARAH_CHECKOUT=false`, `RS06_CREDITS_CHECKOUT=false`, `REVENUE_COMMERCIAL_OVERRIDE=disabled` |
| PAY-03 recurring renewals | **Future programme** — [spec](../architecture/PAY-03_RS02_RECURRING_SUBSCRIPTIONS.md) |

---

## Production posture (unchanged)

Do **not** enable consumer checkout or LIVE Paystack until product sign-off and a controlled test window ([controlled test plan](./PAY-02D-I_CONTROLLED_TEST_PLAN.md)).

Paystack TEST keys and webhook URL configuration: [Phase 4 config](./PAY-02D-PHASE4_PAYSTACK_TEST_CONFIG.md).

---

## Spencer — when you are back (manual only)

1. **Optional Firestore repair** (historical `pending` sessions with captured ledger):  
   `railway run node scripts/repair-checkout-sessions-pending.mjs` (dry-run) then `--apply` if the report looks right.
2. **RS06 hosted TEST:** follow [RS06 runbook](./PAY-02D-I-RS06_RUNBOOK.md) (RS02 flag off, RS06 on, one credit pack, rollback).
3. **PAY-02 final acceptance:** after RS06 evidence, confirm both flags off and run `pay-02-checkout-verify` on the deployed commit.

---

## Definition of “final functionality” for PAY-02

- One-time hosted checkout for RS02 and RS06 with Paystack (and Stripe parity in code).
- Webhook verify, idempotency, refunds/clawback, allowlist/kill-switch behaviour.
- Session document status aligned with ledger on success and duplicate delivery.

**Not included until PAY-03:** subscription plans, renewal worker, grace period, cancel API.