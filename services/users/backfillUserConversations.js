/**
 * C1 WP5/WP6 — one-time userConversations backfill from tenant CRM + in-memory snapshot.
 * @see docs/architecture/COMPANY_PORTAL_C1_IDENTITY_EVENTS_PLAN.md §4.3
 */
import { randomUUID, createHash } from "node:crypto";
import {
    buildConsumerConversationId,
    isValidPersonId,
    personIdFromUserId,
} from "./identityContracts.js";
import { resolveSarahAppCustomerId } from "../storage/tenantStorage.js";

const CHANNEL = "sarah_app";
const SARAH_APP_CUSTOMER_PREFIX = "sarah_app::";

/**
 * @typedef {object} BackfillConversationPlan
 * @property {string} conversationId
 * @property {string} personId
 * @property {string} userId
 * @property {string} companyId
 * @property {string} tenantConversationId
 * @property {string|null} tenantCustomerId
 * @property {string} lastMessageAt
 * @property {string} preview
 * @property {string} createdAt
 * @property {string} source "tenant"|"memory"|"merged"
 * @property {object[]} messages
 */

/**
 * @param {string[]} argv
 */
export function parseBackfillCliArgs(argv = process.argv.slice(2)) {
    const args = {
        companyId: process.env.DEFAULT_COMPANY_ID || null,
        dryRun: false,
        since: null,
        maxMessages: 50,
        copyMessages: true,
        fromTenant: true,
        memorySnapshotPath: null,
        fromProcessMemory: false,
        limit: 5000,
    };
    for (const arg of argv) {
        if (arg === "--dry-run") args.dryRun = true;
        else if (arg === "--no-messages") args.copyMessages = false;
        else if (arg === "--from-process-memory") args.fromProcessMemory = true;
        else if (arg === "--tenant-only") args.fromProcessMemory = false;
        else if (arg.startsWith("--company-id=")) args.companyId = arg.slice("--company-id=".length);
        else if (arg.startsWith("--companyId=")) args.companyId = arg.slice("--companyId=".length);
        else if (arg.startsWith("--since=")) args.since = arg.slice("--since=".length);
        else if (arg.startsWith("--max-messages=")) {
            args.maxMessages = Math.max(0, Number(arg.slice("--max-messages=".length)) || 0);
        }
        else if (arg.startsWith("--limit=")) args.limit = Math.max(1, Number(arg.slice("--limit=".length)) || 5000);
        else if (arg.startsWith("--memory-snapshot=")) args.memorySnapshotPath = arg.slice("--memory-snapshot=".length);
        else if (arg === "--help" || arg === "-h") args.help = true;
    }
    return args;
}

/**
 * @param {object} tenantConv
 * @returns {string|null}
 */
export function personIdFromTenantConversation(tenantConv) {
    if (!tenantConv || typeof tenantConv !== "object") return null;
    const external = String(tenantConv.externalUserId || "").trim();
    if (isValidPersonId(external)) return external;

    const customerId = String(tenantConv.customerId || "").trim();
    if (customerId.startsWith(SARAH_APP_CUSTOMER_PREFIX)) {
        const uid = customerId.slice(SARAH_APP_CUSTOMER_PREFIX.length);
        if (isValidPersonId(uid)) return uid;
    }

    const docId = String(tenantConv.id || tenantConv.conversationId || "").trim();
    const marker = `${CHANNEL}::${SARAH_APP_CUSTOMER_PREFIX}`;
    const idx = docId.indexOf(marker);
    if (idx >= 0) {
        const uid = docId.slice(idx + marker.length);
        if (isValidPersonId(uid)) return uid;
    }
    return null;
}

/**
 * @param {string|null|undefined} sinceIso
 * @param {string|null|undefined} candidateIso
 */
export function passesSinceFilter(sinceIso, candidateIso) {
    if (!sinceIso) return true;
    if (!candidateIso) return true;
    return new Date(candidateIso).getTime() >= new Date(sinceIso).getTime();
}

/**
 * @param {object} tenantMessage
 * @param {string} conversationId
 * @returns {object|null}
 */
