/**
 * Conversation-scoped scheduling context — persists date/time across WhatsApp turns.
 */
import {
    customerDocId,
    conversationDocId,
    getOrCreateConversation,
    getTenantConversation,
    conversationsRepo,
} from "../storage/tenantStorage.js";
import {
    parseScheduledInput,
    hasExplicitTimeInString,
    toBusinessDateString,
    isTimeOnlyInput,
} from "../tools/availability.js";
import { matchOfferedSlot } from "./testDrivePlan.js";

/**
 * @typedef {{
 *   pendingDate?: string|null,
 *   pendingTime?: boolean|null,
 *   lastMentionedDate?: string|null,
 *   lastMentionedTime?: string|null,
 *   lastOfferedDate?: string|null,
 *   lastOfferedSlots?: Array<{ slotStart?: string, label?: string }>|null,
 *   resolvedDateLabel?: string|null,
 * }} SchedulingContext
 */

const DAY_REF = /\b(that day|same day|that date|on that day)\b/i;

function isFullDateTimeString(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return true;
    if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(raw)) return true;
    return /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
}

function toLocalDateString(dateObj) {
    return toBusinessDateString(dateObj);
}

/**
 * @param {string} companyId
 * @param {string} phone
 * @param {string} [channel]
 * @returns {Promise<SchedulingContext>}
 */
export async function getSchedulingContext(companyId, phone, channel = "whatsapp") {
    if (!companyId || !phone) return {};
    const conv = await getTenantConversation(companyId, phone, channel);
    if (!conv?.meta?.scheduling) return {};
    return { ...conv.meta.scheduling };
}

/**
 * @param {string} companyId
 * @param {string} phone
 * @param {string} [channel]
 * @param {Partial<SchedulingContext>} updates
 */
export async function saveSchedulingContext(companyId, phone, channel = "whatsapp", updates = {}) {
    if (!companyId || !phone || !updates || !Object.keys(updates).length) return {};
    const conversationId = conversationDocId(customerDocId(phone), channel);
    await getOrCreateConversation(companyId, phone, channel);
    const existing = (await getTenantConversation(companyId, phone, channel)) || {};
    const prior = existing.meta?.scheduling || {};
    const scheduling = { ...prior, ...updates };

    for (const key of Object.keys(scheduling)) {
        if (scheduling[key] === undefined) delete scheduling[key];
    }

    await conversationsRepo.update(companyId, conversationId, {
        meta: { ...(existing.meta || {}), scheduling },
    });
    return scheduling;
}

/**
 * Extract date/time hints from inbound customer text.
 * @param {string} text
 * @param {SchedulingContext} [existing]
 * @returns {Partial<SchedulingContext>}
 */
export function extractSchedulingFromText(text, existing = {}) {
    const raw = String(text || "").trim();
    if (!raw || DAY_REF.test(raw)) return {};

    const contextDate = existing.pendingDate || existing.lastMentionedDate || existing.lastOfferedDate || null;

    const offeredMatch = matchOfferedSlot(raw, existing.lastOfferedSlots || [], contextDate);
    if (offeredMatch?.slotStart) {
        const parsed = parseScheduledInput({ scheduledAt: offeredMatch.slotStart });
        if (parsed.ok && parsed.dateTime) {
            const isoDate = toLocalDateString(parsed.dateTime);
            const h = parsed.dateTime.getHours();
            const m = parsed.dateTime.getMinutes();
            return {
                lastMentionedDate: isoDate,
                pendingDate: isoDate,
                lastOfferedDate: isoDate,
                lastMentionedTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
                pendingTime: null,
            };
        }
    }

    const timeOnly = isTimeOnlyInput(raw);
    let parsed = parseScheduledInput({
        scheduledAt: raw,
        contextDate: timeOnly ? contextDate : undefined,
    });
    if (!parsed.ok) {
        parsed = parseScheduledInput({ date: raw, contextDate });
    }
    if (!parsed.ok) return {};

    /** @type {Partial<SchedulingContext>} */
    const updates = {};
    const dateObj = parsed.dateOnly || parsed.dateTime;

    const hasTime =
        parsed.hasExplicitTime ||
        hasExplicitTimeInString(raw) ||
        Boolean(parsed.dateTime && (parsed.dateTime.getHours() !== 0 || parsed.dateTime.getMinutes() !== 0));

    if (dateObj && !timeOnly) {
        const isoDate = toLocalDateString(dateObj);
        updates.lastMentionedDate = isoDate;
        updates.pendingDate = isoDate;
        updates.lastOfferedDate = isoDate;
    } else if (dateObj && timeOnly && contextDate) {
        const isoDate = toLocalDateString(dateObj);
        updates.lastMentionedDate = isoDate;
        updates.pendingDate = isoDate;
    } else if (dateObj && timeOnly && !contextDate) {
        const isoDate = toLocalDateString(dateObj);
        updates.lastMentionedDate = isoDate;
        updates.pendingDate = isoDate;
    }

    if (hasTime && parsed.dateTime) {
        const h = parsed.dateTime.getHours();
        const m = parsed.dateTime.getMinutes();
        updates.lastMentionedTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        updates.pendingTime = null;
    } else if (updates.pendingDate || contextDate) {
        updates.pendingTime = true;
    }

    return updates;
}

