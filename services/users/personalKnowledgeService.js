/**
 * U3 — My Knowledge sections (personalKnowledge/{uid}/sections/{sectionKey}).
 */
import { getConfiguredStorageBackend } from "../storage/storageAdapter.js";
import { buildSarahBehaviorPromptBlock, normalizeSarahBehavior } from "../sarah/personal/sarahBehaviorOptions.js";
import {
    getDoc,
    setDoc,
    personalKnowledgeSectionRef,
    serverTimestamp,
    useAdminBackend,
} from "../database/firestoreClient.js";

export const KNOWLEDGE_SECTION_KEYS = [
    "personal_profile",
    "family",
    "education",
    "career",
    "documents",
    "health",
    "finance",
    "lifestyle",
    "important_dates",
    "goals",
    /* Sarah App My Knowledge categories (MK-02) */
    "business",
    "routines",
    "property",
    "travel",
    "values",
];

const EXTRA_SECTION_META = {
    business: { label: "Business & entrepreneurship", classification: "medium", defaultSarahMayUse: true },
    routines: { label: "Routines & daily life", classification: "medium", defaultSarahMayUse: true },
    property: { label: "Property & assets", classification: "medium", defaultSarahMayUse: true },
    travel: { label: "Travel & places", classification: "low", defaultSarahMayUse: true },
    values: { label: "Values & principles", classification: "high", defaultSarahMayUse: false },
};

export const KNOWLEDGE_SECTION_META = {
    ...EXTRA_SECTION_META,
    personal_profile: { label: "Personal profile", classification: "medium", defaultSarahMayUse: true },
    family: { label: "Family", classification: "high", defaultSarahMayUse: false },
    education: { label: "Education", classification: "medium", defaultSarahMayUse: true },
    career: { label: "Career & CV", classification: "medium", defaultSarahMayUse: true },
    documents: { label: "Documents", classification: "high", defaultSarahMayUse: false },
    health: { label: "Health", classification: "restricted", defaultSarahMayUse: false },
    finance: { label: "Finance", classification: "restricted", defaultSarahMayUse: false },
    lifestyle: { label: "Lifestyle", classification: "low", defaultSarahMayUse: true },
    important_dates: { label: "Important dates", classification: "medium", defaultSarahMayUse: true },
    goals: { label: "Goals", classification: "medium", defaultSarahMayUse: true },
};

const memorySections = new Map();

function memoryKey(uid, sectionKey) {
    return `${uid}:${sectionKey}`;
}

function defaultSection(uid, sectionKey) {
    const meta = KNOWLEDGE_SECTION_META[sectionKey] || {
        label: sectionKey,
        classification: "medium",
        defaultSarahMayUse: false,
    };
    return {
        sectionKey,
        uid,
        label: meta.label,
        classification: meta.classification,
        sarahMayUse: meta.defaultSarahMayUse,
        content: "",
        source: "user",
        updatedAt: null,
    };
}

export function listKnowledgeSectionCatalog() {
    return KNOWLEDGE_SECTION_KEYS.map((key) => ({
        sectionKey: key,
        ...KNOWLEDGE_SECTION_META[key],
    }));
}

export async function listKnowledgeSections(uid) {
    if (!uid) return [];
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        return KNOWLEDGE_SECTION_KEYS.map((key) => {
            return memorySections.get(memoryKey(uid, key)) || defaultSection(uid, key);
        });
    }

    const out = [];
    for (const key of KNOWLEDGE_SECTION_KEYS) {
        const snap = await getDoc(personalKnowledgeSectionRef(uid, key));
        out.push(snap.exists() ? { sectionKey: key, uid, ...snap.data() } : defaultSection(uid, key));
    }
    return out;
}

export async function getKnowledgeSection(uid, sectionKey) {
    if (!KNOWLEDGE_SECTION_KEYS.includes(sectionKey)) {
        throw Object.assign(new Error("Invalid section"), { status: 400, code: "INVALID_SECTION" });
    }
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        return memorySections.get(memoryKey(uid, sectionKey)) || defaultSection(uid, sectionKey);
    }
    const snap = await getDoc(personalKnowledgeSectionRef(uid, sectionKey));
    return snap.exists() ? { sectionKey, uid, ...snap.data() } : defaultSection(uid, sectionKey);
}

