/**
 * Company workspace service — tenant root document + settings subcollection.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS, COMPANY_STATUS } from "../database/schema.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { companyRef, setDoc, getDoc, serverTimestamp } from "../database/firestoreClient.js";
import { portalUrlForCompany } from "../core/siteUrls.js";

class SettingsRepo extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.SETTINGS);
    }
}

const settingsRepo = new SettingsRepo();

function now() {
    return new Date().toISOString();
}

function defaultBranding(name) {
    return {
        primaryColor: "#1e40af",
        whatsappGreeting: `Hi! Welcome to ${name || "our team"}. How can we help you today?`,
    };
}

function normalizeCompanyRecord(companyId, data = {}, existing = {}) {
    const name = String(data.name ?? existing.name ?? companyId).trim();
    const timestamp = now();
    return {
        id: companyId,
        name,
        industry: data.industry ?? existing.industry ?? "",
        plan: data.plan ?? existing.plan ?? "starter",
        status: data.status ?? existing.status ?? COMPANY_STATUS.ACTIVE,
        email: data.email ?? existing.email ?? "",
        phone: data.phone ?? existing.phone ?? "",
        website: data.website ?? existing.website ?? "",
        owner: data.owner ?? existing.owner ?? "",
        ownerEmail: data.ownerEmail ?? existing.ownerEmail ?? "",
        ownerId: data.ownerId ?? data.ownerUid ?? existing.ownerId ?? existing.ownerUid ?? null,
        ownerUid: data.ownerUid ?? data.ownerId ?? existing.ownerUid ?? existing.ownerId ?? null,
        whatsappNumber: data.whatsappNumber ?? existing.whatsappNumber ?? "",
        whatsappConnected: Boolean(data.whatsappConnected ?? existing.whatsappConnected),
        branding: data.branding ?? existing.branding ?? defaultBranding(name),
        settings: data.settings ?? existing.settings ?? {},
        createdAt: existing.createdAt ?? data.createdAt ?? timestamp,
        updatedAt: timestamp,
        provisionedAt: data.provisionedAt ?? existing.provisionedAt ?? null,
    };
}

async function persistCompanyRoot(companyId, record, { merge = false } = {}) {
    const adapter = await getStorageAdapter();

    if (adapter.savePortalCompany) {
        await adapter.savePortalCompany(companyId, record);
    }

    if (adapter.name !== "memory") {
        try {
            const payload = merge
                ? { ...record, updatedAt: serverTimestamp() }
                : { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            await setDoc(companyRef(companyId), payload, { merge });
        } catch (err) {
            console.warn("[companyService] Firestore write skipped:", err.message);
        }
    } else {
        await settingsRepo.upsert(companyId, "profile", record);
    }

    return record;
}

export async function getCompany(companyId) {
    if (!companyId) return null;

    const adapter = await getStorageAdapter();
    if (adapter.getPortalCompany) {
        const portal = await adapter.getPortalCompany(companyId);
        if (portal) return portal;
    }

    if (adapter.name === "memory") {
        return settingsRepo.get(companyId, "profile");
    }

    try {
        const snap = await getDoc(companyRef(companyId));
        if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch {
        /* fall through */
    }

    return null;
}

export async function createCompany(companyId, data = {}) {
    if (!companyId) throw new Error("companyId is required");

    const record = normalizeCompanyRecord(companyId, data);
    await persistCompanyRoot(companyId, record);

    if (data.branding) {
        await saveCompanyBranding(companyId, data.branding);
    }
    if (data.settings?.general) {
        await saveCompanyGeneralSettings(companyId, data.settings.general);
    }

    return record;
}

export async function updateCompany(companyId, patch) {
    const existing = (await getCompany(companyId)) || { id: companyId };
    const updated = normalizeCompanyRecord(companyId, patch, existing);
    await persistCompanyRoot(companyId, updated, { merge: true });
    return updated;
}

export async function suspendCompany(companyId, reason = "") {
    return updateCompany(companyId, {
        status: COMPANY_STATUS.SUSPENDED,
        suspendedAt: now(),
        suspendReason: reason || null,
    });
}

export async function archiveCompany(companyId, reason = "") {
    return updateCompany(companyId, {
        status: COMPANY_STATUS.ARCHIVED,
        archivedAt: now(),
        archiveReason: reason || null,
    });
}

export async function getCompanyBranding(companyId) {
    const fromSettings = await settingsRepo.get(companyId, "branding");
    if (fromSettings) return fromSettings;

    const company = await getCompany(companyId);
    return company?.branding || defaultBranding(company?.name);
}

export async function getCompanyGeneralSettings(companyId) {
    const fromSettings = await settingsRepo.get(companyId, "general");
    if (fromSettings) return fromSettings;

    const company = await getCompany(companyId);
    return company?.settings?.general || {};
}

export async function saveCompanyBranding(companyId, branding) {
    const merged = { ...(await getCompanyBranding(companyId)), ...branding, updatedAt: now() };
    await settingsRepo.upsert(companyId, "branding", merged);
    await updateCompany(companyId, { branding: merged });
    return merged;
}

export async function saveCompanyGeneralSettings(companyId, general) {
    const merged = { ...(await getCompanyGeneralSettings(companyId)), ...general, updatedAt: now() };
    await settingsRepo.upsert(companyId, "general", merged);
    const company = await getCompany(companyId);
    await updateCompany(companyId, {
        settings: { ...(company?.settings || {}), general: merged },
    });
    return merged;
}

export async function saveProvisioningLinks(companyId, links, resources = []) {
    const adapter = await getStorageAdapter();
    const record = {
        companyId,
        links,
        resources,
        provisionedAt: now(),
    };

    if (adapter.saveProvisioning) {
        await adapter.saveProvisioning(companyId, record);
    }

    await settingsRepo.upsert(companyId, "provisioning", record);
    return record;
}

export async function getProvisioningLinks(companyId) {
    const adapter = await getStorageAdapter();
    if (adapter.getProvisioning) {
        const record = await adapter.getProvisioning(companyId);
        if (record) return record;
    }
    return settingsRepo.get(companyId, "provisioning");
}

/** Nav paths for each provisioned workspace area. */
export function buildWorkspaceLinks(companyId, extras = {}) {
    const base = portalUrlForCompany(companyId);
    return {
        portalUrl: base,
        dashboard: `${base}#dashboard`,
        departments: `${base}#team`,
        team: `${base}#team`,
        aiEmployees: `${base}#agents`,
        knowledge: `${base}#knowledge`,
        crm: `${base}#customers`,
        analytics: `${base}#analytics`,
        billing: `${base}#billing`,
        automation: `${base}#automation`,
        settings: `${base}#settings`,
        conversations: `${base}#conversations`,
        ...extras,
    };
}
