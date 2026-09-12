/**

 * Marketplace pack versioning — semver, update checks, merge-on-apply strategy.

 */

import { getPackById, resolvePackId } from "./marketplaceRegistry.js";

import { resolveCanonicalPackId } from "./marketplaceTemplate.js";

import { getInstalledPacks } from "./industryPackService.js";

import { getInstall, updateInstalledRecord } from "./marketplaceInstallService.js";

import { getMarketplacePackVersionRepository } from "./marketplacePackVersionRepository.js";

import { saveKnowledgeDocument, ensureKnowledgeBase } from "../tenants/knowledgeService.js";

import { upsertWorkflow } from "../automation/workflowRegistry.js";

import { convertPackWorkflowToAutomation } from "./industryPackService.js";

import { validatePackUpdate } from "./marketplaceUpdateValidator.js";

import {

    marketplaceUpdateLockKey,

    withMarketplaceUpdateLock,

} from "./marketplaceUpdateLock.js";

import { getStorageAdapter } from "../storage/storageAdapter.js";



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



function slugPart(value) {

    return String(value || "")

        .toLowerCase()

        .replace(/[^a-z0-9]+/g, "-")

        .replace(/^-|-$/g, "")

        .slice(0, 48);

}



function stableKnowledgeDocId(packId, title) {

    return `kn-upd-${slugPart(packId)}-${slugPart(title)}`;

}



function stableWorkflowId(packId, workflowName) {

    return `wf-upd-${slugPart(packId)}-${slugPart(workflowName)}`;

}



async function useProductionVersionStore() {

    const adapter = await getStorageAdapter();

    return adapter.name !== "memory";

}



/**

 * Get all published versions for a pack (durable repository only in production).

 */

export async function listPackVersions(packId) {

    const resolved = resolvePackId(packId);

    const repo = await getMarketplacePackVersionRepository();

    return repo.listVersions(resolved);

}



/**

 * Register/publish a pack version in the platform store.

 */

export async function registerPackVersion(packId, version, template, changelog = []) {

    const repo = await getMarketplacePackVersionRepository();

    return repo.publishVersion({

        packId: resolvePackId(packId),

        version,

        template,

        changelog,

    });

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

        if (!versions.length) continue;



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

                changelog: latest.changelog || [],

            });

        }

    }



    return { companyId, updates };

}



/**

 * Merge strategy: preserve tenant customizations, add new KB docs/workflows only (additive).

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

        strategy: "merge-additive",

        preserve: preserved,

        add: {

            knowledge: newKnowledge,

            workflows: newWorkflows,

        },

        update: {

            version: targetTemplate.version,

        },

    };

}



async function applyAdditiveResources(companyId, resolved, targetVersion, installed, mergePlan, packName) {

    const knowledgeBaseId = installed.links?.knowledgeBaseId || `kb-${companyId}`;

    await ensureKnowledgeBase(companyId, knowledgeBaseId);



    const newKnowledgeIds = [];

    for (const doc of mergePlan.add.knowledge) {

        const docId = stableKnowledgeDocId(resolved, doc.title);

        const saved = await saveKnowledgeDocument({

            ...doc,

            id: docId,

            companyId,

            knowledgeBaseId,

            type: doc.type || "manual",

            source: `pack-update:${resolved}@${targetVersion}`,

        });

        if (saved?.id) newKnowledgeIds.push(saved.id);

    }



    const newWorkflowIds = [];

    for (const wfDef of mergePlan.add.workflows) {

        const wfId = stableWorkflowId(resolved, wfDef.name);

        const { trigger, actions } = convertPackWorkflowToAutomation(wfDef);

        const saved = await upsertWorkflow(companyId, wfId, {

            name: `${packName.split(" ")[0]} — ${wfDef.name}`,

            companyId,

            status: "active",

            source: `pack-update:${resolved}@${targetVersion}`,

            packId: resolved,

            trigger,

            actions,

            nodes: wfDef.nodes,

            createdBy: "MarketplaceUpdate",

        });

        if (saved?.id) newWorkflowIds.push(saved.id);

    }



    return { newKnowledgeIds, newWorkflowIds };

}



/**

 * Apply pack update — additive KB/workflows, registry updated last after validation.

 */