/**
 * Merge persisted scheduling into tool args when date/time omitted.
 * @param {string} toolName
 * @param {object} args
 * @param {SchedulingContext} scheduling
 */
export function enrichToolArgsWithScheduling(toolName, args = {}, scheduling = {}) {
    if (toolName !== "checkTestDriveAvailability" && toolName !== "bookTestDrive") {
        return args;
    }

    const enriched = { ...args };
    const contextDate =
        scheduling.pendingDate || scheduling.lastMentionedDate || scheduling.lastOfferedDate || null;

    const resolvedDate = enriched.date || enriched.scheduledAt || contextDate;

    if (!enriched.date && !enriched.scheduledAt && contextDate) {
        enriched.date = contextDate;
    }

    if (enriched.scheduledAt && contextDate && isTimeOnlyInput(enriched.scheduledAt)) {
        enriched.time = enriched.scheduledAt;
        enriched.date = contextDate;
        delete enriched.scheduledAt;
    } else if (enriched.scheduledAt && isFullDateTimeString(enriched.scheduledAt)) {
        return enriched;
    }

    if (!enriched.time && scheduling.lastMentionedTime && scheduling.pendingTime !== true) {
        enriched.time = scheduling.lastMentionedTime;
    }

    return enriched;
}

/**
 * Derive scheduling meta updates from a completed tool call.
 * @param {string} toolName
 * @param {object} args
 * @param {object} result
 * @returns {Partial<SchedulingContext>}
 */
export function schedulingUpdatesFromToolResult(toolName, args = {}, result = {}) {
    if (toolName !== "checkTestDriveAvailability" && toolName !== "bookTestDrive") {
        return {};
    }

    /** @type {Partial<SchedulingContext>} */
    const updates = {};
    const dateHint = args.date || args.scheduledAt || result.date;
    if (dateHint) {
        const parsed = parseScheduledInput({
            date: String(dateHint),
            scheduledAt: String(dateHint),
            contextDate: result.date || undefined,
        });
        const dateObj = parsed.ok ? parsed.dateOnly || parsed.dateTime : null;
        if (dateObj) {
            const isoDate = toLocalDateString(dateObj);
            updates.lastMentionedDate = isoDate;
            updates.pendingDate = isoDate;
            updates.lastOfferedDate = isoDate;
        }
    }

    if (result.date && /^\d{4}-\d{2}-\d{2}$/.test(String(result.date))) {
        updates.lastOfferedDate = String(result.date);
        updates.pendingDate = updates.pendingDate || String(result.date);
        updates.lastMentionedDate = updates.lastMentionedDate || String(result.date);
    }

    if (result.slotStart) {
        const parsed = parseScheduledInput({ scheduledAt: result.slotStart });
        if (parsed.ok && parsed.dateTime) {
            const isoDate = toLocalDateString(parsed.dateTime);
            updates.lastOfferedDate = isoDate;
            updates.pendingDate = isoDate;
            updates.lastMentionedDate = isoDate;
            updates.lastMentionedTime = `${String(parsed.dateTime.getHours()).padStart(2, "0")}:${String(parsed.dateTime.getMinutes()).padStart(2, "0")}`;
            updates.pendingTime = null;
        }
    }

    const slots = result.suggestedSlots || result.alternatives?.slots;
    if (Array.isArray(slots) && slots.length) {
        updates.lastOfferedSlots = slots.slice(0, 12).map((s) => ({
            slotStart: s.slotStart,
            label: s.label,
        }));
        const first = slots[0];
        if (first?.slotStart) {
            const parsed = parseScheduledInput({ scheduledAt: first.slotStart });
            if (parsed.ok && parsed.dateTime) {
                updates.lastOfferedDate = toLocalDateString(parsed.dateTime);
            }
        }
    }

    if (args.time) {
        updates.lastMentionedTime = String(args.time);
        updates.pendingTime = null;
    }

    if (result.code === "NEED_TIME" || result.needsTime) {
        updates.pendingTime = true;
    } else if (result.available || result.code === "AVAILABLE" || result.code === "AUTO_SELECT") {
        updates.pendingTime = null;
    }

    if (result.slotLabel) {
        updates.resolvedDateLabel = result.slotLabel;
    }

    const resolvedDate =
        updates.pendingDate || updates.lastMentionedDate || updates.lastOfferedDate || result.date;
    if (resolvedDate && /^\d{4}-\d{2}-\d{2}$/.test(String(resolvedDate))) {
        updates.resolvedDateLabel = updates.resolvedDateLabel || String(resolvedDate);
    }

    return updates;
}

