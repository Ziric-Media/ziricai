/**
 * PI-4F-6 — Dedupe / cooldown for proactive findings (same support lifecycle, no alert spam).
 */
import { listSupportCasesPage } from "../../tenants/supportCaseService.js";
import { normalizeLifecycleStatus } from "../supportCaseModel.js";
import { getRuleCooldownMs } from "./proactiveDetectionConfig.js";

const OPEN_LIKE = new Set(["open", "investigating", "assigned", "waiting", "escalated", "human_action"]);

/**
 * @param {string} companyId
 * @param {{ ruleId: string, signature: string }} finding
 */
export async function shouldSuppressProactiveFinding(companyId, finding) {
    const page = await listSupportCasesPage(companyId, { limit: 40 });
    const cooldownMs = getRuleCooldownMs(finding.ruleId);
    const now = Date.now();

    for (const c of page.items) {
        const pd = c.diagnosis?.proactiveDetection;
        const signature = pd?.signature || null;
        if (signature !== finding.signature) continue;

        const lifecycle = normalizeLifecycleStatus(c.status);
        if (OPEN_LIKE.has(lifecycle)) {
            return { suppress: true, reason: "duplicate_open", caseId: c.id };
        }

        const detectedAt = pd?.detectedAt || c.updatedAt || c.createdAt;
        if (detectedAt) {
            const age = now - new Date(detectedAt).getTime();
            if (Number.isFinite(age) && age < cooldownMs) {
                return { suppress: true, reason: "cooldown", caseId: c.id };
            }
        }
    }

    return { suppress: false };
}