export function mapTenantMessageToConsumer(tenantMessage, conversationId) {
    if (!tenantMessage) return null;
    const content = String(tenantMessage.content || tenantMessage.message || "").trim();
    if (!content) return null;
    const roleRaw = tenantMessage.role;
    const role = roleRaw === "assistant" ? "assistant" : "user";
    const externalId = tenantMessage.externalId || null;
    const docId = tenantMessage.id || null;
    let messageId = null;
    if (externalId && String(externalId).length <= 128) {
        messageId = String(externalId);
    } else if (docId) {
        messageId = String(docId);
    } else {
        const hash = createHash("sha256")
            .update(`${conversationId}:${tenantMessage.createdAt}:${content.slice(0, 64)}`)
            .digest("hex")
            .slice(0, 32);
        messageId = `bf-${hash}`;
    }
    return {
        id: messageId,
        conversationId,
        role,
        content,
        source: tenantMessage.source ?? (role === "user" ? "customer" : "ai"),
        createdAt: tenantMessage.createdAt || new Date().toISOString(),
        tenantMessageId: docId,
    };
}

/**
 * @param {string} companyId
 * @param {object} tenantConv
 * @returns {BackfillConversationPlan|null}
 */
export function buildBackfillPlanFromTenantConversation(companyId, tenantConv) {
    if (!companyId || !tenantConv) return null;
    if (tenantConv.channel && tenantConv.channel !== CHANNEL) return null;
    if (tenantConv.channel !== CHANNEL && !String(tenantConv.id || "").startsWith(`${CHANNEL}::`)) {
        return null;
    }

    const personId = personIdFromTenantConversation(tenantConv);
    if (!personId) return null;

    const tenantConversationId = String(tenantConv.id || tenantConv.conversationId || "").trim();
    const tenantCustomerId =
        tenantConv.customerId ||
        resolveSarahAppCustomerId(personId);

    const conversationId = buildConsumerConversationId(personId, companyId);
    const lastMessageAt =
        tenantConv.lastMessageAt ||
        tenantConv.updatedAt ||
        tenantConv.createdAt ||
        new Date().toISOString();
    const preview = String(tenantConv.preview || tenantConv.lastMessage || "").slice(0, 160);

    return {
        conversationId,
        personId,
        userId: personId,
        companyId,
        channel: CHANNEL,
        tenantConversationId,
        tenantCustomerId,
        lastMessageAt,
        preview,
        createdAt: tenantConv.createdAt || lastMessageAt,
        companyName: tenantConv.companyName || tenantConv.customerName || null,
        source: "tenant",
        messages: [],
    };
}

/**
 * @param {object} conv
 * @param {object[]|null|undefined} messages
 * @returns {BackfillConversationPlan|null}
 */
export function buildBackfillPlanFromMemoryConversation(conv, messages = []) {
    if (!conv?.id || !conv?.companyId) return null;
    const userId = String(conv.userId || conv.personId || "").trim();
    if (!isValidPersonId(userId)) return null;

    const personId = personIdFromUserId(userId);
    const conversationId = conv.id || buildConsumerConversationId(personId, conv.companyId);
    const msgList = Array.isArray(messages) ? messages : [];
    const lastFromMsgs = msgList[msgList.length - 1];
    const lastMessageAt = conv.lastMessageAt || lastFromMsgs?.createdAt || conv.createdAt || new Date().toISOString();

    return {
        conversationId,
        personId,
        userId,
        companyId: conv.companyId,
        channel: CHANNEL,
        tenantConversationId: conv.tenantConversationId || null,
        tenantCustomerId: conv.tenantCustomerId || resolveSarahAppCustomerId(personId),
        lastMessageAt,
        preview: String(conv.preview || lastFromMsgs?.content || "").slice(0, 160),
        createdAt: conv.createdAt || lastMessageAt,
        companyName: conv.companyName || null,
        consumerDisplayName: conv.consumerDisplayName || null,
        source: "memory",
        messages: msgList.map((m) => ({
            id: m.id || randomUUID(),
            conversationId,
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || ""),
            source: m.source ?? null,
            createdAt: m.createdAt || lastMessageAt,
            tenantMessageId: m.tenantMessageId ?? null,
        })),
    };
}

