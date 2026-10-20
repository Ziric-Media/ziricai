/**
 * Queue Sarah autopilot when workforce instructions are issued (BOS pilot).
 */
import { subscribe } from "./eventBus.js";
import { EventTypes } from "./eventTypes.js";
import { enqueueWorkforceSarahAutopilot } from "../bos/workforceSarahAutopilot.js";

async function onWorkforceInstructionIssued(event) {
    const { companyId, payload = {} } = event;
    const targetModule = payload.targetModule;
    if (!companyId || !targetModule) return;

    await enqueueWorkforceSarahAutopilot({
        companyId,
        targetModule,
        instructionId: payload.instructionId,
        instructionText: payload.instruction,
    });
}

export function registerBosAutopilotHandler() {
    subscribe(EventTypes.WORKFORCE_INSTRUCTION_ISSUED, async (event) => {
        try {
            await onWorkforceInstructionIssued(event);
        } catch (err) {
            console.warn("[bos-autopilot]", event?.companyId, err.message);
        }
    });
}
