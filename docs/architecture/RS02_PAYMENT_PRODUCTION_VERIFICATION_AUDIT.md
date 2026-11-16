# RS02 — Stripe + Paystack Production Verification Audit

**Date:** 2026-11-10  
**Branch audited:** `programme/sarah-u1-u5-r0` (read-only; no commits, deploys, or env changes)  
**Auditor:** Cursor agent (automated code + config review)  
**Scope:** One-time consumer checkout (RS02 Sarah plans), webhooks, verification, entitlement activation  

---

## 1. Executive summary

The RS02 implementation follows sound direction: checkout sessions are created server-side, entitlements are applied only after provider verification (redirect handler calls `GET /api/revenue/subscription/checkout/verify`, which calls Paystack/Stripe APIs), webhook routes use raw-body capture before JSON parsing, and duplicate completion is partially guarded via checkout session `status === "completed"`.

However, several **gaps fall short of production-ready financial controls**: explicit provider selection can **silently fall back** when the requested provider is not configured; **amount, currency, SKU, and consumer UID are not reconciled** against provider responses at verify time; there is **no immutable payment/event ledger**; **refunds/disputes are not handled**; **webhook signature and abuse scenarios are largely untested**; and **production currently exposes `checkoutEnabled: true` while both `paystackEnabled` and `stripeEnabled` are false**, so paid checkout cannot succeed until keys are configured (while the Sarah UI may still invite upgrades).

**Verdict:** **BLOCKED — critical issues must be fixed before further real payments.**

---

## 2. Architecture and file map

| Layer | Path | Role |
|--------|------|------|
| Paystack client | `services/payments/paystackClient.js` | Initialize transaction, verify transaction, HMAC-SHA512 webhook signature (secret key) |
| Stripe client | `services/payments/stripeClient.js` | Checkout Session create/retrieve, Stripe-Signature HMAC (`STRIPE_WEBHOOK_SECRET`) |
| Checkout orchestration | `services/revenue/consumerCheckoutPaymentService.js` | Provider resolution, session persistence, verify, webhook handlers |
| Subscription write | `services/revenue/consumerSubscriptionService.js` | `applyConsumerCheckout()` — writes `networkConsumerSubscriptions` |
| Entitlements | `services/revenue/entitlementEngine.js` | Limits/features from catalogue SKU (not payment-aware) |
| Catalogue / pricing | `services/revenue/catalogueService.js` | Server-side `amountCents`, `currency: "ZAR"` for Sarah tiers |
| Commercial flags | `services/revenue/revenueConfig.js` | `RS02_SARAH_CHECKOUT` env enables checkout |
| HTTP routes | `services/api/revenueRoutes.js` | Checkout, verify, webhooks, public config |
| Raw webhook body | `api/app.js` | `express.raw` for Meta, Paystack, Stripe revenue webhooks |
| Persistence | `services/network/networkCollectionStore.js` | Firestore when Admin SDK available; else in-memory (tests) |
| Schema | `services/database/schema.js` | `CONSUMER_CHECKOUT_SESSIONS`, `CONSUMER_SUBSCRIPTIONS` |
| Consumer auth | `services/auth/consumerAuth.js` | Firebase + `userProfiles`; attaches `req.consumerAuth.uid`, `email` |
| Sarah UI | `prototype/sarah-app-ux/js/app.js`, `prototype/sarah-app-ux/js/live-bridge.mjs` | Billing CTA, redirect to provider, `maybeCompleteCheckoutReturn()` → verify API |
| Tests | `test/rs02-paystack-checkout.test.mjs`, `test/rs02-stripe-checkout.test.mjs`, `test/rs02-consumer-checkout.test.mjs` | Mocked provider APIs; happy path + Paystack idempotent re-verify |

**Not in scope of live checkout:** `services/integrations/connectors/paystackAdapter.js` and `stripeAdapter.js` (integration-hub stubs only).

---

## 3. Provider selection (Audit 1)

### Implemented behaviour (`resolveCheckoutProvider` in `consumerCheckoutPaymentService.js`)

1. If `opts.provider` or `RS02_CONSUMER_CHECKOUT_PROVIDER` is `stripe` **and** `STRIPE_SECRET_KEY` is set → Stripe.
2. Else if explicit `paystack` **and** Paystack configured → Paystack.
3. Else if Paystack configured → Paystack (default).
4. Else if Stripe configured → Stripe.
5. Else → `503 PAYMENT_PROVIDER_NOT_CONFIGURED`.

