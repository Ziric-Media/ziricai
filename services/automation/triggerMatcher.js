/**
 * Match events to tenant workflows.
 */
import { listWorkflows } from "./workflowRegistry.js";

function textFromEvent(event) {
    return String(
        event.payload?.text ||
            event.payload?.message ||
            event.payload?.question ||
            ""
    ).toLowerCase();
}

function matchesKeywords(text, keywords = []) {
    if (!keywords.length) return true;
    return keywords.some((k) => text.includes(String(k).toLowerCase()));
}

function matchesWorkflowTrigger(workflow, event) {
    const trigger = workflow.trigger || {};
    if (trigger.eventType && trigger.eventType !== event.type) return false;

    const text = textFromEvent(event);
    const match = trigger.match || {};

    if (match.keywords?.length && !matchesKeywords(text, match.keywords)) return false;

    if (match.inactiveHours != null) {
        const hours = Number(event.payload?.inactiveHours || event.metadata?.inactiveHours || 0);
        if (hours < match.inactiveHours) return false;
    }

    if (match.minLeadScore != null) {
        const score = Number(event.payload?.leadScore || 0);
        if (score < match.minLeadScore) return false;
    }

    if (workflow.status && workflow.status !== "active" && workflow.status !== "published") {
        return false;
    }

    return true;
}

/**
 * Find workflows that should run for an event.
 * @param {string} companyId
 * @param {import('../events/eventTypes.js').ZiricEvent} event
 */
export async function findMatchingWorkflows(companyId, event) {
    const workflows = await listWorkflows(companyId);
    return workflows.filter((wf) => matchesWorkflowTrigger(wf, event));
}

export { matchesWorkflowTrigger, matchesKeywords };
