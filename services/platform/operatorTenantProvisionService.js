/**
 * Mission Control operator path — create a real tenant with Auth owner + full provision.
 * No synthetic owner UIDs. Uses Firebase Auth Admin createUser / getUserByEmail only.
 */
import crypto from "crypto";
import admin from "firebase-admin";
import { hasAdminCredentials, getAdminFirestore } from "../database/firestoreAdmin.js";
import { isValidCompanyId } from "../auth/validateInput.js";
import { slugifyCompanyName } from "./onboardingService.js";
import {
    createCompany,
    getCompany,
    updateCompany,
    getProvisioningLinks,
} from "../tenants/companyService.js";
import { provisionCompany, isCanonicalProvisioningComplete } from "./provisioningService.js";
import { upsertGlobalUserProfile, upsertOwnerMembership } from "../auth/authService.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../inventory/adapters/centralMotorsRtbAdapter.js";
import { DEMO_COMPANY_ID } from "../core/dataMode.js";
import { ensureWhatsAppReadyForSetup } from "./whatsappNumberPoolService.js";

const RESERVED_COMPANY_IDS = new Set([
    CENTRAL_MOTORS_RTB_COMPANY_ID,
    DEMO_COMPANY_ID,
    "demo-econo-funerals",
]);

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateTempPassword() {
    // Firebase requires ≥6 chars; keep human-shareable but strong.
    return `Zr${crypto.randomBytes(9).toString("base64url")}!9`;
}

function assertCompanyIdAllowed(companyId) {
    if (!companyId) throw Object.assign(new Error("companyId is required"), { status: 400 });
    if (!isValidCompanyId(companyId)) {
        throw Object.assign(new Error("Invalid companyId format"), {
            status: 400,
            code: "INVALID_COMPANY_ID",
        });
    }
    if (RESERVED_COMPANY_IDS.has(companyId)) {
        throw Object.assign(new Error(`companyId "${companyId}" is reserved`), {
            status: 400,
            code: "RESERVED_COMPANY_ID",
        });
    }
    if (/^central-motors/i.test(companyId)) {
        throw Object.assign(new Error(`companyId "${companyId}" is not allowed (Central Motors namespace)`), {
            status: 400,
            code: "RESERVED_COMPANY_ID",
        });
    }
}

/**
 * Resolve a unique slug companyId from a display name.
 * @param {string} name
 * @param {string|null} preferredId
 */
export async function resolveOperatorCompanyId(name, preferredId = null) {
    if (preferredId) {
        const id = String(preferredId).trim();
        assertCompanyIdAllowed(id);
        if (await getCompany(id)) {
            throw Object.assign(new Error("Company already exists"), {
                status: 409,
                code: "COMPANY_EXISTS",
                companyId: id,
            });
        }
        return id;
    }

    const base = slugifyCompanyName(name);
    if (!base) {
        throw Object.assign(new Error("Could not derive companyId from name"), { status: 400 });
    }
    let companyId = base;
    let suffix = 0;
    while (await getCompany(companyId)) {
        suffix += 1;
        companyId = `${base}-${suffix}`;
    }
    assertCompanyIdAllowed(companyId);
    return companyId;
}

/**
 * Ensure a real Firebase Auth user exists for the owner email.
 * @returns {{ uid: string, created: boolean, temporaryPassword: string|null, passwordResetLink: string|null }}
 */
export async function ensureOperatorOwnerAuthUser({
    email,
    fullName,
    temporaryPassword = null,
} = {}) {
    if (!hasAdminCredentials()) {
        throw Object.assign(new Error("Firebase Admin credentials are required to create owner accounts"), {
            status: 503,
            code: "NO_ADMIN_CREDENTIALS",
        });
    }
    getAdminFirestore();
    if (!admin.apps.length) {
        throw Object.assign(new Error("Firebase Admin app unavailable"), {
            status: 503,
            code: "ADMIN_APP_UNAVAILABLE",
        });
    }

    const normalized = normalizeEmail(email);
    if (!validateEmail(normalized)) {
        throw Object.assign(new Error("Valid ownerEmail is required"), {
            status: 400,
            code: "INVALID_OWNER_EMAIL",
        });
    }

    const displayName = String(fullName || "Owner").trim() || "Owner";

    try {
        const existing = await admin.auth().getUserByEmail(normalized);
        let passwordResetLink = null;
        try {
            passwordResetLink = await admin.auth().generatePasswordResetLink(normalized);
        } catch {
            /* optional — Auth user still usable if they know password */
        }
        return {
            uid: existing.uid,
            created: false,
            temporaryPassword: null,
            passwordResetLink,
        };
    } catch (err) {
        if (err?.code !== "auth/user-not-found") throw err;
    }

    const password = temporaryPassword || generateTempPassword();
    const created = await admin.auth().createUser({
        email: normalized,
        password,
        displayName,
        emailVerified: false,
    });

    let passwordResetLink = null;
    try {
        passwordResetLink = await admin.auth().generatePasswordResetLink(normalized);
    } catch {
        /* ignore */
    }

    return {
        uid: created.uid,
        created: true,
        temporaryPassword: password,
        passwordResetLink,
    };
}

