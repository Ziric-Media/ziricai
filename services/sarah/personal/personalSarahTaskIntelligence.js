/**
 * ST-04 — rule-based task intelligence (checklists, timelines, suggestions).
 * v1: no LLM; templates keyed by category + taskType. Optional upgrade path in ST-05.
 */

const TYPE_CHECKLISTS = {
    interview: [
        "Research the organisation",
        "Review the job description",
        "Prepare answers to likely questions",
        "Gather CV and certificates",
        "Confirm interview time and link",
        "Plan transport and outfit",
    ],
    trip: ["Bookings confirmed", "Pack essentials", "Travel documents", "Notify bank if abroad", "Check-in online"],
    business_trip: ["Flights and lodging", "Meeting materials", "Expense policy", "Itinerary shared"],
    exam: ["Review syllabus", "Practice past papers", "Gather permitted materials", "Confirm venue and time"],
    job: ["Update CV", "Tailor cover letter", "Gather references", "Track submission deadline"],
    university: ["Transcripts ready", "Personal statement draft", "Application fee", "Submit before deadline"],
    bursary: ["Proof of registration", "Supporting motivation", "Income documents", "Submit before close"],
    funding: ["Eligibility criteria met", "Budget breakdown", "Supporting letters"],
    loan: ["Proof of income", "Bank statements", "ID documents"],
    accommodation: ["Application form", "Deposit plan", "References"],
    government: ["Confirm official portal", "Gather ID and forms", "Book appointment if needed", "Fees or photos ready"],
    meeting: ["Agenda ready", "Documents to share", "Travel time allowed", "Join link tested"],
    medical: ["Medical aid card", "Previous reports", "List of symptoms", "Arrive 10 min early"],
    departure: ["Keys and wallet", "Phone charged", "Doors secured"],
    research: ["Define the question", "List trusted sources", "Note decision criteria"],
    draft_application: ["Gather requirements", "Draft for your review", "You approve before submit"],
};

const TYPE_SUGGESTIONS = {
    interview: [
        "Ask Sarah to run a mock interview in this workspace.",
        "Pin the job posting link in your next message.",
    ],
    government: [
        "Confirm the latest official requirements before you approve any submission.",
        "Upload reference numbers here if you receive them.",
    ],
    job: ["Share the job link so Sarah can align your CV bullets."],
    trip: ["Tell Sarah your departure date to tighten the packing timeline."],
    meeting: ["Add attendees in chat if Sarah should draft an agenda."],
    delegate: ["Be explicit about what Sarah may do without asking again."],
    research: ["List must-have vs nice-to-have in your first message."],
    compare_products: ["After the draft appears, use Approve submit only when you're ready."],
    draft_application: ['Say "approve submit" in chat when the draft is final — Sarah will not file automatically.'],
    find_booking: ["Sarah proposes options only — you confirm the booking yourself in v1."],
};

const CATEGORY_SUGGESTIONS = {
    applications: ["Open Details to see Sarah Network matches for the organisation."],
    preparation: ["Work through the checklist on the Progress tab — Sarah tracks completion."],
    reminders: ["Reply in the workspace to reschedule or add what to bring."],
    delegate: ["Sarah will propose a plan before any external action."],
};

/**
 * @param {string|null|undefined} dueAt ISO
 * @param {{ label: string, daysBefore?: number, hoursBefore?: number, atDue?: boolean }[]} steps
 */
export function buildTimelineFromDue(dueAt, steps) {
    const dueMs = dueAt ? Date.parse(dueAt) : NaN;
    const hasDue = Number.isFinite(dueMs);
    const out = [];
    for (const step of steps) {
        let at = null;
        if (step.atDue && hasDue) at = new Date(dueMs).toISOString();
        else if (hasDue && step.daysBefore != null) {
            at = new Date(dueMs - step.daysBefore * 86400000).toISOString();
        } else if (hasDue && step.hoursBefore != null) {
            at = new Date(dueMs - step.hoursBefore * 3600000).toISOString();
        }
        out.push({
            at,
            label: step.label,
            kind: step.atDue ? "due" : "milestone",
        });
    }
    return out;
}

