# RS02 — Staging checkout checklist

Use **Paystack test keys** (or Stripe test mode) on a non-production Railway service before live ZAR charges.

## Railway environment (names only — do not commit values)

| Variable | Purpose |
|----------|---------|
| `RS02_SARAH_CHECKOUT` | `true` to enable checkout |
| `PAYSTACK_SECRET_KEY` | Paystack secret (test or live) |
| `PAYSTACK_PUBLIC_KEY` | Optional; public config only |
| `STRIPE_SECRET_KEY` | Stripe secret (if using Stripe) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Optional; public config only |
| `STRIPE_WEBHOOK_TOLERANCE_SEC` | Optional; default `300` |
| `SARAH_CHECKOUT_RETURN_URL` | e.g. `https://sarah.ziricai.com` |
| `RS02_CONSUMER_CHECKOUT_PROVIDER` | Optional `paystack` or `stripe` |

## Webhook URLs (register in provider dashboard)

- Paystack: `https://<api-host>/api/revenue/webhooks/paystack`  
  Events: `charge.success`, `refund.processed` (and/or `charge.reversal`)
- Stripe: `https://<api-host>/api/revenue/webhooks/stripe`  
  Events: `checkout.session.completed`, `charge.refunded`

## Automated gate (local / CI)

```bash
node scripts/pay-02-checkout-verify.mjs
```

(`node scripts/rs02-checkout-verify.mjs` delegates to the same suite.)

## Manual matrix (staging)

1. Paid upgrade → Paystack/Stripe → return URL verify → plan active.  
2. Cancel checkout → plan unchanged (`checkoutCancelled=1`).  
3. Close payment tab → no entitlement until webhook or later verify.  
4. Duplicate webhook / refresh success URL → single entitlement (`duplicate`).  
5. Refund in provider dashboard → consumer returns to free tier; ledger `revoked`.  
6. Wrong account verify → `403 CHECKOUT_FORBIDDEN`.  
7. Public config: `paidCheckoutAvailable: true` when keys present.

## South Africa

- Prefer **Paystack** for ZAR settlement where the entity is SA-based.  
- Confirm Stripe account **region, payout, and ZAR support** with Finance before relying on Stripe for SA consumers.
