/**
 * Industry preset validation — structure, capability catalogue, permissions, forbidden tool grants.
 */
import { PERMISSION_MATRIX } from "../auth/permissionsService.js";
import { FINANCE_PERMISSION_KEYS } from "../auth/financePermissionPolicy.js";
import { TASK_PERMISSION_KEYS } from "../auth/taskPermissionPolicy.js";
import { getPlatformCapability, listPlatformCapabilityIds } from "./industryPresetCapabilities.js";
import { listInstructionBlockIds } from "./industryPresetRegistry.js";

const PRESET_STATUSES = new Set(["draft", "validated", "approved", "deprecated", "retired"]);
const SARAH_MODULES = ["finance", "operations", "hr", "admin"];
const WORKFLOW_ACTION_TYPES = new Set([
    "send_notification",
    "notify",
    "send_message",
    "assign_agent",
    "create_task",
    "update_crm",
    "webhook",
]);

const FORBIDDEN_KEY_PATTERN =
    /^(toolAllowlist|allowedTools|executableTools|grantTools|dynamicTools)$/i;

const PERMISSION_KEYS = new Set([
    ...Object.keys(PERMISSION_MATRIX),
    ...FINANCE_PERMISSION_KEYS,
    ...TASK_PERMISSION_KEYS,
]);

function pushError(errors, rule, path, message) {
    errors.push({ rule, path, message, severity: "error" });
}

function scanForbiddenToolKeys(value, path, errors) {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach((item, i) => scanForbiddenToolKeys(item, `${path}[${i}]`, errors));
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        if (FORBIDDEN_KEY_PATTERN.test(key)) {
            pushError(
                errors,
                "FORBIDDEN_TOOL_GRANT_FIELD",
                childPath,
                `Preset must not declare executable tool allowlists (${key}).`
            );
        }
        scanForbiddenToolKeys(child, childPath, errors);
    }
}

function validateStructure(preset, errors) {
    const required = [
        "presetId",
        "name",
        "version",
        "schemaVersion",
        "description",
        "industry",
        "jurisdictions",
        "status",
        "owner",
        "lastReviewedAt",
        "sarahMapping",
    ];
    for (const field of required) {
        if (preset[field] === undefined || preset[field] === null || preset[field] === "") {
            pushError(errors, "REQUIRED_FIELD", field, `Missing required field "${field}".`);
        }
    }
    if (preset.status && !PRESET_STATUSES.has(preset.status)) {
        pushError(errors, "INVALID_STATUS", "status", `Unknown status "${preset.status}".`);
    }
    if (!Array.isArray(preset.jurisdictions) || !preset.jurisdictions.length) {
        pushError(errors, "INVALID_JURISDICTIONS", "jurisdictions", "At least one jurisdiction is required.");
    }
    const mapping = preset.sarahMapping;
    if (mapping && typeof mapping === "object") {
        for (const mod of SARAH_MODULES) {
            if (!mapping[mod]) {
                pushError(errors, "MISSING_SARAH_MAPPING", `sarahMapping.${mod}`, `Missing ${mod} mapping.`);
                continue;
            }
            const entry = mapping[mod];
            if (!entry.purpose) {
                pushError(errors, "REQUIRED_FIELD", `sarahMapping.${mod}.purpose`, "Purpose is required.");
            }
            if (!Array.isArray(entry.capabilities)) {
                pushError(
                    errors,
                    "INVALID_CAPABILITIES",
                    `sarahMapping.${mod}.capabilities`,
                    "capabilities must be an array."
                );
            }
            if (!Array.isArray(entry.instructionBlockIds)) {
                pushError(
                    errors,
                    "INVALID_INSTRUCTION_BLOCKS",
                    `sarahMapping.${mod}.instructionBlockIds`,
                    "instructionBlockIds must be an array."
                );
            }
        }
    }
}

