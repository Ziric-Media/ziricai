/**
 * Local sanity check — BOS commercial cycle transitions (no Firestore).
 */
import { assertTransition, CYCLE_STAGES } from "../services/bos/commercialCycleModel.js";

const flow = [
    ["accept-quotation", CYCLE_STAGES.QUOTATION_SENT],
    ["submit-payment-proof", CYCLE_STAGES.QUOTATION_ACCEPTED],
    ["verify-payment", CYCLE_STAGES.PAYMENT_PROOF_SUBMITTED],
    ["authorise-work", CYCLE_STAGES.PAYMENT_VERIFIED],
    ["mobilise", CYCLE_STAGES.WORK_AUTHORISED],
];

let stage = CYCLE_STAGES.QUOTATION_SENT;
for (const [action, expectedFrom] of flow) {
    if (stage !== expectedFrom) {
        console.error(`Expected stage ${expectedFrom} before ${action}, got ${stage}`);
        process.exit(1);
    }
    const rule = assertTransition(action, stage);
    stage = rule.to;
}
console.log("BOS slice-1 transition chain OK →", stage);
