import assert from "node:assert/strict";
import { isRs02CheckoutUidAllowed } from "../services/revenue/revenueConfig.js";

const uid = "YBFlI0zQ6afvAgP5TrjoWVJkE7l2";
const other = "some-other-uid";

delete process.env.RS02_CHECKOUT_ALLOW_UIDS;
assert.equal(isRs02CheckoutUidAllowed(uid), false, "missing allowlist denies RS02 checkout");
assert.equal(isRs02CheckoutUidAllowed(other), false);

process.env.RS02_CHECKOUT_ALLOW_UIDS = "";
assert.equal(isRs02CheckoutUidAllowed(uid), false, "empty allowlist denies RS02 checkout");

process.env.RS02_CHECKOUT_ALLOW_UIDS = "   ";
assert.equal(isRs02CheckoutUidAllowed(uid), false, "whitespace-only allowlist denies RS02 checkout");
assert.equal(isRs02CheckoutUidAllowed(other), false);

process.env.RS02_CHECKOUT_ALLOW_UIDS = uid;
assert.equal(isRs02CheckoutUidAllowed(uid), true);
assert.equal(isRs02CheckoutUidAllowed(other), false);

process.env.RS02_CHECKOUT_ALLOW_UIDS = `${uid}, extra-uid`;
assert.equal(isRs02CheckoutUidAllowed("extra-uid"), true);

console.log("rs02-checkout-allowlist: pass");