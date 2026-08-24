/**
 * Knowledge service — tenant-scoped documents + legacy bridge.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import {
    saveKnowledgeDocument as legacySave,
    listKnowledgeDocuments as legacyList,
    parseUploadedFile,
} from "../knowledgeService.js";

class KnowledgeBaseService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.KNOWLEDGE_BASES);
    }
}

class DocumentService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.DOCUMENTS);
    }
}

const kbService = new KnowledgeBaseService();
const docService = new DocumentService();

export { parseUploadedFile };

export async function ensureKnowledgeBase(companyId, kbId = null) {
    const id = kbId || `kb-${companyId}`;
    const existing = await kbService.get(companyId, id);
    if (existing) return existing;

    return kbService.create(
        companyId,
        {
            id,
            name: `${companyId} Knowledge Base`,
            status: "active",
        },
        id
    );
}

export async function saveKnowledgeDocument(params) {
    const { companyId } = params;
    if (!companyId) throw new Error("companyId is required");

    const knowledgeBaseId = params.knowledgeBaseId || `kb-${companyId}`;
    await ensureKnowledgeBase(companyId, knowledgeBaseId);

    const saved = await legacySave({ ...params, knowledgeBaseId });

    if (saved?.id) {
        await docService.upsert(companyId, saved.id, {
            ...saved,
            knowledgeBaseId,
            agentId: params.agentId || null,
            source: params.source || "upload",
        });
    }

    return { ...saved, knowledgeBaseId };
}

export async function listKnowledgeDocuments(companyId, options = {}) {
    const tenantDocs = await docService.list(companyId, {
        max: options.limit || 100,
        filters: options.knowledgeBaseId ? { knowledgeBaseId: options.knowledgeBaseId } : {},
    });

    if (tenantDocs.length) return tenantDocs;

    const legacy = await legacyList(companyId);
    return legacy;
}

export async function deleteKnowledgeDocument(companyId, docId) {
    await docService.delete(companyId, docId).catch(() => {});
    const adapter = await getStorageAdapter();
    if (adapter.deleteKnowledgeDoc) {
        await adapter.deleteKnowledgeDoc(docId).catch(() => {});
    }
    return { success: true, id: docId };
}

/**
 * Keyword search for RAG-lite — filters by knowledgeBaseId when provided.
 *
 * Inventory documents use type: "inventory" with structured listing content
 * (Year, Model, Mileage, Price, Transmission, Fuel, Location, Stock Number,
 * Finance Estimate, Images, Availability). See demoCentralMotorsInventory.js.
 */

/** Short keywords included even when under the default 4-char term length. */
const INVENTORY_SEARCH_KEYWORDS = new Set([
    "hilux",
    "fortuner",
    "toyota",
    "inventory",
    "stock",
    "vehicle",
    "vehicles",
    "used",
    "budget",
    "price",
    "pricing",
    "mileage",
    "transmission",
    "diesel",
    "petrol",
    "finance",
    "available",
    "availability",
    "fortuners",
]);

function extractSearchTerms(queryText) {
    const raw = String(queryText || "").toLowerCase();
    const terms = raw.split(/\W+/).filter((w) => w.length > 3);

    for (const kw of INVENTORY_SEARCH_KEYWORDS) {
        if (raw.includes(kw) && !terms.includes(kw)) {
            terms.push(kw);
        }
    }

    return terms;
}

function hasInventoryIntent(terms, rawQuery) {
    if (terms.some((t) => INVENTORY_SEARCH_KEYWORDS.has(t))) return true;
    return /\b(r\s?\d[\d,.\s]*k?)\b/i.test(rawQuery);
}

export async function searchKnowledgeForQuery(companyId, queryText, options = {}) {
    const rawQuery = String(queryText || "");
    const terms = extractSearchTerms(rawQuery);
    const inventoryIntent = hasInventoryIntent(terms, rawQuery);

    let docs = await listKnowledgeDocuments(companyId, {
        knowledgeBaseId: options.knowledgeBaseId,
        limit: options.limit || 50,
    });

    if (options.knowledgeBaseId) {
        docs = docs.filter(
            (d) => !d.knowledgeBaseId || d.knowledgeBaseId === options.knowledgeBaseId
        );
    }

    // Short greetings ("Hi", "Hello") produce no search terms — skip irrelevant KB injection.
    if (!terms.length) {
        return { context: "", sources: [], documents: [] };
    }

    const scored = docs
        .map((doc) => {
            const hay = `${doc.title || ""} ${doc.content || ""} ${doc.type || ""}`.toLowerCase();
            let score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
            if (inventoryIntent && doc.type === "inventory") {
                score += 2;
            }
            return { doc, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit || 3);

    const picks = scored.map((r) => r.doc);
    const context = picks
        .map((d) => `### ${d.title || "Document"}\n${(d.content || "").slice(0, 1500)}`)
        .join("\n\n");

    return {
        context,
        sources: picks.map((d) => d.title || d.id || "unknown"),
        documents: picks,
    };
}

export async function listKnowledgeBases(companyId) {
    return kbService.list(companyId);
}
