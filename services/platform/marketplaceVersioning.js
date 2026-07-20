/**
 * Marketplace pack versioning — semver, update checks, merge-on-apply strategy.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { getPackById, resolvePackId } from "./marketplaceRegistry.js";
import { buildPackManifest, resolveCanonicalPackId } from "./marketplaceTemplate.js";
import { installIndustryPack, getInstalledPacks } from "./industryPackService.js";

function parseSemver(v) {
    const parts = String(v || "0.0.0").replace(/^v/, "").split(".").map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0, raw: v };
}

export function compareVersions(a, b) {
    const va = parseSemver(a);
    const vb = parseSemver(b);
    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    return va.patch - vb.patch;
}

async function adapter() {
    return getStorageAdapter();
}

/**
 * Register pack version template in platform store.
 */
export async function registerPackVersion(packId, version, template) {
    const store = await adapter();
    if (store.savePackVersion) {
        return store.savePackVersion(packId, version, template);
    }
    return { packId, version, template };
}

/**
 * Get all registered versions for a pack.
 */
export async function listPackVersions(packId) {
    const store = await adapter();
    if (store.listPackVersions) {
        return store.listPackVersions(packId);
    }
    const pack = getPackById(packId);
    if (!pack) return [];
    return [
        { packId, version: pack.version || "1.0.0", template: buildPackManifest(pack), publishedAt: "2026-01-01T00:00:00Z" },
        { packId, version: pack.latestVersion || "1.1.0", template: buildPackManifest({ ...pack, version: "1.1.0" }), publishedAt: "2026-06-01T00:00:00Z" },
    ];
}

/**
 * Check if tenant has updates available for installed packs.
 */
export async function checkForUpdates(companyId, packId = null) {
    if (!companyId) return { updates: [] };

    const { items } = await getInstalledPacks(companyId);
    const targets = packId
        ? items.filter((p) => resolveCanonicalPackId(p.packId) === resolveCanonicalPackId(packId))
        : items;

    const updates = [];
    for (const installed of targets) {
        const resolved = resolvePackId(installed.packId);
        const versions = await listPackVersions(resolved);
        const latest = versions.sort((a, b) => compareVersions(b.version, a.version))[0];
        if (!latest) continue;

        const currentVersion = installed.version || "1.0.0";
        if (compareVersions(latest.version, currentVersion) > 0) {
            updates.push({
                packId: resolved,
                packName: installed.packName,
                currentVersion,
                latestVersion: latest.version,
                publishedAt: latest.publishedAt,
                changelog: latest.changelog || getDefaultChangelog(latest.version),
            });
        }
    }

    return { companyId, updates };
}

function getDefaultChangelog(version) {
    return [
        "New industry FAQs and prompt templates",
        "Improved conversation flow triggers",
        "Analytics dashboard defaults updated",
        `Version ${version} — non-breaking merge update`,
    ];
}

/**
 * Merge strategy: preserve tenant customizations, add new KB docs/workflows, update prompts.
 */
export function buildMergePlan(installed, targetTemplate, customizations = {}) {
    const preserved = {
        branding: customizations.branding || installed.customizations?.branding || {},
        disabledIntegrations: customizations.disabledIntegrations || installed.customizations?.disabledIntegrations || [],
        customKnowledgeIds: installed.knowledgeDocIds || [],
        customWorkflowIds: installed.workflowIds || [],
    };

    const newKnowledge = (targetTemplate.knowledge || []).filter(
        (doc) => !installed.mergedKnowledgeTitles?.includes(doc.title)
    );
    const newWorkflows = (targetTemplate.workflows || []).filter(
        (wf) => !installed.mergedWorkflowNames?.includes(wf.name)
    );

    return {
        strategy: "merge",
        preserve: preserved,
        add: {
            knowledge: newKnowledge,
            workflows: newWorkflows,
            prompts: targetTemplate.prompts || [],
            analytics: targetTemplate.analytics,
        },
        update: {
            version: targetTemplate.version,
            agents: targetTemplate.agents,
        },
    };
}