/**
 * Merge tenant + memory plans keyed by conversationId (memory wins on metadata when newer).
 * @param {BackfillConversationPlan[]} plans
 * @returns {BackfillConversationPlan[]}
 */
export function mergeBackfillPlans(plans) {
    /** @type {Map<string, BackfillConversationPlan>} */
    const byId = new Map();
    for (const plan of plans) {
        if (!plan?.conversationId) continue;
        const existing = byId.get(plan.conversationId);
        if (!existing) {
            byId.set(plan.conversationId, { ...plan, messages: [...(plan.messages || [])] });
            continue;
        }
        const existingTs = new Date(existing.lastMessageAt).getTime();
        const planTs = new Date(plan.lastMessageAt).getTime();
        const base = planTs >= existingTs ? { ...existing, ...plan } : { ...plan, ...existing };
        base.source = existing.source !== plan.source ? "merged" : base.source;
        /** @type {Map<string, object>} */
        const msgById = new Map();
        for (const m of [...(existing.messages || []), ...(plan.messages || [])]) {
            if (m?.id) msgById.set(m.id, m);
        }
        base.messages = [...msgById.values()].sort((a, b) =>
            String(a.createdAt).localeCompare(String(b.createdAt))
        );
        byId.set(plan.conversationId, base);
    }
    return [...byId.values()].sort((a, b) => a.conversationId.localeCompare(b.conversationId));
}

/**
 * @param {object} snapshot
 * @returns {BackfillConversationPlan[]}
 */
export function plansFromMemorySnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.conversations)) return [];
    const messagesByConversationId = snapshot.messagesByConversationId || {};
    return snapshot.conversations
        .map((conv) =>
            buildBackfillPlanFromMemoryConversation(conv, messagesByConversationId[conv.id] || [])
        )
        .filter(Boolean);
}

/**
 * @param {BackfillConversationPlan[]} plans
 * @param {{ dryRun?: boolean, copyMessages?: boolean, maxMessages?: number }} options
 * @param {object} deps
 */
export async function applyBackfillPlans(plans, options, deps) {
    const dryRun = Boolean(options.dryRun);
    const copyMessages = options.copyMessages !== false;
    const maxMessages = Math.max(0, options.maxMessages ?? 50);

    const stats = {
        dryRun,
        conversationsSeen: plans.length,
        conversationsWritten: 0,
        conversationsSkipped: 0,
        messagesWritten: 0,
        messagesSkipped: 0,
        errors: [],
    };

    for (const plan of plans) {
        try {
            const existing = deps.getConversationById
                ? await deps.getConversationById(plan.conversationId)
                : null;
            if (existing?.tenantConversationId && plan.tenantConversationId) {
                if (
                    existing.tenantConversationId === plan.tenantConversationId &&
                    new Date(existing.lastMessageAt).getTime() >= new Date(plan.lastMessageAt).getTime() &&
                    (!copyMessages || maxMessages === 0)
                ) {
                    stats.conversationsSkipped += 1;
                    continue;
                }
            }

            const metadata = {
                id: plan.conversationId,
                personId: plan.personId,
                userId: plan.userId,
                companyId: plan.companyId,
                channel: CHANNEL,
                tenantConversationId: plan.tenantConversationId,
                tenantCustomerId: plan.tenantCustomerId,
                lastMessageAt: plan.lastMessageAt,
                preview: plan.preview,
                createdAt: plan.createdAt,
                companyName: plan.companyName || null,
                consumerDisplayName: plan.consumerDisplayName || null,
            };

            if (dryRun) {
                stats.conversationsWritten += 1;
            } else {
                await deps.upsertConversation(metadata);
                stats.conversationsWritten += 1;
            }

            if (!copyMessages || maxMessages === 0) continue;

            let messages = [...(plan.messages || [])];
            if (messages.length < maxMessages && deps.loadTenantMessages && plan.tenantConversationId) {
                const tenantMsgs = await deps.loadTenantMessages(plan.companyId, plan.tenantConversationId);
                const mapped = tenantMsgs
                    .map((m) => mapTenantMessageToConsumer(m, plan.conversationId))
                    .filter(Boolean);
                /** @type {Map<string, object>} */
                const byId = new Map(messages.map((m) => [m.id, m]));
                for (const m of mapped) byId.set(m.id, m);
                messages = [...byId.values()].sort((a, b) =>
                    String(a.createdAt).localeCompare(String(b.createdAt))
                );
            }

            const slice = messages.slice(-maxMessages);
            for (const message of slice) {
                if (dryRun) {
                    stats.messagesWritten += 1;
                    continue;
                }
                await deps.upsertMessage(plan.conversationId, message, {
                    lastMessageAt: plan.lastMessageAt,
                    preview: plan.preview,
                    tenantConversationId: plan.tenantConversationId,
                });
                stats.messagesWritten += 1;
            }
        } catch (err) {
            stats.errors.push({
                conversationId: plan.conversationId,
                message: err?.message || String(err),
            });
        }
    }

    return stats;
}

