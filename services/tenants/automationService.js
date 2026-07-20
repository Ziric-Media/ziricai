/**
 * Automation service — tenant workflow workspace metadata.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { listWorkflows } from "../automation/workflowRegistry.js";

class AutomationService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.AUTOMATIONS);
    }
}

const automationService = new AutomationService();

export async function listAutomations(companyId) {
    const workflows = await listWorkflows(companyId);
    if (workflows?.length) {
        return workflows;
    }
    return automationService.list(companyId);
}

export async function registerAutomation(companyId, data) {
    return automationService.create(companyId, data);
}

export async function updateAutomation(companyId, automationId, patch) {
    return automationService.update(companyId, automationId, patch);
}

export async function getAutomation(companyId, automationId) {
    return automationService.get(companyId, automationId);
}
