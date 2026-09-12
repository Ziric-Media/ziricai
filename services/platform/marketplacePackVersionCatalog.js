/**
 * Curated Marketplace pack versions — explicit published definitions only.
 * 1.1.0 entries must contain real additive deltas, not a re-labeled 1.0.0 template.
 */
import { getPackById } from "./marketplaceRegistry.js";
import { buildPackManifest } from "./marketplaceTemplate.js";

/** @typedef {{ packId: string, version: string, template: object, changelog: string[], publishedAt?: string }} CuratedPackVersion */

const FUNERAL_1_1_KNOWLEDGE = [
    {
        title: "FAQ — Grief Support Resources",
        type: "faq",
        content:
            "We can connect families with bereavement counsellors, support groups, and printed grief guides. Ask about local hospice partnerships and aftercare check-ins.",
    },
];

const FUNERAL_1_1_WORKFLOW = {
    name: "Follow-up — Family Support Check-in",
    nodes: [
        {
            type: "trigger",
            stepType: "whatsapp_message",
            config: {},
        },
        {
            type: "condition",
            stepType: "contains_keyword",
            config: { keyword: "support|grief|counselling" },
        },
        {
            type: "action",
            stepType: "reply",
            config: { template: "sympathy_acknowledgement" },
        },
    ],
};

/**
 * Versions to publish into platform/marketplace/packs/{packId}/versions/{version}.
 * Install continues to use live registry pack definitions; versions gate updates only.
 */
export function getCuratedPackVersions(packId) {
    const resolved = packId;
    const pack = getPackById(resolved);
    if (!pack) return [];

    const baseManifest = buildPackManifest(pack);
    const versions = [];

    versions.push({
        packId: resolved,
        version: pack.version || "1.0.0",
        template: {
            ...baseManifest,
            version: pack.version || "1.0.0",
            knowledge: pack.knowledge || [],
            workflows: pack.workflows || [],
        },
        changelog: ["Initial curated release"],
        publishedAt: "2026-01-01T00:00:00.000Z",
    });

    if (resolved === "pack-funeral-ai") {
        versions.push({
            packId: resolved,
            version: "1.1.0",
            template: {
                ...baseManifest,
                version: "1.1.0",
                knowledge: [...(pack.knowledge || []), ...FUNERAL_1_1_KNOWLEDGE],
                workflows: [...(pack.workflows || []), FUNERAL_1_1_WORKFLOW],
            },
            changelog: [
                "Added grief support FAQ knowledge document",
                "Added family support check-in workflow",
            ],
            publishedAt: "2026-06-01T00:00:00.000Z",
        });
    }

    return versions;
}

export function listCuratedPackIdsWithVersions() {
    return ["pack-funeral-ai"];
}
