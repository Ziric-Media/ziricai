/**
 * BOS autonomous bridge — commercial cycle stage changes → workforce instructions.
 * Chat memory is not the system of record; instructions + cycle records are.
 */
import { CYCLE_STAGES } from "./commercialCycleModel.js";
import { isBosPilotTenant } from "./bosPilot.js";
import {
    bosOrchestratorActor,
    createWorkforceInstruction,
} from "./workforceInstructionService.js";
import { INSTRUCTION_SOURCE } from "./workforceInstructionModel.js";

function bridgeEnabled(companyId) {
    if (process.env.BOS_CYCLE_WORKFORCE_BRIDGE === "false") return false;
    return isBosPilotTenant(companyId);
}

/**
 * @param {object} cycle
 * @param {string} triggerAction — last action applied or "created"
 * @returns {Array<{ targetModule: string, automationKind: string, instruction: string, priority?: string }>}
 */
function delegationPlan(cycle, triggerAction) {
    const id = cycle.id;
    const customer = cycle.customerName || "the customer";
    const title = cycle.title || "Commercial request";
    const invoice = cycle.quotationInvoiceId || "(quotation invoice)";

    switch (triggerAction) {
        case "created":
            return [
                {
                    targetModule: "admin",
                    automationKind: "sales_quotation_intake",
                    priority: "high",
                    instruction: `Sales opened a commercial cycle for ${customer} (“${title}”). Delegate quotation preparation to Sarah Finance (use applyBosCommercialCycleAction request-quotation on cycle ${id}, then ensure Finance receives the work).`,
                },
            ];
        case "request-quotation":
            return [
                {
                    targetModule: "finance",
                    automationKind: "prepare_quotation",
                    priority: "high",
                    instruction: `Prepare the quotation for ${customer} on BOS cycle ${id}. Use applyBosCommercialCycleAction prepare-quotation with line items from Sales context, then mark this instruction complete.`,
                },
            ];
        case "prepare-quotation":
            return [
                {
                    targetModule: "admin",
                    automationKind: "quotation_ready_handoff",
                    instruction: `Finance prepared quotation ${invoice} for ${customer} (cycle ${id}). Delegate Sarah Sales to send the quote to the client and confirm acceptance / deposit policy.`,
                },
            ];
        case "send-quotation":
            return [
                {
                    targetModule: "sales",
                    automationKind: "await_customer_decision",
                    instruction: `Quotation sent for ${customer} (cycle ${id}). Follow up in the customer channel; when they accept, run accept-quotation on the cycle and explain deposit vs full payment per company policy.`,
                },
            ];
        case "accept-quotation":
            return [
                {
                    targetModule: "sales",
                    automationKind: "collect_payment",
                    priority: "high",
                    instruction: `Customer accepted the quote for ${customer} (cycle ${id}). Request payment (deposit or full per policy), then submit payment proof on the cycle when the client sends it.`,
                },
            ];
        case "submit-payment-proof":
            return [
                {
                    targetModule: "admin",
                    automationKind: "payment_proof_intake",
                    priority: "high",
                    instruction: `Sales submitted payment proof for ${customer} (cycle ${id}). Route to Sarah Finance to verify funds against invoice ${invoice} — do not authorise operations until Finance confirms.`,
                },
            ];
        case "verify-payment":
            return [
                {
                    targetModule: "admin",
                    automationKind: "authorise_after_pay",
                    priority: "high",
                    instruction: `Finance verified payment for ${customer} (cycle ${id}). Authorise work (applyBosCommercialCycleAction authorise-work). Payment must stay verified before mobilisation.`,
                },
            ];
        case "authorise-work":
            return [
                {
                    targetModule: "operations",
                    automationKind: "create_project",
                    priority: "high",
                    instruction: `Work authorised for ${customer} (cycle ${id}, project ${cycle.projectId || "TBD"}). Create the delivery project/tasks from requirements on the cycle and mobilise when ready (applyBosCommercialCycleAction mobilise).`,
                },
                {
                    targetModule: "hr",
                    automationKind: "staffing_plan",
                    instruction: `Work authorised for ${customer} (cycle ${id}). Review manpower for project ${cycle.projectId || "TBD"} and recommend human vs AI assignments; coordinate with Operations Sarah.`,
                },
            ];
        case "mobilise":
            return [];
        default:
            if (cycle.stage === CYCLE_STAGES.PAYMENT_VERIFIED) {
                return delegationPlan(cycle, "verify-payment");
            }
            return [];
    }
}

/**
 * @param {string} companyId
 * @param {object} cycle — updated cycle document
 * @param {string} triggerAction
 */
export async function syncWorkforceInstructionsForCycle(companyId, cycle, triggerAction) {
    if (!bridgeEnabled(companyId) || !cycle?.id) return [];

    const plan = delegationPlan(cycle, triggerAction);
    const actor = bosOrchestratorActor();
    const created = [];

    for (const step of plan) {
        const automationKey = `cycle:${cycle.id}:${step.automationKind}`;
        const row = await createWorkforceInstruction(companyId, actor, {
            targetModule: step.targetModule,
            instruction: step.instruction,
            priority: step.priority || "normal",
            source: INSTRUCTION_SOURCE.BOS_ORCHESTRATOR,
            issuerModule: "bos_orchestrator",
            linkedRecordType: "commercialCycle",
            linkedRecordId: cycle.id,
            automationKey,
        });
        created.push(row);
    }

    return created;
}