/**
 * Paginate sarah_app tenant conversations for a company.
 * @param {string} companyId
 * @param {{ limit?: number, since?: string|null }} options
 * @param {{ listTenantConversationsPage: Function }} deps
 */
export async function loadTenantSarahAppConversationPlans(companyId, options, deps) {
    const hardLimit = Math.max(1, options.limit ?? 5000);
    const since = options.since || null;
    /** @type {BackfillConversationPlan[]} */
    const plans = [];
    let cursor = null;
    let fetched = 0;

    while (fetched < hardLimit) {
        const pageSize = Math.min(200, hardLimit - fetched);
        const page = await deps.listTenantConversationsPage(companyId, {
            max: pageSize,
            orderByField: "updatedAt",
            filters: { channel: CHANNEL },
            startAfterId: cursor,
        });
        for (const row of page.items || []) {
            const plan = buildBackfillPlanFromTenantConversation(companyId, row);
            if (!plan) continue;
            if (!passesSinceFilter(since, plan.lastMessageAt)) continue;
            plans.push(plan);
        }
        fetched += page.items?.length || 0;
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
    }

    return plans;
}

/**
 * @param {object} cliArgs
 * @param {object} deps
 */
export async function runUserConversationsBackfill(cliArgs, deps) {
    if (!cliArgs.companyId) {
        throw new Error("companyId is required (--company-id=)");
    }

    /** @type {BackfillConversationPlan[]} */
    let plans = [];

    if (cliArgs.fromTenant !== false) {
        const tenantPlans = await loadTenantSarahAppConversationPlans(
            cliArgs.companyId,
            { limit: cliArgs.limit, since: cliArgs.since },
            deps
        );
        plans.push(...tenantPlans);
    }

    if (cliArgs.memorySnapshot) {
        plans.push(...plansFromMemorySnapshot(cliArgs.memorySnapshot));
    }

    if (cliArgs.processMemorySnapshot) {
        plans.push(...plansFromMemorySnapshot(cliArgs.processMemorySnapshot));
    }

    const merged = mergeBackfillPlans(
        plans.filter((p) => passesSinceFilter(cliArgs.since, p.lastMessageAt))
    );

    const stats = await applyBackfillPlans(
        merged,
        {
            dryRun: cliArgs.dryRun,
            copyMessages: cliArgs.copyMessages,
            maxMessages: cliArgs.maxMessages,
        },
        deps
    );

    return { plans: merged, stats };
}

export function formatBackfillUsage() {
    return `Usage:
  node scripts/backfill-user-conversations-from-tenant.mjs --company-id=<tenantId> [options]

Options:
  --dry-run                 Print actions without writing Firestore userConversations
  --since=<ISO8601>         Only conversations with lastMessageAt on/after timestamp
  --max-messages=<n>        Copy up to N messages per thread (default 50, 0 to skip)
  --no-messages             Skip message subcollection copy (metadata only)
  --limit=<n>               Max tenant sarah_app conversations to scan (default 5000)
  --memory-snapshot=<path>  JSON export from in-memory userConversationService
  --from-process-memory     Include conversations from current Node process memory maps
  --company-id=<id>         Tenant company id (required)

Requires Firebase Admin credentials (USER_CONVERSATIONS_BACKEND=firestore recommended).
Does not modify WhatsApp tenant paths or Portal UI.`;
}