Init failures (e.g. `PAYSTACK_INIT_FAILED`, `STRIPE_INIT_FAILED`) **throw**; there is **no mid-checkout switch** to the other provider after a session has begun.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| PS-1 | **Critical** | **Silent provider fallback:** If the client sends `provider: "stripe"` but Stripe is **not** configured and Paystack **is**, resolution skips (1)–(2) and **defaults to Paystack** (step 3). Same for `provider: "paystack"` when only Stripe is configured → Stripe. Invalid values (e.g. `provider: "bogus"`) also fall through to default. **Violates requirement:** invalid/unavailable explicit provider must error, not switch. |
| PS-2 | Medium | When **both** keys are configured, default is always Paystack unless override env/body selects Stripe. Documented in public config as `checkoutProviderDefault` — good — but UI does not surface provider choice. |
| PS-3 | Low | `provider` is persisted on checkout session (`provider: "paystack"|"stripe"`). Verify path branches on `row?.provider === "stripe"` else Paystack — **cross-provider verify on a stored session is blocked** for Stripe sessions; Paystack verify does not require a local row before calling Paystack (see Audit 3). |
| PS-4 | Info | Free SKUs (`amountCents <= 0`) call `applyConsumerCheckout` immediately with `provider: "none"` — intentional; no payment. |

---

## 4. Stripe security (Audit 2)

### Raw body and signatures

- `api/app.js` registers `/api/revenue/webhooks/stripe` for raw capture; `revenueRoutes` uses `req.rawBody` for verification.
- `verifyStripeWebhookSignature` uses `STRIPE_WEBHOOK_SECRET`, `stripe-signature` header, payload `t + "." + rawBody` — **aligned with Stripe’s documented method**.

### Gaps

| ID | Severity | Finding |
|----|----------|---------|
| ST-1 | High | **No webhook timestamp tolerance** (Stripe recommends rejecting events outside a time window to limit replay). Only HMAC equality is checked. |
| ST-2 | **Critical** | **No amount/currency reconciliation:** `verifyStripeReference` checks `payment_status === "paid"` and `client_reference_id` match; it does **not** compare `amount_total`, `currency`, or Stripe metadata `uid`/`skuId` to the persisted checkout session or catalogue SKU. |
| ST-3 | High | **`checkout.session.completed` webhook** calls `verifyStripeReference`, which re-fetches the session — good — but same missing amount/metadata checks apply. |
| ST-4 | Medium | Duplicate webhooks: session `status === "completed"` short-circuits with `duplicate: true` — good for entitlements; **no durable “event id” store** (e.g. Stripe `event.id`). |
| ST-5 | High | **Refunds/chargebacks:** No listeners for `charge.refunded`, `checkout.session.async_payment_failed`, disputes; paid entitlements would remain after refund. |
| ST-6 | Low | Success URL alone does **not** grant access; client must call verify, which hits Stripe API — **meets intent**. |
| ST-7 | Medium | Production probe: `POST /api/revenue/webhooks/stripe` with `{}` returns **401** `WEBHOOK_SIGNATURE_INVALID` — fail-closed when signature invalid (read-only probe). |

---

## 5. Paystack security (Audit 3)

### Raw body and signatures

- Paystack route uses same raw-body middleware.
- `verifyPaystackWebhookSignature` uses **HMAC-SHA512 of raw body with `PAYSTACK_SECRET_KEY`** and compares to `x-paystack-signature` — matches Paystack’s **standard** server secret signing (not a separate webhook secret env in this codebase).

### Gaps

| ID | Severity | Finding |
|----|----------|---------|
| PY-1 | **Critical** | Same as ST-2: **`verifyPaystackReference` does not validate amount, currency, or metadata uid/skuId** against session row and catalogue after `/transaction/verify`. |
| PY-2 | High | **Verify without local session:** `verifyConsumerCheckout` routes non-Stripe rows to Paystack verify even when **no checkout session exists** in `CONSUMER_CHECKOUT_SESSIONS`. Provider call may succeed only for references Paystack knows; `completeSession` then returns **404 CHECKOUT_NOT_FOUND** — no entitlement — but unnecessary provider call and ambiguous logging. |
| PY-3 | Medium | **Pending/failed/abandoned:** Non-`success` status → `402 PAYMENT_NOT_SUCCESS` — good. No handling for reversal/refund events on webhook (only `charge.success`). |
| PY-4 | Low | Duplicate `charge.success`: idempotency via session status — good; no Paystack `event` id deduplication table. |
| PY-5 | Info | Production probe: invalid signature → **401** `WEBHOOK_SIGNATURE_INVALID`. |

---

## 6. Entitlement activation (Audit 4)

### Lifecycle (code trace)