/**
 * Human-readable scheduling hint for the system prompt.
 * @param {SchedulingContext} scheduling
 */
export function formatSchedulingContextForPrompt(scheduling = {}) {
    if (!scheduling.pendingDate && !scheduling.lastMentionedDate && !scheduling.lastOfferedDate) return "";

    const parts = ["SCHEDULING CONTEXT (from this conversation — use when calling tools):"];
    const date = scheduling.pendingDate || scheduling.lastMentionedDate || scheduling.lastOfferedDate;
    if (date) {
        parts.push(`- Date established: ${date} (pass as date to checkTestDriveAvailability/bookTestDrive).`);
    }
    if (scheduling.resolvedDateLabel) {
        parts.push(`- Resolved slot label: ${scheduling.resolvedDateLabel}`);
    }
    if (scheduling.pendingTime === true) {
        parts.push("- Time NOT yet chosen — ask the customer for their preferred time; do NOT assume 10 AM or any default.");
    } else if (scheduling.lastMentionedTime) {
        parts.push(`- Time established: ${scheduling.lastMentionedTime}.`);
    }
    if (scheduling.lastOfferedSlots?.length) {
        const labels = scheduling.lastOfferedSlots
            .slice(0, 6)
            .map((s) => s.label)
            .filter(Boolean)
            .join("; ");
        if (labels) {
            parts.push(`- Last offered slots (use these exact times when customer picks one): ${labels}`);
        }
    }
    return parts.join("\n");
}

/**
 * Detect when the customer delegates date/time selection to the agent.
 * @param {string} text
 */
export function isSchedulingDelegationIntent(text) {
    const t = String(text || "").toLowerCase();
    if (/\b(select|choose|pick)\s+(?:(?:the|a)\s+)?(?:time|date|slot)\s+for\s+me\b/i.test(t)) return true;
    if (/\bselect\s+the\s+time\s+and\s+date\s+for\s+me\b/i.test(t)) return true;
    if (/\b(you|just)\s+(?:choose|pick|select)\s+(?:a\s+)?(?:time|date|slot)\b/i.test(t)) return true;
    if (/\bnext\s+available\s+slot\b/i.test(t)) return true;
    if (/\bearliest\s+available\b/i.test(t) && /\b(time|slot|book)\b/i.test(t)) return true;
    if (/\bbook\s+(?:the\s+)?(?:earliest|next|first)\s+available\b/i.test(t)) return true;
    return false;
}

/**
 * Detect test-drive slot availability intent (not inventory stock listing).
 * @param {string} text
 */
export function isTestDriveAvailabilityQuery(text) {
    const t = String(text || "").toLowerCase();
    if (/test[\s-]?drive/.test(t)) return true;
    if (/\bavailable\b/.test(t) && /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/.test(t)) {
        return true;
    }
    if (/\b(which|what)\s+vehicles?\b/.test(t) && /\b(available|test)/.test(t)) return true;
    if (/\bany\b/.test(t) && /\b(on|this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t)) {
        return true;
    }
    if (DAY_REF.test(t)) return true;
    return false;
}

/**
 * Resolve "this Friday" style phrases to YYYY-MM-DD in business TZ.
 * @param {string} text
 * @param {string} [anchorDate] YYYY-MM-DD reference "today" for deterministic resolution
 */
export function resolveRelativeDateLabel(text, anchorDate = null) {
    const parsed = parseScheduledInput({
        date: String(text || "").trim(),
        contextDate: anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? anchorDate : undefined,
    });
    if (!parsed.ok) return null;
    const dateObj = parsed.dateOnly || parsed.dateTime;
    return dateObj ? toLocalDateString(dateObj) : null;
}
