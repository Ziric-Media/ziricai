# PAY-02D-I — RS06 credit pack (hosted Paystack TEST)

**SKU:** `rs06.credits.consumer.500.zar` (500 credits, R99 TEST)  
**Prerequisite:** RS02 TEST closeout complete; PAY-02E deployed.

---

## Preconditions

| Check | Expected |
|-------|----------|
| `RS02_SARAH_CHECKOUT` | `false` |
| `RS06_CREDITS_CHECKOUT` | `true` (during window only) |
| `REVENUE_COMMERCIAL_OVERRIDE` | `disabled` |
| Paystack keys | **TEST** only |
| Allowlisted test consumer | Firebase UID on RS06 allowlist (same pattern as RS02) |

---

## Steps

1. Railway: set `RS06_CREDITS_CHECKOUT=true` (keep RS02 **false**). Redeploy if required.
2. Sign in to Sarah App as allowlisted test user.
3. `POST /api/revenue/subscription/checkout` with `{ skuId: "rs06.credits.consumer.500.zar", provider: "paystack" }`.
4. Complete Paystack TEST payment.
5. Confirm webhook `charge.success` → HTTP **200** on `/api/revenue/webhooks/paystack`.
6. Confirm credit top-up balance increased once (no duplicate on verify replay).
7. Confirm checkout session `status: completed` (not `pending`).
8. Paystack dashboard: refund TEST charge → `refund.processed` → credits clawed back / ledger `revoked`.

---

## Evidence to capture

- Payment reference (redact in docs).
- Verify API JSON (`checkoutKind: rs06_credit_pack`).
- Webhook log line (status 200, no signature errors).

---

## Rollback (mandatory)

1. `RS06_CREDITS_CHECKOUT=false`
2. Refund any open TEST charges.
3. Confirm `GET /api/revenue/config/public` shows checkout flags **false**.
4. Paste evidence into PAY-02 final acceptance notes.

---

## Automated regression (no live Paystack)

```bash
node scripts/pay-02-checkout-verify.mjs
```