function validateCapabilities(preset, errors) {
    const knownIds = new Set(listPlatformCapabilityIds());
    for (const mod of SARAH_MODULES) {
        const caps = preset.sarahMapping?.[mod]?.capabilities || [];
        for (const capId of caps) {
            if (!knownIds.has(capId)) {
                pushError(
                    errors,
                    "UNKNOWN_CAPABILITY",
                    `sarahMapping.${mod}.capabilities`,
                    `Unknown capability id "${capId}".`
                );
            }
        }
    }
    for (const mod of preset.modules || []) {
        for (const capId of [...(mod.requiredCapabilities || []), ...(mod.optionalCapabilities || [])]) {
            if (!knownIds.has(capId)) {
                pushError(errors, "UNKNOWN_CAPABILITY", `modules.${mod.moduleId}`, `Unknown capability "${capId}".`);
            }
        }
    }
}

function validateRoles(preset, errors) {
    for (const role of preset.roles || []) {
        for (const perm of role.permissions || []) {
            if (!PERMISSION_KEYS.has(perm)) {
                pushError(
                    errors,
                    "UNKNOWN_PERMISSION",
                    `roles.${role.roleId}.permissions`,
                    `Unknown permission key "${perm}".`
                );
            }
        }
    }
}

function validateWorkflows(preset, errors) {
    for (const wf of preset.workflows || []) {
        for (const step of wf.steps || []) {
            const actionType = step.actionType || step.type;
            if (actionType && !WORKFLOW_ACTION_TYPES.has(actionType)) {
                pushError(
                    errors,
                    "UNSUPPORTED_WORKFLOW_ACTION",
                    `workflows.${wf.workflowId || wf.id}`,
                    `Unsupported action type "${actionType}".`
                );
            }
        }
    }
}

function validateInstructionBlocks(preset, errors) {
    const available = new Set(listInstructionBlockIds());
    for (const mod of SARAH_MODULES) {
        for (const blockId of preset.sarahMapping?.[mod]?.instructionBlockIds || []) {
            if (!available.has(blockId)) {
                pushError(
                    errors,
                    "MISSING_INSTRUCTION_BLOCK",
                    `sarahMapping.${mod}.instructionBlockIds`,
                    `Instruction block "${blockId}" not found in registry.`
                );
            }
        }
    }
}

/**
 * @param {object} preset
 * @param {{ activation?: boolean }} [options] — activation requires approved status
 * @returns {{ valid: boolean, errors: object[], checks: object[] }}
 */
export function validateIndustryPreset(preset, options = {}) {
    const errors = [];
    const checks = [];

    if (!preset || typeof preset !== "object") {
        pushError(errors, "INVALID_DOCUMENT", "$", "Preset must be a JSON object.");
        return { valid: false, errors, checks };
    }

    scanForbiddenToolKeys(preset, "", errors);
    validateStructure(preset, errors);
    validateCapabilities(preset, errors);
    validateRoles(preset, errors);
    validateWorkflows(preset, errors);
    validateInstructionBlocks(preset, errors);

    if (options.activation && preset.status !== "approved") {
        pushError(
            errors,
            "ACTIVATION_STATUS",
            "status",
            `Production activation requires status "approved" (current: "${preset.status}").`
        );
    }

    checks.push({ key: "structure", ok: !errors.some((e) => e.rule.startsWith("REQUIRED") || e.rule === "MISSING_SARAH_MAPPING") });
    checks.push({ key: "capabilities", ok: !errors.some((e) => e.rule === "UNKNOWN_CAPABILITY") });
    checks.push({ key: "permissions", ok: !errors.some((e) => e.rule === "UNKNOWN_PERMISSION") });
    checks.push({ key: "forbiddenToolKeys", ok: !errors.some((e) => e.rule === "FORBIDDEN_TOOL_GRANT_FIELD") });

    return { valid: errors.length === 0, errors, checks };
}

/**
 * Summarise capability classes for runtime honesty copy.
 * @param {string[]} capabilityIds
 */
export function summariseCapabilityGaps(capabilityIds = []) {
    const lines = [];
    for (const id of capabilityIds) {
        const cap = getPlatformCapability(id);
        if (!cap) continue;
        if (cap.class === "extension-required" || cap.class === "unavailable") {
            lines.push(`${id}: ${cap.label || id} — ${cap.class.replace(/-/g, " ")}.`);
        } else if (cap.class === "integration-dependent") {
            lines.push(`${id}: ${cap.label || id} — requires verified integration.`);
        }
    }
    return lines;
}
