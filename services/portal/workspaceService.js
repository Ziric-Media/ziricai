/**
 * Workspace snapshot — unified tenant context for portal login and hub.
 */
import {
    getCompany,
    getCompanyBranding,
    getCompanyGeneralSettings,
    getProvisioningLinks,
} from "../tenants/companyService.js";
import { listDepartments } from "../tenants/departmentService.js";
import { listTeamMembers } from "../tenants/userService.js";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { listWorkflows } from "../automation/workflowRegistry.js";

class CountRepo extends ServiceBase {
    constructor(collection) {
        super(collection);
    }

    async count(companyId, max = 500) {
        const items = await this.list(companyId, { max });
        return items.length;
    }
}

const aiRepo = new CountRepo(TENANT_COLLECTIONS.AI_EMPLOYEES);
const knowledgeRepo = new CountRepo(TENANT_COLLECTIONS.KNOWLEDGE_BASES);

async function countKnowledgeDocs(companyId) {
    const store = await getStorageAdapter();
    if (store.listKnowledgeDocs) {
        const docs = await store.listKnowledgeDocs({ companyId });
        return docs.length;
    }
    return knowledgeRepo.count(companyId);
}

async function countCustomers(companyId) {
    const store = await getStorageAdapter();
    if (store.listCustomers) {
        const customers = await store.listCustomers({ companyId, limit: 500 });
        return customers.length;
    }
    return 0;
}

/**
 * Resource counts per workspace area.
 * @param {string} companyId
 */
export async function getWorkspaceResourceCounts(companyId) {
    const [aiEmployees, knowledgeItems, customers, automations] = await Promise.all([
        aiRepo.count(companyId),
        countKnowledgeDocs(companyId),
        countCustomers(companyId),
        listWorkflows(companyId).then((w) => w.length).catch(() => 0),
    ]);

    const team = await listTeamMembers(companyId);
    const departments = await listDepartments(companyId);

    return {
        departments: departments.length,
        team: team.length,
        aiEmployees,
        knowledge: knowledgeItems,
        crm: customers,
        automations,
        analytics: 1,
        billing: 1,
    };
}

/**
 * Full workspace snapshot loaded on portal login.
 * @param {string} companyId
 */
export async function getWorkspaceSnapshot(companyId) {
    const [company, branding, general, departments, team, provisioning, resources] = await Promise.all([
        getCompany(companyId),
        getCompanyBranding(companyId),
        getCompanyGeneralSettings(companyId),
        listDepartments(companyId),
        listTeamMembers(companyId),
        getProvisioningLinks(companyId),
        getWorkspaceResourceCounts(companyId),
    ]);

    if (!company) return null;

    return {
        companyId,
        company: { ...company, branding },
        branding,
        settings: { general },
        departments,
        team,
        teamCount: team.length,
        resources,
        workspaceLinks: provisioning?.links || provisioning?.workspaceLinks || null,
        provisionedAt: provisioning?.provisionedAt || company.provisionedAt || null,
        generatedAt: new Date().toISOString(),
    };
}
