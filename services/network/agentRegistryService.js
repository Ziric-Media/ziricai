/**
 * SNET-06 — Network agent registry.
 *
 * Every listed organisation has exactly one "Company Sarah" agent identity (`sn_ai_…`), owned by the org entity.
 * The registry holds only what other network participants may see: identity, role, status, declared capabilities,
 * languages, owner link. It NEVER holds or returns prompts, knowledge-base content, tool config or secrets —
 * those stay in the tenant runtime.
 *
 * Idempotent provisioning: `networkRefs/ai__company_sarah__{companyId}` is created-if-absent (same pattern as
 * org entities), so concurrent provisioning converges on one agent.
 * Capabilities are *declared* by the owner from a fixed vocabulary; the network does not verify them.
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { ensureOrgEntity, getOrgEntityByCompanyId, refDocId } from "./networkIdentityService.js";
import { mintSnId, SN_ID_KINDS, isValidSnId } from "./snId.js";
import { listDiscoverCards } from "../users/businessDirectoryService.js";

export const AGENT_ROLES = Object.freeze({ COMPANY_SARAH: "company_sarah" });
export const AGENT_STATUSES = Object.freeze({ ACTIVE: "active", PAUSED: "paused", RETIRED: "retired" });

/** Public capability vocabulary (SNET-01 §8). Declared, not verified. */
export const AGENT_CAPABILITIES = Object.freeze([
    "answer_enquiries",
    "book_appointments",
    "share_pricing",
    "take_orders",
    "customer_support",
    "human_handover",
]);
const DEFAULT_CAPABILITIES = Object.freeze(["answer_enquiries", "human_handover"]);
/** Operator-declared capabilities for pilot listings (SmileMore runs dental booking via Company Sarah). */
const PILOT_CAPABILITIES = Object.freeze({
    "smilemore-demo": ["answer_enquiries", "book_appointments", "human_handover"],
});

const agents = createNetworkCollection(NETWORK_COLLECTIONS.AGENTS);
const refs = createNetworkCollection("networkRefs");
const REF_KIND = "ai";

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function nowIso() {
    return new Date().toISOString();
}

function strip(row) {
    if (!row) return null;
    const { __id, ...rest } = row;
    return rest;
}

export function validateCapabilities(input) {
    if (!Array.isArray(input)) throw err(422, "AGENT_INVALID", "capabilities must be a list.");
    const caps = [...new Set(input.map((c) => String(c).trim().toLowerCase()))];
    const unknown = caps.filter((c) => !AGENT_CAPABILITIES.includes(c));
    if (unknown.length) throw err(422, "AGENT_INVALID", `Unknown capabilities: ${unknown.join(", ")}`);
    if (!caps.length) throw err(422, "AGENT_INVALID", "At least one capability is required.");
    return caps;
}

/**
 * Idempotently provision (or return) the Company Sarah agent for an org.
 * @param {string} companyId
 * @param {{ capabilities?: string[] }} [opts]
 */
export async function ensureCompanyAgent(companyId, opts = {}) {
    const cid = String(companyId || "").trim();
    if (!cid) throw err(400, "COMPANY_ID_REQUIRED", "companyId is required.");
    const org = await ensureOrgEntity(cid);
    const key = refDocId(REF_KIND, `${AGENT_ROLES.COMPANY_SARAH}__${cid}`);

    let agentSnId = (await refs.get(key))?.agentSnId || null;
    if (!agentSnId) {
        const candidate = mintSnId(SN_ID_KINDS.AI_AGENT);
        const winner = await refs.createIfAbsent(key, { agentSnId: candidate, companyId: cid, createdAt: nowIso() });
        agentSnId = winner?.agentSnId || candidate;
    }

    const existing = await agents.get(agentSnId);
    if (existing) return strip(existing);

    const caps = opts.capabilities ? validateCapabilities(opts.capabilities) : PILOT_CAPABILITIES[cid] || DEFAULT_CAPABILITIES;
    const ts = nowIso();
    const record = {
        agentSnId,
        kind: SN_ID_KINDS.AI_AGENT,
        role: AGENT_ROLES.COMPANY_SARAH,
        ownerSnId: org.snId,
        companyId: cid,
        displayName: `${org.displayName || cid} Sarah`,
        status: AGENT_STATUSES.ACTIVE,
        capabilities: [...caps],
        languages: [],
        humanHandover: true,
        schemaVersion: 1,
        createdAt: ts,
        updatedAt: ts,
    };
    await agents.createIfAbsent(agentSnId, record);
    return strip(await agents.get(agentSnId));
}

