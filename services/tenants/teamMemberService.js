/**
 * Owner-provisioned team member accounts (portal login + tenant membership).
 */
import { auditLog } from "../audit/auditLog.js";
import { assertInvitablePortalRole } from "../auth/permissionsService.js";
import { upsertGlobalUserProfile, upsertOwnerMembership, getTenantMembership } from "../auth/authService.js";
import { createPortalAuthUser } from "../auth/portalAuthUserService.js";
import { getCompany } from "./companyService.js";
import { formatTeamMember, listTeamMembers, upsertTenantUser } from "./userService.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findMemberByEmail(companyId, email) {
    const members = await listTeamMembers(companyId, { max: 200 });
    return members.find((m) => normalizeEmail(m.email) === normalizeEmail(email)) || null;
}

/**
 * Create a login + tenant membership for a staff member.
 * @param {string} companyId
 * @param {{ email: string, password: string, fullName: string, role: string }} input
 * @param {{ createdByUid?: string|null }} meta
 */
export async function createTeamMemberProfile(companyId, input = {}, meta = {}) {
    if (!companyId) throw Object.assign(new Error("companyId is required"), { status: 400 });
    const company = await getCompany(companyId);
    if (!company) throw Object.assign(new Error("Workspace not found"), { status: 404 });

    const email = normalizeEmail(input.email);
    const fullName = String(input.fullName || input.name || "").trim();
    const password = String(input.password || "");
    const role = assertInvitablePortalRole(input.role || "viewer");

    if (!validateEmail(email)) {
        throw Object.assign(new Error("Valid member email is required"), { status: 400, code: "INVALID_EMAIL" });
    }
    if (!fullName) {
        throw Object.assign(new Error("Member name is required"), { status: 400, code: "MISSING_NAME" });
    }
    if (password.length < 6) {
        throw Object.assign(new Error("Password must be at least 6 characters"), {
            status: 400,
            code: "WEAK_PASSWORD",
        });
    }

    const duplicate = await findMemberByEmail(companyId, email);
    if (duplicate && duplicate.status !== "removed") {
        throw Object.assign(new Error("This email is already on the team roster"), {
            status: 409,
            code: "TEAM_EMAIL_EXISTS",
        });
    }

    const adapter = await getStorageAdapter();
    let uid;
    let authCreated = false;

    if (adapter.name === "memory") {
        uid = `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    } else {
        const auth = await createPortalAuthUser({ email, password, fullName });
        uid = auth.uid;
        authCreated = auth.created;
    }

    const existingMembership = await getTenantMembership(uid, companyId);
    if (existingMembership && existingMembership.status !== "removed") {
        throw Object.assign(new Error("This member is already active in the workspace"), { status: 409 });
    }

    await upsertGlobalUserProfile(uid, {
        email,
        fullName,
        name: fullName,
        role,
        companyId,
        company: companyId,
        status: "active",
    });

    await upsertOwnerMembership(uid, companyId, {
        email,
        fullName,
        name: fullName,
        role,
        status: "active",
        createdByUid: meta.createdByUid || null,
    });

    await upsertTenantUser(companyId, uid, {
        email,
        fullName,
        name: fullName,
        role,
        status: "active",
        createdByUid: meta.createdByUid || null,
    });

    auditLog("team_member_created", {
        companyId,
        uid,
        email,
        role,
        createdByUid: meta.createdByUid || null,
        authCreated,
        storage: adapter.name,
    });

    return {
        member: formatTeamMember({
            uid,
            companyId,
            email,
            fullName,
            role,
            status: "active",
        }),
        authCreated,
        loginReady: true,
    };
}