1. `POST /api/revenue/subscription/checkout` (auth) → `initConsumerCheckout` → provider redirect URL + session row (`pending`).
2. Payment at provider.
3. **Return path:** `maybeCompleteCheckoutReturn()` → `GET /api/revenue/subscription/checkout/verify` (auth) → provider verify → `completeSession` → `applyConsumerCheckout(session.uid, session.skuId)`.
4. **Webhook path:** unsigned provider POST → signature check → same verify helpers → `completeSession` (no uid check when `uid` is null).

### Correct behaviours

- Paid activation **requires** provider verification (not query-string alone).
- Authenticated verify enforces **session.uid === req.consumerAuth.uid** (`CHECKOUT_FORBIDDEN`).
- Plan applied is **`skuId` from checkout session**, not client-supplied at verify time.
- Billing period: `periodStart` / `periodEnd` = **UTC calendar month from activation** (`consumerSubscriptionService.js`) — logical period, **not** tied to recurring billing.

### Gaps

| ID | Severity | Finding |
|----|----------|---------|
| EN-1 | **Critical** | Missing **amount/currency/SKU/consumer** cross-checks at verify (see ST-2, PY-1). Theoretically mitigated because references are server-generated and amounts set at init, but **defence-in-depth and provider reconciliation are absent** (Paystack/Stripe both recommend verifying amount before fulfilment). |
| EN-2 | High | **Concurrent double verify:** Two parallel requests may both observe `status: "pending"` before either writes `completed` — **race** on entitlement apply (no transaction/lock on session completion). |
| EN-3 | Medium | `rs02Limits` enforcement mode is **`shadow`** in default/revenue config — paid limits may not be **hard-enforced** everywhere despite subscription row updating. |
| EN-4 | Low | UI copy references “monthly” pool; **no renewal or expiry enforcement** linked to payment — accurate to code, but must not be marketed as recurring subscription. |
| EN-5 | Info | Webhook completion does not re-check consumer identity (by design for async fulfilment); relies on session having been created for correct `uid`. |

---

## 7. Persistence and reconciliation (Audit 5)

| Store | Collection | Contents | Durability |
|--------|------------|----------|------------|
| Checkout sessions | `networkConsumerCheckoutSessions` | reference, provider, uid, skuId, amountCents, status, stripeSessionId | Firestore when Admin backend available |
| Subscriptions | `networkConsumerSubscriptions` | Current plan per uid; `paymentReference`, `paymentProvider` on last paid activation | Same |

**Gaps:**

| ID | Severity | Finding |
|----|----------|---------|
| PR-1 | High | **No immutable payment ledger** or processed-webhook event table — reconciliation and audits rely on mutable session + subscription docs. |
| PR-2 | High | **Session loss:** If checkout session is missing but Paystack/Stripe shows paid success, verify returns **404** — customer may be charged without entitlement until manual ops. |
| PR-3 | Medium | `paymentReference` overwrites on each activation; **no payment history** in RS02 stores. |
| PR-4 | Low | Reference format `rs02_` + 24 hex chars — low collision risk; not UUID. |

---

## 8. Test results (Audit 6)

**Executed locally (memory backend, mocked `fetch`; no live financial APIs):**

| Test | Result |
|------|--------|
| `test/rs02-paystack-checkout.test.mjs` | Pass — init, verify, `duplicate: true` on second verify |
| `test/rs02-stripe-checkout.test.mjs` | Pass — init with `RS02_CONSUMER_CHECKOUT_PROVIDER=stripe`, verify |
| `test/rs02-consumer-checkout.test.mjs` | Pass — direct `applyConsumerCheckout` (entitlement path only; **not** payment security) |

**Not covered by automated tests:**

- Invalid webhook signatures (Stripe/Paystack)
- Duplicate webhook delivery with race
- Mismatched amount/currency/consumer/SKU
- Wrong `provider` rejection vs silent fallback
- Cancelled/failed/pending payments
- Cross-user reference attack (auth verify)
- Provider unavailable after explicit selection
- Refund/dispute
- Raw-body corruption / wrong content-type

**Conclusion:** Passing unit tests **do not** prove production payment security.

---

## 9. Production verification (Audit 7, read-only)

**API base used by Sarah live bridge:** `https://ziricai-production.up.railway.app` (`users/js/live-bridge.mjs`).

| Check | Result |
|--------|--------|
| `GET /api/revenue/config/public` | **200** — safe public fields only (no secrets) |
| `checkoutEnabled` | `true` (via `RS02_SARAH_CHECKOUT` env per `revenueConfig.js`) |
| `paystackEnabled` | `false` |
| `stripeEnabled` | `false` |
| `checkoutProviderDefault` | `null` |
| `commercialActivation.rs02SarahCheckout` in JSON body | `false` (static default blob); **checkout flag overridden by env** |
| Webhook routes mounted | **Yes** — Paystack/Stripe return 401 on invalid signature |
| Real payments | **Not attempted** |