export async function getAgentByCompanyId(companyId) {
    const key = refDocId(REF_KIND, `${AGENT_ROLES.COMPANY_SARAH}__${String(companyId || "").trim()}`);
    const ref = await refs.get(key);
    return ref?.agentSnId ? strip(await agents.get(ref.agentSnId)) : null;
}

/**
 * Owner-managed changes: declared capabilities and pause / resume. Retired agents cannot be changed by owners.
 * @param {string} companyId
 * @param {{ capabilities?: string[], status?: string }} patch
 */
export async function updateCompanyAgent(companyId, patch = {}) {
    const allowed = new Set(["capabilities", "status"]);
    const unknown = Object.keys(patch).filter((k) => !allowed.has(k));
    if (unknown.length) throw err(422, "AGENT_FIELD_NOT_ALLOWED", `Not editable: ${unknown.join(", ")}`);
    const agent = await ensureCompanyAgent(companyId);
    if (agent.status === AGENT_STATUSES.RETIRED) throw err(409, "AGENT_RETIRED", "This agent has been retired.");
    const next = {};
    if (patch.capabilities !== undefined) next.capabilities = validateCapabilities(patch.capabilities);
    if (patch.status !== undefined) {
        if (![AGENT_STATUSES.ACTIVE, AGENT_STATUSES.PAUSED].includes(patch.status)) {
            throw err(422, "AGENT_INVALID", "status must be active or paused.");
        }
        next.status = patch.status;
    }
    if (!Object.keys(next).length) return agent;
    await agents.put(agent.agentSnId, { ...next, updatedAt: nowIso() }, { merge: true });
    return strip(await agents.get(agent.agentSnId));
}

/** Platform-side retire/restore (SNET-09/10 call this when an entity is suspended). */
export async function setAgentStatusAsPlatform(companyId, status) {
    if (!Object.values(AGENT_STATUSES).includes(status)) throw err(422, "AGENT_INVALID", "Unknown agent status.");
    const agent = await getAgentByCompanyId(companyId);
    if (!agent) return null;
    await agents.put(agent.agentSnId, { status, updatedAt: nowIso() }, { merge: true });
    return strip(await agents.get(agent.agentSnId));
}

/** Tenant-facing full record (still no prompts/KB — the registry never stores them). */
export function toOwnerView(agent) {
    return agent ? { ...agent } : null;
}

function toPublicCard(agent, card) {
    return {
        agentSnId: agent.agentSnId,
        kind: "ai",
        role: agent.role,
        displayName: agent.displayName,
        status: agent.status,
        capabilities: agent.capabilities,
        languages: agent.languages?.length ? agent.languages : card?.languages || [],
        humanHandover: agent.humanHandover !== false,
        owner: {
            snId: agent.ownerSnId,
            displayName: card?.displayName || null,
            verified: Boolean(card?.verified),
        },
    };
}

async function listedCardsByOwner() {
    const cards = await listDiscoverCards();
    return new Map(cards.filter((c) => c.snId).map((c) => [c.snId, c]));
}

/**
 * Public agent card. Visible only when the agent is active AND its owner is currently listed (not suspended/hidden).
 * @param {string} agentSnId
 */
export async function getPublicAgent(agentSnId) {
    if (!isValidSnId(agentSnId)) return null;
    const agent = strip(await agents.get(agentSnId));
    if (!agent || agent.status !== AGENT_STATUSES.ACTIVE) return null;
    const owner = (await listedCardsByOwner()).get(agent.ownerSnId);
    return owner ? toPublicCard(agent, owner) : null;
}

/**
 * Public agent directory. Lazily provisions the agent for every listed org (idempotent) so listed orgs are always
 * represented. Optional capability filter.
 * @param {{ capability?: string, limit?: number }} [opts]
 */
export async function listPublicAgents({ capability = "", limit = 50 } = {}) {
    const cap = String(capability || "").trim().toLowerCase();
    if (cap && !AGENT_CAPABILITIES.includes(cap)) throw err(422, "AGENT_INVALID", `Unknown capability: ${cap}`);
    const cards = await listDiscoverCards();
    const out = [];
    for (const card of cards) {
        if (!card.companyId || !card.snId) continue;
        const agent = await ensureCompanyAgent(card.companyId);
        if (agent.status !== AGENT_STATUSES.ACTIVE) continue;
        if (cap && !agent.capabilities.includes(cap)) continue;
        out.push(toPublicCard(agent, card));
    }
    const max = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return {
        agents: out.slice(0, max),
        total: out.length,
        capabilities: AGENT_CAPABILITIES,
    };
}

export async function listAllAgentsForPlatform({ limit = 200 } = {}) {
    return (await agents.list({ limit })).map(strip);
}

export function clearNetworkAgentsForTests() {
    agents.clearMemory();
    refs.clearMemory();
}
