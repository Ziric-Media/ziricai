/**
 * SNET-09 — platform (Mission Control) read/ops model for Sarah Network.
 *
 * Read paths aggregate across stores (entities, directory, verification cases, agents, relationships) — they are
 * capped scans (pilot scale); a materialised stats doc is a follow-up. The only write here is the audited
 * suspend / reinstate decision.
 */
import { getSearchStats } from "./networkSearchStats.js";
import { listNetworkAdminAudit, recordNetworkAdminAction } from "./networkAdminAudit.js";
import {
    getEntityBySnId,
    listOrgEntities,
    NETWORK_ENTITY_STATUSES,
    setOrgEntityStatus,
} from "./networkIdentityService.js";
import { isValidSnId } from "./snId.js";
import { listVerificationCases, listCasesForCompany } from "./verificationService.js";
import { getAgentByCompanyId, listAllAgentsForPlatform } from "./agentRegistryService.js";
import { countConnectionsByState } from "./connectionService.js";
import {
    getBusinessDirectoryEntry,
    hydrateBusinessDirectory,
    invalidateDirectoryEntity,
} from "../users/businessDirectoryService.js";

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function row(entity) {
    const companyId = entity.refs?.companyId || null;
    const entry = companyId ? getBusinessDirectoryEntry(companyId) : null;
    return {
        snId: entity.snId,
        kind: entity.kind,
        companyId,
        displayName: entity.displayName || entry?.displayName || companyId,
        status: entity.status,
        statusReason: entity.status === NETWORK_ENTITY_STATUSES.SUSPENDED ? entity.statusReason || null : null,
        listed: entry?.discoverability === "public" && entity.status !== NETWORK_ENTITY_STATUSES.SUSPENDED,
        discoverability: entry?.discoverability || "none",
        verification: entity.verification?.state || "unverified",
        updatedAt: entity.updatedAt || null,
    };
}

/** Overview numbers for the Sarah Network landing section. */
export async function getNetworkStats() {
    await hydrateBusinessDirectory();
    const entities = await listOrgEntities({ limit: 2000 });
    const rows = entities.map(row);
    const byStatus = {};
    const byVerification = {};
    for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byVerification[r.verification] = (byVerification[r.verification] || 0) + 1;
    }
    const cases = await listVerificationCases({ limit: 500 });
    const openCases = cases.filter((c) => c.status === "submitted" || c.status === "under_review" || c.status === "info_requested").length;
    const agents = await listAllAgentsForPlatform({ limit: 2000 });
    const connections = await countConnectionsByState();
    const search = getSearchStats();
    return {
        generatedAt: new Date().toISOString(),
        entities: { total: rows.length, listed: rows.filter((r) => r.listed).length, byStatus },
        verification: { byState: byVerification, openCases },
        agents: { total: agents.length, active: agents.filter((a) => a.status === "active").length },
        connections,
        search: {
            scope: search.scope,
            since: search.startedAt,
            total: search.total,
            zeroResults: search.zeroResults,
            topZeroResultQueries: search.topZeroResultQueries,
        },
    };
}

/**
 * @param {{ status?: string, q?: string, limit?: number }} [opts]
 */
export async function listEntitiesForPlatform({ status = "", q = "", limit = 100 } = {}) {
    await hydrateBusinessDirectory();
    const needle = String(q || "").trim().toLowerCase();
    const rows = (await listOrgEntities({ limit: 2000 }))
        .map(row)
        .filter((r) => !status || r.status === status)
        .filter((r) => !needle || `${r.displayName} ${r.snId} ${r.companyId}`.toLowerCase().includes(needle))
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
    const max = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return { entities: rows.slice(0, max), total: rows.length };
}

/** @param {string} snId */
export async function getEntityForPlatform(snId) {
    if (!isValidSnId(snId)) throw err(400, "SN_ID_INVALID", "A valid snId is required.");
    const entity = await getEntityBySnId(snId);
    if (!entity) throw err(404, "ENTITY_NOT_FOUND", "Network entity not found.");
    await hydrateBusinessDirectory();
    const companyId = entity.refs?.companyId;
    const [cases, agent, audit] = await Promise.all([
        companyId ? listCasesForCompany(companyId) : [],
        companyId ? getAgentByCompanyId(companyId) : null,
        listNetworkAdminAudit({ snId, limit: 50 }),
    ]);
    return {
        entity: row(entity),
        verificationCases: cases.map((c) => ({ caseId: c.caseId, status: c.status, submittedAt: c.submittedAt, decidedAt: c.decidedAt || null })),
        agent: agent ? { agentSnId: agent.agentSnId, status: agent.status, capabilities: agent.capabilities } : null,
        audit,
    };
}

/**
 * Suspend (removes from Discover/search/agent directory, blocks new enquiries/relationships) or reinstate.
 * Every decision is audited durably BEFORE it is reported successful.
 * @param {string} snId
 * @param {"suspend"|"reinstate"} action
 * @param {{ reason?: string, actor: string }} meta
 */
export async function changeEntityStatus(snId, action, { reason, actor }) {
    if (!["suspend", "reinstate"].includes(action)) throw err(422, "ENTITY_ACTION_INVALID", "action must be suspend or reinstate.");
    const note = String(reason || "").trim();
    if (note.length < 5) throw err(422, "REASON_REQUIRED", "A reason (min 5 characters) is required.");
    if (!isValidSnId(snId)) throw err(400, "SN_ID_INVALID", "A valid snId is required.");
    const entity = await getEntityBySnId(snId);
    const companyId = entity?.refs?.companyId;
    if (!entity || !companyId) throw err(404, "ENTITY_NOT_FOUND", "Network entity not found.");

    const suspended = entity.status === NETWORK_ENTITY_STATUSES.SUSPENDED;
    if (action === "suspend" && suspended) throw err(409, "ENTITY_STATE_INVALID", "Entity is already suspended.");
    if (action === "reinstate" && !suspended) throw err(409, "ENTITY_STATE_INVALID", "Entity is not suspended.");

    await hydrateBusinessDirectory();
    const entry = getBusinessDirectoryEntry(companyId);
    const next =
        action === "suspend"
            ? NETWORK_ENTITY_STATUSES.SUSPENDED
            : entry?.discoverability === "public"
              ? NETWORK_ENTITY_STATUSES.LISTED
              : NETWORK_ENTITY_STATUSES.DRAFT;

    await recordNetworkAdminAction({
        actor,
        action: action === "suspend" ? "entity_suspended" : "entity_reinstated",
        snId,
        companyId,
        detail: { reason: note, from: entity.status, to: next },
    });
    const updated = await setOrgEntityStatus(companyId, next, { reason: note, actor });
    invalidateDirectoryEntity(companyId);
    return row(updated);
}