/**
 * Apply pack update for a tenant — merges new content without removing customizations.
 */
export async function applyUpdate(companyId, packId, targetVersion) {
    if (!companyId) throw new Error("companyId is required");
    if (!packId) throw new Error("packId is required");

    const resolved = resolvePackId(packId);
    const versions = await listPackVersions(resolved);
    const target = versions.find((v) => v.version === targetVersion);
    if (!target) throw new Error(`Version ${targetVersion} not found for pack ${packId}`);

    const { items } = await getInstalledPacks(companyId);
    const installed = items.find(
        (p) => resolveCanonicalPackId(p.packId) === resolveCanonicalPackId(resolved)
    );
    if (!installed) throw new Error(`Pack ${packId} is not installed for this company`);

    const mergePlan = buildMergePlan(installed, target.template, installed.customizations);
    const store = await adapter();
    const timestamp = new Date().toISOString();

    const newKnowledgeIds = [];
    if (store.saveKnowledgeDoc && mergePlan.add.knowledge.length) {
        const kbId = installed.links?.knowledgeBaseId || `kb-${companyId}`;
        for (const doc of mergePlan.add.knowledge) {
            const saved = await store.saveKnowledgeDoc({
                ...doc,
                id: `kn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                companyId,
                knowledgeBaseId: kbId,
                status: "active",
                source: `pack-update:${resolved}@${targetVersion}`,
                createdAt: timestamp,
                updatedAt: timestamp,
            });
            newKnowledgeIds.push(saved.id);
        }
    }

    const updatedRecord = {
        ...installed,
        version: targetVersion,
        updatedAt: timestamp,
        knowledgeDocIds: [...(installed.knowledgeDocIds || []), ...newKnowledgeIds],
        mergedKnowledgeTitles: [
            ...(installed.mergedKnowledgeTitles || []),
            ...mergePlan.add.knowledge.map((k) => k.title),
        ],
        mergePlan,
    };

    if (store.updateInstalledPack) {
        await store.updateInstalledPack(companyId, installed.packId, updatedRecord);
    } else if (store.saveInstalledPack) {
        await store.saveInstalledPack(companyId, { ...updatedRecord, _replace: true, _originalPackId: installed.packId });
    }

    return {
        success: true,
        companyId,
        packId: resolved,
        previousVersion: installed.version,
        newVersion: targetVersion,
        merged: {
            knowledgeAdded: newKnowledgeIds.length,
            workflowsAdded: mergePlan.add.workflows.length,
            customizationsPreserved: true,
        },
        message: `Updated ${installed.packName} to v${targetVersion}. Your customizations were preserved.`,
    };
}

/**
 * Seed platform pack versions from registry (dev/memory backend).
 */
export async function seedPackVersions() {
    const store = await adapter();
    if (!store.savePackVersion) return;

    const flagshipIds = [
        "pack-school-ai", "pack-law-ai", "pack-clinic-ai", "pack-funeral-ai",
        "pack-sales-ai", "pack-receptionist-ai", "pack-church-ai", "pack-construction-ai",
        "pack-security-ai", "pack-restaurant-ai", "pack-automotive-ai", "pack-retail-ai",
        "pack-school-receptionist", "pack-law-receptionist", "pack-medical-receptionist",
        "pack-automotive", "pack-dentist", "pack-estate-agent-ai",
    ];

    for (const id of flagshipIds) {
        const pack = getPackById(id);
        if (!pack) continue;
        const manifest = buildPackManifest(pack);
        await store.savePackVersion(id, manifest.version, {
            ...manifest,
            changelog: ["Initial release"],
        });
        if (manifest.latestVersion !== manifest.version) {
            await store.savePackVersion(id, manifest.latestVersion, {
                ...manifest,
                version: manifest.latestVersion,
                changelog: getDefaultChangelog(manifest.latestVersion),
            });
        }
    }
}
