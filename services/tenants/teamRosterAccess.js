/**
 * Team roster field visibility — server-side (HR-AT-005).
 * Email and extended fields follow role; never rely on UI-only hiding.
 */
import { hasPermission, normalizeRole } from "../auth/permissionsService.js";

/** @typedef {'team_admin' | 'hr_manager' | 'hr_viewer' | 'operational' | 'none'} RosterVisibilityLevel */

/**
 * @param {string|null|undefined} role
 * @returns {RosterVisibilityLevel}
 */
export function resolveRosterVisibilityLevel(role) {
    const r = normalizeRole(role);
    if (hasPermission(r, "canManageStaff")) return "team_admin";
    if (hasPermission(r, "canManageHr")) return "hr_manager";
    if (hasPermission(r, "canViewHr")) return "hr_viewer";
    if (
        hasPermission(r, "canViewTasks") ||
        hasPermission(r, "canViewInbox") ||
        hasPermission(r, "canEditAI")
    ) {
        return "operational";
    }
    return "none";
}

/**
 * @param {string|null|undefined} role
 */
export function canAccessHrTeamRoster(role) {
    const level = resolveRosterVisibilityLevel(role);
    return level === "team_admin" || level === "hr_manager" || level === "hr_viewer";
}

/**
 * @param {object|null|undefined} member
 * @param {RosterVisibilityLevel} level
 */
export function formatTeamMemberForVisibility(member, level) {
    if (!member) return null;
    const base = {
        id: member.id || member.uid,
        uid: member.uid || member.id,
        name: member.name,
        role: member.role,
        status: member.status || "active",
        departmentId: member.departmentId ?? null,
        avatar: member.avatar,
    };

    if (level === "none") return null;

    if (level === "operational") {
        return {
            id: base.id,
            uid: base.uid,
            name: base.name,
            role: base.role,
            status: base.status,
            avatar: base.avatar,
        };
    }

    if (level === "hr_viewer") {
        return {
            ...base,
            lastActive: member.lastActive || null,
            emailRedacted: true,
        };
    }

    return {
        ...base,
        email: member.email || "",
        lastActive: member.lastActive || null,
    };
}

/**
 * @param {string|null|undefined} role
 * @param {object[]} members
 */
export function mapTeamRosterForRole(role, members) {
    const level = resolveRosterVisibilityLevel(role);
    if (level === "none") return [];
    return (members || []).map((m) => formatTeamMemberForVisibility(m, level)).filter(Boolean);
}