export async function upsertKnowledgeSection(uid, sectionKey, patch = {}) {
    if (!KNOWLEDGE_SECTION_KEYS.includes(sectionKey)) {
        throw Object.assign(new Error("Invalid section"), { status: 400, code: "INVALID_SECTION" });
    }
    const current = await getKnowledgeSection(uid, sectionKey);
    const meta = KNOWLEDGE_SECTION_META[sectionKey];
    const next = {
        ...current,
        label: meta.label,
        classification: meta.classification,
        content: patch.content !== undefined ? String(patch.content).slice(0, 12000) : current.content,
        sarahMayUse:
            patch.sarahMayUse !== undefined ? Boolean(patch.sarahMayUse) : current.sarahMayUse,
        source: "user",
        updatedAt: Date.now(),
    };

    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        memorySections.set(memoryKey(uid, sectionKey), next);
        return next;
    }

    await setDoc(
        personalKnowledgeSectionRef(uid, sectionKey),
        {
            uid,
            sectionKey,
            label: next.label,
            classification: next.classification,
            content: next.content,
            sarahMayUse: next.sarahMayUse,
            source: next.source,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
    return getKnowledgeSection(uid, sectionKey);
}

/**
 * Text for Personal Sarah system prompt (authorized sections only).
 */
export function parsePersonalProfilePayload(content) {
    const raw = String(content || "").trim();
    if (!raw) return { fields: {}, sarahBehavior: {} };
    try {
        const j = JSON.parse(raw);
        if (j && typeof j === "object" && !Array.isArray(j)) {
            const { sarahBehavior, ...fields } = j;
            return {
                fields,
                sarahBehavior: normalizeSarahBehavior(sarahBehavior || {}),
            };
        }
    } catch {
        /* plain text legacy */
    }
    return { fields: { narrative: raw }, sarahBehavior: {} };
}

export async function getSarahBehaviorForUser(uid) {
    const sec = await getKnowledgeSection(uid, "personal_profile").catch(() => null);
    if (!sec?.sarahMayUse) return null;
    const { sarahBehavior } = parsePersonalProfilePayload(sec.content);
    const block = buildSarahBehaviorPromptBlock(sarahBehavior);
    return block || null;
}

const FIELD_LABEL_OVERRIDES = {
    preferredName: "Preferred name",
    fullName: "Full name",
    maritalStatus: "Marital status",
    hasChildren: "Has children",
    childrenCount: "Number of children",
    musicTastes: "Music tastes",
    sportsTeams: "Sports teams supported",
    socialStyle: "Social style",
    closeFriends: "Close friends",
    usualHangouts: "Usual hangouts",
    homeRegion: "Home region",
    employmentStatus: "Employment status",
    primaryCurrency: "Primary currency",
    contactFrequency: "Contact frequency",
    livesWith: "Where they live",
};

function humanizeFieldKey(key) {
    if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key];
    return String(key || "")
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
}

function flattenKnowledgeData(value, prefix = "") {
    const lines = [];
    if (value == null) return lines;
    if (Array.isArray(value)) {
        if (!value.length) return lines;
        lines.push(`${prefix || "items"}: ${value.length} entries`);
        value.slice(0, 8).forEach((row, i) => {
            if (row && typeof row === "object") {
                const summary = Object.entries(row)
                    .filter(([, v]) => v != null && String(v).trim())
                    .slice(0, 6)
                    .map(([k, v]) => `${humanizeFieldKey(k)}: ${String(v).slice(0, 120)}`)
                    .join("; ");
                if (summary) lines.push(`- ${prefix ? `${prefix} ` : ""}#${i + 1}: ${summary}`);
            } else if (row != null && String(row).trim()) {
                lines.push(`- ${String(row).slice(0, 200)}`);
            }
        });
        return lines;
    }
    if (typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
            if (v == null || (typeof v === "string" && !v.trim())) continue;
            if (typeof v === "object") {
                lines.push(...flattenKnowledgeData(v, humanizeFieldKey(k)));
            } else {
                lines.push(`${humanizeFieldKey(k)}: ${String(v).slice(0, 400)}`);
            }
        }
        return lines;
    }
    lines.push(`${prefix ? `${prefix}: ` : ""}${String(value).slice(0, 400)}`);
    return lines;
}

export function formatKnowledgeSectionForPrompt(sec) {
    let body = String(sec?.content || "").trim();
    if (!body) return "";
    if (sec.sectionKey === "personal_profile") {
        const { fields } = parsePersonalProfilePayload(body);
        const lines = flattenKnowledgeData(fields);
        return lines.length ? lines.join("\n") : "";
    }
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object") {
            const payload = parsed.data != null ? parsed.data : parsed;
            if (parsed.category && typeof payload === "object") {
                const lines = flattenKnowledgeData(payload);
                return lines.length ? lines.join("\n") : "";
            }
            const lines = flattenKnowledgeData(payload);
            return lines.length ? lines.join("\n") : "";
        }
    } catch {
        /* plain text */
    }
    return body.slice(0, 1200);
}

export async function buildPersonalKnowledgeDigest(uid, maxChars = 4000) {
    const sections = await listKnowledgeSections(uid);
    const parts = [];
    let used = 0;
    const behavior = await getSarahBehaviorForUser(uid);
    if (behavior) {
        parts.push(behavior);
        used += behavior.length + 2;
    }
    for (const sec of sections) {
        if (!sec.sarahMayUse) continue;
        const body = formatKnowledgeSectionForPrompt(sec);
        if (!body) continue;
        const block = `[${sec.label || sec.sectionKey}]\n${body.slice(0, 1200)}`;
        if (used + block.length > maxChars) break;
        parts.push(block);
        used += block.length + 2;
    }
    return parts.length ? parts.join("\n\n") : null;
}
