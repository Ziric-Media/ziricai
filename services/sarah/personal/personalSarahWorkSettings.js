/**
 * SW-10 — Per-assignment Work settings & notification prefs.
 */
export const DEFAULT_WORK_ASSIGNMENT_SETTINGS = {
    notifyOnStart: true,
    notifyOnMilestone: true,
    notifyOnApproval: true,
    notifyOnComplete: true,
    notifyOnPause: true,
    defaultApprovalLevel: 1,
    sarahTrustOutbound: "require_approval",
};

function clampLevel(n) {
    const x = Number(n);
    if (x >= 3) return 3;
    if (x >= 2) return 2;
    return 1;
}

/**
 * @param {object} session
 * @param {object} [patch]
 */
export function mergeWorkAssignmentSettings(session, patch = {}) {
    const prev =
        session?.workWorkspace?.settings && typeof session.workWorkspace.settings === "object"
            ? session.workWorkspace.settings
            : {};
    return {
        ...DEFAULT_WORK_ASSIGNMENT_SETTINGS,
        ...prev,
        ...(patch && typeof patch === "object" ? patch : {}),
        defaultApprovalLevel: clampLevel(patch?.defaultApprovalLevel ?? prev.defaultApprovalLevel),
    };
}

export function workSettingsNotify(session, key) {
    const s = mergeWorkAssignmentSettings(session);
    return s[key] !== false;
}