export async function applyUpdate(companyId, packId, targetVersion) {

    if (!companyId) throw new Error("companyId is required");

    if (!packId) throw new Error("packId is required");

    if (!targetVersion) throw new Error("targetVersion is required");



    const resolved = resolvePackId(packId);

    const lockKey = marketplaceUpdateLockKey(companyId, resolved);



    return withMarketplaceUpdateLock(lockKey, async () => {

        const versionRepo = await getMarketplacePackVersionRepository();

        const target = await versionRepo.getVersion(resolved, targetVersion);

        if (!target?.template) {

            throw new Error(`Version ${targetVersion} not found for pack ${packId}`);

        }



        const installed = await getInstall(companyId, resolved);

        if (!installed || installed.status !== "installed") {

            throw new Error(`Pack ${packId} is not installed for this company`);

        }



        const currentVersion = installed.version || "1.0.0";

        if (compareVersions(targetVersion, currentVersion) <= 0) {

            throw new Error(

                `Target version ${targetVersion} must be greater than installed version ${currentVersion}`

            );

        }



        const mergePlan = buildMergePlan(installed, target.template, installed.customizations);

        const pack = getPackById(resolved);

        const packName = installed.packName || pack?.name || resolved;



        const nothingToApply =

            mergePlan.add.knowledge.length === 0 && mergePlan.add.workflows.length === 0;

        if (nothingToApply) {

            throw new Error(

                `Version ${targetVersion} has no additive changes for this installation — registry will not advance`

            );

        }



        const previousVersion = currentVersion;

        let newKnowledgeIds = [];

        let newWorkflowIds = [];



        try {

            const applied = await applyAdditiveResources(

                companyId,

                resolved,

                targetVersion,

                installed,

                mergePlan,

                packName

            );

            newKnowledgeIds = applied.newKnowledgeIds;

            newWorkflowIds = applied.newWorkflowIds;

        } catch (err) {

            const fail = new Error(`Update resource apply failed: ${err.message}`);

            fail.code = "MARKETPLACE_UPDATE_RESOURCE_FAILED";

            fail.cause = err;

            throw fail;

        }



        const validation = await validatePackUpdate(companyId, {

            knowledgeDocIds: newKnowledgeIds,

            workflowIds: newWorkflowIds,

        });

        if (!validation.valid) {

            const fail = new Error(`Update validation failed: ${validation.errors.join("; ")}`);

            fail.code = "MARKETPLACE_UPDATE_VALIDATION_FAILED";

            fail.validation = validation;

            throw fail;

        }



        const mergedKnowledgeDocIds = [...new Set([...(installed.knowledgeDocIds || []), ...newKnowledgeIds])];

        const mergedWorkflowIds = [...new Set([...(installed.workflowIds || []), ...newWorkflowIds])];

        const knowledgeAdded = newKnowledgeIds.filter(
            (id) => !(installed.knowledgeDocIds || []).includes(id)
        ).length;

        const workflowsAdded = newWorkflowIds.filter(
            (id) => !(installed.workflowIds || []).includes(id)
        ).length;



        try {

            await updateInstalledRecord(companyId, installed.packId, {

                expectedVersion: previousVersion,

                patch: {

                    version: targetVersion,

                    knowledgeDocIds: mergedKnowledgeDocIds,

                    workflowIds: mergedWorkflowIds,

                    mergedKnowledgeTitles: [

                        ...(installed.mergedKnowledgeTitles || []),

                        ...mergePlan.add.knowledge.map((k) => k.title),

                    ],

                    mergedWorkflowNames: [

                        ...(installed.mergedWorkflowNames || []),

                        ...mergePlan.add.workflows.map((w) => w.name),

                    ],

                },

            });

        } catch (err) {

            const fail = new Error(

                `Registry commit failed after resources were applied: ${err.message}. Resource/registry drift may exist.`

            );

            fail.code = "MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED";

            fail.applied = {

                knowledgeDocIds: newKnowledgeIds,

                workflowIds: newWorkflowIds,

            };

            throw fail;

        }



        return {

            success: true,

            companyId,

            packId: resolved,

            previousVersion,

            newVersion: targetVersion,

            merged: {

                knowledgeAdded,

                workflowsAdded,

                customizationsPreserved: true,

            },

            validation,

            message: `Updated ${packName} to v${targetVersion}. Your customizations were preserved.`,

        };

    });

}



/**

 * Seed curated platform pack versions (explicit catalog only — no synthetic 1.1.0).

 */

export async function seedPackVersions() {

    const { publishCuratedPackVersions } = await import("./marketplacePackVersionRepository.js");

    return publishCuratedPackVersions();

}



export { useProductionVersionStore };