/**
 * Full Mission Control "New Company" provisioning.
 *
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function provisionOperatorTenant(input = {}) {
    const name = String(input.name || "").trim();
    if (!name) {
        throw Object.assign(new Error("Company name is required"), { status: 400 });
    }

    const ownerEmail = normalizeEmail(input.ownerEmail);
    if (!validateEmail(ownerEmail)) {
        throw Object.assign(new Error("Owner email is required to create a portal login"), {
            status: 400,
            code: "OWNER_EMAIL_REQUIRED",
        });
    }

    const ownerName = String(input.owner || input.ownerName || "Owner").trim() || "Owner";
    const industry = String(input.industry || "").trim();
    const plan = String(input.plan || "business").trim() || "business";
    const status = String(input.status || "active").trim() || "active";
    const tenantClass = String(input.tenantClass || "PRODUCTION CUSTOMER").trim();

    const companyId = await resolveOperatorCompanyId(name, input.companyId || input.id || null);

    const authOwner = await ensureOperatorOwnerAuthUser({
        email: ownerEmail,
        fullName: ownerName,
        temporaryPassword: input.temporaryPassword || null,
    });

    if (!authOwner.uid || String(authOwner.uid).startsWith("owner-")) {
        throw Object.assign(new Error("Refusing synthetic owner UID"), {
            status: 500,
            code: "SYNTHETIC_OWNER_UID",
        });
    }

    const companyPayload = {
        name,
        industry,
        plan,
        status,
        email: input.email || ownerEmail,
        phone: input.phone || input.ownerPhone || "",
        website: input.website || "",
        owner: ownerName,
        ownerEmail,
        ownerPhone: input.ownerPhone || "",
        ownerUid: authOwner.uid,
        ownerId: authOwner.uid,
        settings: {
            ...(input.settings || {}),
            tenantClass,
            productionCustomer: tenantClass === "PRODUCTION CUSTOMER",
            marketplace: { enabled: true },
        },
        billing: input.billing || undefined,
    };

    await createCompany(companyId, companyPayload);

    const provisionResult = await provisionCompany(companyId, {
        ...companyPayload,
        companyId,
        agentName: input.agentName || "Sarah (AI)",
        agentRole: input.agentRole || "sales_consultant",
        agentRoleLabel: input.agentRoleLabel || "Sales Consultant",
        personality: input.personality || "sales_driven",
        ownerUid: authOwner.uid,
        ownerId: authOwner.uid,
    });

    await upsertGlobalUserProfile(authOwner.uid, {
        email: ownerEmail,
        fullName: ownerName,
        name: ownerName,
        role: "owner",
        companyId,
        company: companyId,
    });

    await upsertOwnerMembership(authOwner.uid, companyId, {
        email: ownerEmail,
        fullName: ownerName,
        role: "owner",
        status: "active",
    });

    await updateCompany(companyId, {
        agentId: provisionResult.agentId || provisionResult.links?.agentId || null,
        agentName: provisionResult.agent?.name || "Sarah (AI)",
        knowledgeBaseId: provisionResult.knowledgeBaseId || provisionResult.links?.knowledgeBaseId || `kb-${companyId}`,
        knowledgeBaseName: `${name} KB`,
        ownerUid: authOwner.uid,
        ownerId: authOwner.uid,
        provisioningLinks: provisionResult.links || null,
    });

    /* WhatsApp: Ready for Setup — register pending integration, never auto-assign a pool number. */
    let whatsappSetup = null;
    try {
        const wa = await ensureWhatsAppReadyForSetup(companyId);
        whatsappSetup = {
            status: "ready_for_setup",
            created: Boolean(wa.created),
            message: "WhatsApp Ready for Setup — assign a Ziric test number from the pool when ready",
        };
    } catch (waErr) {
        console.warn("[provisionOperatorTenant] WhatsApp ready-for-setup skipped:", waErr.message);
        whatsappSetup = {
            status: "setup_failed",
            error: waErr.message,
        };
    }

    const company = await getCompany(companyId);
    const provisioning = await getProvisioningLinks(companyId);

    return {
        success: true,
        companyId,
        company,
        owner: {
            uid: authOwner.uid,
            email: ownerEmail,
            fullName: ownerName,
            authCreated: authOwner.created,
            temporaryPassword: authOwner.temporaryPassword,
            passwordResetLink: authOwner.passwordResetLink,
        },
        provision: {
            alreadyProvisioned: Boolean(provisionResult.alreadyProvisioned),
            complete: isCanonicalProvisioningComplete(provisioning),
            agentId: provisionResult.agentId || provisionResult.links?.agentId || null,
            agentName: provisionResult.agent?.name || "Sarah (AI)",
            knowledgeBaseId:
                provisionResult.knowledgeBaseId || provisionResult.links?.knowledgeBaseId || `kb-${companyId}`,
            links: provisionResult.links || provisioning?.links || null,
            resources: provisionResult.provisioned || provisioning?.resources || [],
        },
        whatsapp: whatsappSetup,
    };
}