**Operational note:** Production is **not configured to accept paid checkout** today (no provider keys visible via public config). Users hitting paid upgrade likely receive **503 `PAYMENT_PROVIDER_NOT_CONFIGURED`** while `checkoutEnabled` remains true — UX/risk mismatch.

**South Africa / Stripe:** Checkout code uses **`currency: "ZAR"`** in catalogue and Stripe `price_data`. Stripe’s extended network / payout eligibility for the **legal entity** holding the account was **not** verified in this audit (requires Finance/legal confirmation, not API key presence alone). **Paystack remains the natural primary for ZAR** once keys are set.

---

## 10. Risk register (consolidated)

### Critical

1. **PS-1** — Explicit provider request can silently fall back to the other configured provider.  
2. **ST-2 / PY-1 / EN-1** — No post-payment reconciliation of amount, currency, SKU, or consumer UID with provider payload.  
3. Production **checkout enabled without any payment provider** — paid path broken; risk of confusion or future misconfiguration when keys are added without follow-up verification.

### High

- ST-1 replay window (Stripe webhook timestamps)  
- ST-5 / PY-3 refunds and disputes  
- EN-2 completion race  
- PR-1 / PR-2 ledger and session-loss recovery  

### Medium

- PS-2 default provider visibility  
- ST-4 / PY-4 event-id idempotency  
- EN-3 shadow enforcement  
- PR-3 no payment history  

### Low

- PS-3, ST-6, ST-7, PY-5, EN-4, EN-5, PR-4  

---

## 11. Required fixes (recommendations only — not implemented in this audit)

1. **Provider selection:** If `body.provider` is set and not in `{paystack, stripe}` OR chosen provider is not configured → **422** with clear code; **never** fall back when explicit.  
2. **Verification hardening:** After provider success, assert: `amount` == session.`amountCents` == catalogue SKU; `currency` match; Paystack/Stripe metadata `uid` and `skuId` match session; reject otherwise.  
3. **Idempotency:** Transactional session update (`pending` → `completed`) or Firestore transaction; store processed **provider event IDs**.  
4. **Webhooks:** Add Stripe timestamp tolerance; optional Paystack event dedupe; tests for invalid signatures and duplicate delivery.  
5. **Refunds/disputes:** Define policy (revoke/downgrade entitlement or grace period) and implement provider events.  
6. **Persistence:** Append-only **payment records** separate from mutable subscription.  
7. **Production gate:** Set provider keys **or** disable `RS02_SARAH_CHECKOUT` until ready; UI should read `paystackEnabled`/`stripeEnabled` before showing live paid upgrade.  
8. **Enforcement:** Move `rs02Limits` out of `shadow` when ready to enforce paid limits.  

---

## 12. Recommended next steps

1. Implement fixes **1–3 and 7** in a dedicated hardening pass (no recurring billing yet).  
2. Add integration tests from section 8 “not covered”.  
3. Configure **Paystack test mode** on staging; run manual matrix (cancel, fail, success without browser, duplicate webhook).  
4. Repeat this audit checklist after hardening → target **PASS WITH LIMITATIONS** for controlled production, then **PASS** after live test charges reconciled.  
5. Only then design **RS02 recurring subscriptions** (Stripe Billing / Paystack subscriptions) as a separate workstream.  

---

## Verdict

**BLOCKED — critical issues must be fixed before further real payments.**

---

## Hardening pass (2026-11-10, post-audit)

Implemented (not re-audited to full PASS):

- Strict `resolveCheckoutProvider` — invalid or unconfigured explicit provider returns error (no silent fallback).
- Paystack/Stripe verify reconciles amount, currency, metadata `uid`/`skuId` against checkout session.
- Checkout session required before verify; unknown provider rejected.
- Per-reference completion lock; webhook event id deduplication collection.
- Stripe webhook timestamp tolerance (`STRIPE_WEBHOOK_TOLERANCE_SEC`, default 300s).
- Public `paidCheckoutAvailable`; Sarah billing UI blocks paid upgrade when no provider keys.
- Tests: `rs02-checkout-hardening.test.mjs`, `rs02-checkout-webhook-security.test.mjs`.

**Remaining before PASS:** staging live-test matrix, provider keys on production, dispute edge cases.

**Follow-up (2026-11-10):** Payment ledger (`consumerPaymentLedger.js`), refund webhooks (Paystack refund/reversal, Stripe `charge.refunded`), Firestore transactional session completion when Admin SDK is active, `scripts/rs02-checkout-verify.mjs`, `docs/operations/RS02_STAGING_CHECKOUT.md`.
