/**
 * U3 — My Knowledge sections (personalKnowledge/{uid}/sections/{sectionKey}).
 */
import { getConfiguredStorageBackend } from "../storage/storageAdapter.js";
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
];

export const KNOWLEDGE_SECTION_META = {
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
export async function buildPersonalKnowledgeDigest(uid, maxChars = 4000) {
    const sections = await listKnowledgeSections(uid);
    const parts = [];
    let used = 0;
    for (const sec of sections) {
        if (!sec.sarahMayUse) continue;
        const body = String(sec.content || "").trim();
        if (!body) continue;
        const block = `[${sec.label}]\n${body.slice(0, 800)}`;
        if (used + block.length > maxChars) break;
        parts.push(block);
        used += block.length + 2;
    }
    return parts.length ? parts.join("\n\n") : null;
}
