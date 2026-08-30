/**
 * Maps Sarah sales funnel stages (salesContext.leadStage) to CRM pipeline stages.
 * CRM vocabulary: new | contacted | qualified | proposal | won | lost
 */
import { LEAD_STAGES } from "../conversation/salesContext.js";

export const CRM_PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];

const SARAH_TO_CRM_STAGE = {
    NEW: "new",
    DISCOVERY: "contacted",
    VEHICLES_RECOMMENDED: "contacted",
    VEHICLE_INTEREST: "qualified",
    VEHICLE_SELECTED: "qualified",
    TEST_DRIVE_REQUESTED: "qualified",
    TEST_DRIVE_BOOKED: "proposal",
    TEST_DRIVE_COMPLETED: "proposal",
    FINANCE_INTEREST: "proposal",
    FINANCE_QUOTE: "proposal",
    PURCHASE_INTENT: "proposal",
    HUMAN_HANDOFF: "qualified",
};

const CRM_STAGE_RANK = Object.fromEntries(CRM_PIPELINE_STAGES.map((stage, index) => [stage, index]));

/**
 * @param {string|null|undefined} sarahStage
 * @returns {string|null}
 */
export function mapSarahStageToCrmStage(sarahStage) {
    if (!sarahStage) return null;
    const normalized = String(sarahStage).trim().toUpperCase();
    if (SARAH_TO_CRM_STAGE[normalized]) return SARAH_TO_CRM_STAGE[normalized];
    if (CRM_PIPELINE_STAGES.includes(String(sarahStage).toLowerCase())) {
        return String(sarahStage).toLowerCase();
    }
    return null;
}

/**
 * Advance CRM stage monotonically — never downgrade except to lost.
 * @param {string|null|undefined} currentStage
 * @param {string|null|undefined} proposedStage
 * @returns {string}
 */
export function advanceCrmStage(currentStage, proposedStage) {
    const current = CRM_PIPELINE_STAGES.includes(String(currentStage || "").toLowerCase())
        ? String(currentStage).toLowerCase()
        : "new";
    const proposed = CRM_PIPELINE_STAGES.includes(String(proposedStage || "").toLowerCase())
        ? String(proposedStage).toLowerCase()
        : current;

    if (proposed === "lost") return "lost";
    if (current === "lost") return "lost";
    if (current === "won") return "won";

    const currentRank = CRM_STAGE_RANK[current] ?? 0;
    const proposedRank = CRM_STAGE_RANK[proposed] ?? 0;
    return proposedRank > currentRank ? proposed : current;
}

/**
 * Derive a lead score from Sarah stage when pipeline score is unavailable.
 * @param {string|null|undefined} sarahStage
 * @returns {number}
 */
export function leadScoreFromSarahStage(sarahStage) {
    const stage = String(sarahStage || "").toUpperCase();
    const index = LEAD_STAGES.indexOf(stage);
    if (index < 0) return 50;
    return Math.min(95, 40 + index * 5);
}

/**
 * Human-readable label for Sarah stage timeline events.
 * @param {string} sarahStage
 * @returns {string}
 */
export function formatSarahStageLabel(sarahStage) {
    return String(sarahStage || "")
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export { SARAH_TO_CRM_STAGE };