function timelineForTask(task) {
    const type = String(task.taskType || "").toLowerCase();
    const dueAt = task.dueAt || null;
    if (type === "interview" || type === "exam") {
        return buildTimelineFromDue(dueAt, [
            { label: "Start researching and prep", daysBefore: 7 },
            { label: "Practice / mock session", daysBefore: 2 },
            { label: "Documents and outfit ready", daysBefore: 1 },
            { label: task.title || "Event day", atDue: true },
        ]);
    }
    if (type === "trip" || type === "business_trip") {
        return buildTimelineFromDue(dueAt, [
            { label: "Confirm bookings", daysBefore: 14 },
            { label: "Start packing list", daysBefore: 3 },
            { label: "Departure", atDue: true },
        ]);
    }
    if (task.categoryId === "applications" || type === "government") {
        return buildTimelineFromDue(dueAt, [
            { label: "Gather documents", daysBefore: 14 },
            { label: "Draft and review", daysBefore: 7 },
            { label: "Submit or attend appointment", atDue: true },
        ]);
    }
    if (type === "meeting" || task.categoryId === "reminders") {
        const travelM = Number(task.meta?.travelMinutes || task.meta?.travelTime || 0);
        const steps = [{ label: "Reminder / meeting time", atDue: true }];
        if (dueAt && travelM > 0) {
            return buildTimelineFromDue(dueAt, [
                { label: `Leave (travel ~${travelM} min)`, hoursBefore: Math.ceil(travelM / 60) || 1 },
                ...steps,
            ]);
        }
        return buildTimelineFromDue(dueAt, [{ label: "Prepare what to bring", hoursBefore: 24 }, ...steps]);
    }
    if (dueAt) {
        return buildTimelineFromDue(dueAt, [
            { label: "Start working on this", daysBefore: 3 },
            { label: task.title || "Due", atDue: true },
        ]);
    }
    return [{ at: null, label: "Set a due date to unlock a timeline", kind: "hint" }];
}

function suggestionsForTask(task, personalisation = null) {
    const type = String(task.taskType || "").toLowerCase();
    const cat = String(task.categoryId || "").toLowerCase();
    const out = [];
    const prior = personalisation?.learning?.counts?.[task.taskType || type];
    if (prior && prior >= 2) {
        out.push(`You've completed similar tasks ${prior} times — your saved patterns are applied.`);
    }
    if (TYPE_SUGGESTIONS[type]) out.push(...TYPE_SUGGESTIONS[type]);
    if (CATEGORY_SUGGESTIONS[cat]) out.push(...CATEGORY_SUGGESTIONS[cat]);
    if (task.lifecycleState === "awaiting_approval") {
        out.unshift("Review Sarah's plan on the Progress tab, then tap Go ahead when ready.");
    }
    if (Array.isArray(task.meta?.assistGoals) && task.meta.assistGoals.length) {
        out.push(`Focus areas you chose: ${task.meta.assistGoals.join(", ")}.`);
    }
    const uniq = [];
    const seen = new Set();
    for (const s of out) {
        const k = String(s).trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        uniq.push(k);
    }
    return uniq.slice(0, 6);
}

function checklistForTask(task) {
    const type = String(task.taskType || "").toLowerCase();
    if (TYPE_CHECKLISTS[type]) return TYPE_CHECKLISTS[type].map((label) => ({ label, done: false }));
    if (task.categoryId === "preparation" && Array.isArray(task.checklist) && task.checklist.length) {
        return task.checklist;
    }
    if (task.categoryId === "applications") {
        return ["Confirm requirements", "Collect documents", "Review draft", "Submit when approved"].map((label) => ({
            label,
            done: false,
        }));
    }
    return [];
}

/**
 * @param {object} task
 */
export function generateTaskIntelligence(task, personalisation = null) {
    const checklist = checklistForTask(task);
    const timeline = timelineForTask(task);
    const suggestions = suggestionsForTask(task, personalisation);
    return {
        checklist,
        timeline,
        suggestions,
        generatedAt: new Date().toISOString(),
        version: 1,
    };
}

export function mergeTaskChecklists(existing, generated) {
    const base = Array.isArray(existing) ? existing : [];
    const labels = new Set(base.map((c) => String(c?.label || "").toLowerCase()).filter(Boolean));
    const merged = [...base];
    for (const item of generated || []) {
        const label = String(item?.label || item || "").trim();
        if (!label) continue;
        const key = label.toLowerCase();
        if (labels.has(key)) continue;
        labels.add(key);
        merged.push(typeof item === "object" ? { label, done: Boolean(item.done) } : { label, done: false });
    }
    return merged;
}

/**
 * @param {string} uid
 * @param {object} task must have id
 */
export async function applyTaskIntelligence(uid, task) {
    const { updatePersonalSarahTask } = await import("./personalSarahTaskStore.js");
    let personalisation = null;
    try {
        const { getTaskPersonalisation } = await import("./personalSarahTaskPersonalisation.js");
        personalisation = await getTaskPersonalisation(uid);
        const tpl = (personalisation.templates || []).find((t) => t.taskType === task.taskType);
        if (tpl?.checklist?.length && !(task.checklist?.length)) {
            task = { ...task, checklist: tpl.checklist.map((c) => ({ ...c, done: false })) };
        }
    } catch {
        /* ignore */
    }
    const intel = generateTaskIntelligence(task, personalisation);
    const checklist = mergeTaskChecklists(task.checklist, intel.checklist);
    const done = checklist.filter((c) => c.done).length;
    const progress = checklist.length ? Math.round((100 * done) / checklist.length) : task.progress || 0;
    return updatePersonalSarahTask(uid, task.id, {
        checklist,
        progress,
        timeline: intel.timeline,
        suggestions: intel.suggestions,
        meta: {
            ...(task.meta || {}),
            intelligenceVersion: intel.version,
            intelligenceGeneratedAt: intel.generatedAt,
        },
    });
}