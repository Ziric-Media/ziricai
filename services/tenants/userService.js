/**
 * Tenant user membership service.
 * Subcollection: companies/{companyId}/users/{uid}
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

class UserService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.USERS);
    }

    async getByUid(companyId, uid) {
        return this.get(companyId, uid);
    }

    async listActive(companyId, max = 100) {
        return this.list(companyId, { max, filters: { status: "active" } });
    }

    async upsertMember(companyId, uid, data) {
        return this.upsert(companyId, uid, {
            uid,
            status: "active",
            ...data,
        });
    }
}

const userService = new UserService();

function formatTeamMember(record) {
    if (!record) return null;
    const name = record.fullName || record.name || record.email || "Member";
    return {
        id: record.uid || record.id,
        uid: record.uid || record.id,
        companyId: record.companyId,
        name,
        email: record.email || "",
        role: record.role || "agent",
        departmentId: record.departmentId || null,
        status: record.status || "active",
        lastActive: record.lastLogin || record.lastActive || record.updatedAt || null,
        avatar: record.avatar || name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    };
}

export async function getTenantUser(companyId, uid) {
    return userService.getByUid(companyId, uid);
}

export async function listTenantUsers(companyId, options = {}) {
    return userService.list(companyId, options);
}

export async function listTeamMembers(companyId, options = {}) {
    const records = await userService.list(companyId, { max: options.max || 100, ...options });
    return records.map(formatTeamMember).filter(Boolean);
}

export async function upsertTenantUser(companyId, uid, data) {
    return userService.upsertMember(companyId, uid, data);
}

export async function removeTenantUser(companyId, uid) {
    return userService.update(companyId, uid, { status: "removed" });
}

export async function updateTeamMemberRole(companyId, uid, role, extras = {}) {
    const existing = await getTenantUser(companyId, uid);
    if (!existing) throw new Error("Team member not found");
    const updated = await userService.update(companyId, uid, { role, ...extras });
    return formatTeamMember(updated);
}

/** Stub invite — records pending member until email delivery is wired. */
export async function inviteTeamMember(companyId, { email, role = "agent", departmentId = null, invitedBy = null }) {
    if (!email?.trim()) throw new Error("email is required");

    const stubUid = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = await userService.upsertMember(companyId, stubUid, {
        email: email.trim().toLowerCase(),
        role,
        departmentId,
        status: "invited",
        invitedBy,
        invitedAt: new Date().toISOString(),
    });

    return {
        ...formatTeamMember(record),
        inviteToken: stubUid,
        simulated: true,
        message: "Invite recorded — email delivery pending integration",
    };
}

export { formatTeamMember };
