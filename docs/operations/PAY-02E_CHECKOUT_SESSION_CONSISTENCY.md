# PAY-02E — Checkout session lifecycle consistency

**Type:** Engineering issue (post PAY-02D-I RS02)  
**Priority:** Medium (data consistency / ops clarity; does not invalidate verified payments)  
**Status:** **IMPLEMENTED (local)** — automated tests added; commit/deploy pending separate approval

**Parent evidence:** [PAY-02D-I-RS02_FORMAL_CLOSEOUT.md](./PAY-02D-I-RS02_FORMAL_CLOSEOUT.md)

---

## Problem statement

After a successful RS02 Paystack TEST payment (`rs02_4b40d415cce2c9f2d6f365f6`), three durable artefacts disagreed on completion state:

| Artefact | Observed state |
|----------|----------------|
| Payment ledger (`CONSUMER_PAYMENT_LEDGER`) | **`captured`** |
| Consumer subscription | **`active`**, SKU `rs02.sarah.plus.zar.monthly` |
| Checkout session (`CONSUMER_CHECKOUT_SESSIONS`) | **`pending`** |

Payment and entitlement were correct; the session document did not reflect completion.

---

## Hypothesis (code review)

In `services/revenue/consumerCheckoutPaymentService.js`, `completeSession()`:

1. Records ledger and applies subscription via `applyConsumerCheckout`.
2. Marks session **`completed`** via `markSessionCompletedFirestore()` when `useAdminBackend()` is true.

On **duplicate / idempotent** paths (`existingPay?.status === "captured"` or `row.status === "completed"`), the handler may return early with `duplicate: true` **without** normalising session `status` from `pending` → `completed` if the ledger was written in a prior path but session update failed or was skipped (e.g. race between webhook `charge.success` and browser return verify).

**Requirement:** Idempotent completion must **not** double-grant subscription or ledger entries, but **should** repair session status when ledger is already `captured`.

---

## Acceptance criteria

1. After successful payment (webhook and/or authenticated verify), session `status` is **`completed`** with `completedAt` and payment reference aligned to ledger.
2. Duplicate webhook or duplicate `verifyConsumerCheckout` does **not** create a second ledger row or second entitlement grant (existing behaviour preserved).
3. Duplicate completion **may** update session from `pending` → `completed` when ledger already `captured` (repair path).
4. RS02 and RS06 credit-pack sessions both covered if they share `completeSession`.
5. Automated test: simulate “ledger captured, session pending” and assert repair on duplicate verify/webhook without second `recordConsumerPayment` grant.

---

## Constraints

- **Do not** mutate or replay the verified production TEST transaction `rs02_4b40d415cce2c9f2d6f365f6` for fix validation; use unit/integration tests and future TEST charges only.
- **Do not** change Paystack webhook signing, amount reconciliation, or allowlist behaviour in the same change unless required by session repair.
- Deploy via existing PAY-02D controlled worktree / CLI upload playbook.

---

## Implementation (2026-11-17, local only)

`services/revenue/consumerCheckoutPaymentService.js`:

1. `ensureSessionCompleted(reference, paymentProvider)` — session-only repair; validates ledger `captured` against session via `assertLedgerMatchesSession` (stored `paymentReference`, uid, sku, integer `amountCents`, currency required on both sides and must match the catalogue SKU currency e.g. ZAR; no coercion of missing fields); uses `markSessionCompletedFirestore` or memory `sessions.put`; no subscription/ledger writes.
2. Invoked from `completeSession` when ledger captured and session not completed (duplicate paths and ledger-create race).
3. Paystack/Stripe duplicate webhook deliveries call `ensureSessionCompleted` without re-running provider verify.

**Tests:** `test/pay-02e-checkout-session-consistency.test.mjs` (RS02/RS06 repair, webhook-first, browser-first, concurrent verify, amount mismatch, no duplicate RS06 credits).

**Not changed:** production R99 reference, Paystack keys, checkout kill-switches, Railway.

**RS02 checkout allowlist (fail-closed):** `RS02_CHECKOUT_ALLOW_UIDS` must be a **non-empty** list before RS02 plan checkout can succeed for any uid. Missing, empty, or whitespace-only values deny all RS02 plan checkouts (`CHECKOUT_NOT_ALLOWED`). RS06 credit-pack checkout is not gated by this variable. `RS02_SARAH_CHECKOUT` / `RS06_CREDITS_CHECKOUT` kill-switches remain the primary commercial gates.

---

## Out of scope for PAY-02E

- PAY-03 recurring billing / Paystack subscriptions.
- Railway webhook HTTP logging (separate observability improvement).
- RS06 TEST execution (see PAY-02D-I RS06 tranche).

---

## Definition of done

- Code merged (when authorized) + test proving repair path.
- Optional: one-off Firestore **repair** script for historical `pending` sessions with `captured` ledger (operator-only, documented; not required for RS02 closeout).