/**
 * Sarah BOS — workforce instructions (Admin → Sales / Finance / Ops / HR).
 */

export const WORKFORCE_MODULES = {
    SALES: "sales",
    FINANCE: "finance",
    OPERATIONS: "operations",
    HR: "hr",
};

export const MODULE_LABELS = {
    [WORKFORCE_MODULES.SALES]: "Sales",
    [WORKFORCE_MODULES.FINANCE]: "Finance",
    [WORKFORCE_MODULES.OPERATIONS]: "Operations",
    [WORKFORCE_MODULES.HR]: "HR",
};

export const INSTRUCTION_STATUS = {
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
};

export const INSTRUCTION_SOURCE = {
    ADMIN_SARAH: "admin_sarah",
    HUMAN: "human",
    MODULE_SARAH: "module_sarah",
};

export function normalizeTargetModule(raw) {
    const m = String(raw || "")
        .trim()
        .toLowerCase();
    if (m === "ops" || m === "operation") return WORKFORCE_MODULES.OPERATIONS;
    if (Object.values(WORKFORCE_MODULES).includes(m)) return m;
    return null;
}

export function portalPageForModule(module) {
    const map = {
        sales: "conversations",
        finance: "finance",
        operations: "operations",
        hr: "hr",
    };
    return map[module] || "dashboard";
}
