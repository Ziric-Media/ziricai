/**
 * SNA-01F / SW-06 — Sarah Work runner: multi-step execution with milestone transitions.
 */
import OpenAI from "openai";
import { bootstrapEnv } from "../../env/startupEnv.js";
import { persistPersonalSarahSession } from "./personalSarahSessionStore.js";
import { createSarahWorkCompletionNotification } from "../../network/notificationService.js";
import { wouldExceedWorkCap } from "./personalSarahWorkBudget.js";
import {
    syncWorkWorkspace,
    initExecutionMilestones,
    beginMilestone,
    completeMilestone,
    blockActiveMilestone,
    appendWorkActivity,
} from "./personalSarahWorkWorkspace.js";
import { hasBlockingLevel3Approval } from "./personalSarahWorkApprovals.js";
import { assertWorkTrustForOutbound } from "./personalSarahWorkTrust.js";
import { notifyWorkMilestoneIfMeaningful, notifyWorkPaused } from "./personalSarahWorkNotifications.js";
import { assertConsumerSarahCreditsForRequest } from "../../revenue/consumerSarahCreditMeter.js";
import { estimateSarahCredits } from "../../revenue/sarahCreditEstimator.js";

bootstrapEnv();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function taskTitleFromSession(session) {
    const t = String(session.title || "").trim();
    if (t && !["My Sarah", "New work item"].includes(t)) return t;
    const lastUser = [...(session.messages || [])].reverse().find((m) => m.role === "user");
    const text = String(lastUser?.content || "").trim();
    if (!text) return "Work task";
    return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

function briefFromSession(session) {
    return (session.messages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => `${m.role === "user" ? "User" : "Sarah"}: ${String(m.content || "").trim()}`)
        .join("\n");
}

function workBudgetSnapshot(session) {
    return {
        band: session.workBudgetBand || null,
        capCredits: Number(session.workBudgetCapCredits) || 0,
        estimateMin: Number(session.workBudgetEstimateMin) || 0,
        estimateMax: Number(session.workBudgetEstimateMax) || 0,
        usedCredits: Number(session.workCreditsUsedCredits) || 0,
    };
}

function templateMetering() {
    return { archetype: "WORK-STEP", inputTokens: 0, outputTokens: 0, model: "template" };
}

async function gateStepCredits(session) {
    const creditGate = await assertConsumerSarahCreditsForRequest(session.userId, {
        archetype: "WORK-STEP",
        surface: "work",
    });
    if (!creditGate.allowed) {
        return { allowed: false, reason: "credits" };
    }
    const preStep = estimateSarahCredits({ archetype: "WORK-STEP" });
    if (wouldExceedWorkCap(session, preStep.credits)) {
        return { allowed: false, reason: "cap" };
    }
    return { allowed: true, preStep };
}

function applyStepCredits(session, metering) {
    const stepCost = estimateSarahCredits(metering || { archetype: "WORK-STEP" });
    session.workCreditsUsedCredits = (Number(session.workCreditsUsedCredits) || 0) + stepCost.credits;
    return { credits: stepCost.credits, metering: metering || { archetype: "WORK-STEP" } };
}

function runReviewStep(session, ctx) {
    const brief = briefFromSession(session);
    const userMsgs = (session.messages || []).filter((m) => m.role === "user").length;
    ctx.reviewSummary = brief
        ? `Brief captured (${brief.length} chars, ${userMsgs} user message${userMsgs === 1 ? "" : "s"}).`
        : "Brief is minimal — task title only.";
    return { metering: templateMetering(), artifact: ctx.reviewSummary };
}

async function runResearchStep(session, ctx) {
    const taskTitle = taskTitleFromSession(session);
    const brief = briefFromSession(session);
    if (!openai) {
        ctx.researchSummary =
            `Research notes (template): key themes from your brief on «${taskTitle}». ` +
            "Connect OPENAI_API_KEY for live research.";
        return { metering: templateMetering(), artifact: ctx.researchSummary };
    }
    const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await openai.chat.completions.create({
        model: modelId,
        max_tokens: 450,
        messages: [
            {
                role: "system",
                content:
                    "Summarise research angles for a consumer work assignment. Return JSON: " +
                    '{ "summary": string (max 600 chars), "bullets": string[] (3-5 items) }',
            },
            { role: "user", content: `Task: ${taskTitle}\n\nContext:\n${brief || "(none)"}` },
        ],
        response_format: { type: "json_object" },
    });
    let parsed = {};
    try {
        parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
    } catch {
        parsed = {};
    }
    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 6) : [];
    const summary = String(parsed.summary || "").slice(0, 800);
    ctx.researchSummary = summary + (bullets.length ? `\n\n• ${bullets.join("\n• ")}` : "");
    const usage = res.usage;
    return {
        metering: {
            inputTokens: Number(usage?.prompt_tokens) || 0,
            outputTokens: Number(usage?.completion_tokens) || 0,
            model: modelId,
            archetype: "WORK-STEP",
        },
        artifact: ctx.researchSummary,
    };
}

async function runDraftStep(session, ctx) {
    const taskTitle = taskTitleFromSession(session);
    const brief = briefFromSession(session);
    if (!openai) {
        const sections = [
            { heading: "Task", body: taskTitle },
            { heading: "Brief review", body: ctx.reviewSummary || brief },
            { heading: "Research", body: ctx.researchSummary || "—" },
            {
                heading: "Draft outcome",
                body: "Template draft — connect OPENAI_API_KEY for full delegated drafting.",
            },
        ];
        const markdown = sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
        ctx.draft = { taskTitle, summary: `Draft for: ${taskTitle}`, sections, markdown, mode: "template" };
        return { metering: templateMetering(), artifact: ctx.draft };
    }
    const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await openai.chat.completions.create({
        model: modelId,
        max_tokens: 900,
        messages: [
            {
                role: "system",
                content:
                    "You are Sarah completing a delegated work task. Return JSON: " +
                    '{ "summary": string, "sections": [ { "heading": string, "body": string } ], "markdown": string }',
            },
            {
                role: "user",
                content:
                    `Task: ${taskTitle}\n\nConversation:\n${brief}\n\nResearch:\n${ctx.researchSummary || "—"}`,
            },
        ],
        response_format: { type: "json_object" },
    });
    let parsed = {};
    try {
        parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
    } catch {
        parsed = {};
    }
    const summary = String(parsed.summary || `Draft: ${taskTitle}`).slice(0, 500);
    const sections = Array.isArray(parsed.sections) ? parsed.sections.slice(0, 8) : [];
    const markdown =
        String(parsed.markdown || "").trim() ||
        sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
    ctx.draft = {
        taskTitle,
        summary,
        sections,
        markdown: markdown.slice(0, 12_000),
        mode: "openai",
    };
    const usage = res.usage;
    return {
        metering: {
            inputTokens: Number(usage?.prompt_tokens) || 0,
            outputTokens: Number(usage?.completion_tokens) || 0,
            model: modelId,
            archetype: "WORK-STEP",
        },
        artifact: ctx.draft,
    };
}

async function runQualityStep(session, ctx) {
    const draft = ctx.draft;
    if (!draft?.markdown) {
        ctx.finalReport = draft || { markdown: "## Empty draft", summary: "No draft produced." };
        return { metering: templateMetering(), artifact: ctx.finalReport };
    }
    if (!openai) {
        const markdown = `${draft.markdown}\n\n## Quality review\n\nTemplate pass — spelling and structure checked heuristically.`;
        ctx.finalReport = {
            ...draft,
            markdown: markdown.slice(0, 12_000),
            summary: String(draft.summary || "").slice(0, 500),
            mode: draft.mode || "template",
        };
        return { metering: templateMetering(), artifact: ctx.finalReport };
    }
    const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await openai.chat.completions.create({
        model: modelId,
        max_tokens: 500,
        messages: [
            {
                role: "system",
                content:
                    'Polish the assignment deliverable. Return JSON: { "summary": string (max 400), "markdown": string }',
            },
            { role: "user", content: `Draft to polish:\n\n${draft.markdown.slice(0, 8000)}` },
        ],
        response_format: { type: "json_object" },
    });
    let parsed = {};
    try {
        parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
    } catch {
        parsed = {};
    }
    const markdown = String(parsed.markdown || draft.markdown).slice(0, 12_000);
    const summary = String(parsed.summary || draft.summary).slice(0, 500);
    ctx.finalReport = {
        ...draft,
        summary,
        markdown,
        mode: "openai",
        qualityPass: true,
    };
    const usage = res.usage;
    return {
        metering: {
            inputTokens: Number(usage?.prompt_tokens) || 0,
            outputTokens: Number(usage?.completion_tokens) || 0,
            model: modelId,
            archetype: "WORK-STEP",
        },
        artifact: ctx.finalReport,
    };
}

const RUN_STEPS = [
    { milestoneId: "m1", run: async (s, c) => runReviewStep(s, c) },
    { milestoneId: "m2", run: async (s, c) => runResearchStep(s, c) },
    { milestoneId: "m3", run: async (s, c) => runDraftStep(s, c) },
    { milestoneId: "m4", run: async (s, c) => runQualityStep(s, c) },
];

/**
 * @param {object} session mutable session row (work mode)
 */
async function pauseWorkSession(session, reason) {
    session.workPausedAt = new Date().toISOString();
    session.workPauseReason = reason;
    session.status = "paused";
    appendWorkActivity(session, { kind: "pause", label: reason || "Assignment paused" });
    void notifyWorkPaused(session, reason);
    blockActiveMilestone(session, reason);
    const taskTitle = taskTitleFromSession(session);
    session.workReport = {
        taskTitle,
        summary: reason,
        markdown: `## Sarah Work paused\n\n${reason}\n\nYour messages are saved. Top up credits or wait for renewal, then submit again when ready.`,
        generatedAt: new Date().toISOString(),
        mode: "paused",
        paused: true,
        budget: workBudgetSnapshot(session),
    };
    syncWorkWorkspace(session);
    await persistPersonalSarahSession(session);
    return { ran: false, reason: "paused", paused: true, report: session.workReport, meteringSteps: [] };
}

export async function executePersonalSarahWorkRun(session) {
    if (!session || session.mode !== "work") return { ran: false, reason: "not_work", meteringSteps: [] };
    if (session.workCancelledAt || !session.workSubmittedAt) return { ran: false, reason: "not_submitted", meteringSteps: [] };
    if (session.workCompletedAt) {
        return { ran: false, reason: "already_completed", report: session.workReport || null, meteringSteps: [] };
    }
    if (session.workPausedAt) {
        return { ran: false, reason: "already_paused", report: session.workReport || null, meteringSteps: [] };
    }

    initExecutionMilestones(session);
    if (hasBlockingLevel3Approval(session)) {
        return pauseWorkSession(
            session,
            "Level 3 approval is required before Sarah can run this assignment (payment, purchase, or signature)."
        );
    }
    const trust = assertWorkTrustForOutbound(session);
    if (!trust.allowed && trust.code === "WORK_TRUST_BLOCKED") {
        return pauseWorkSession(session, trust.reason || "Sarah Trust blocked external actions for this assignment.");
    }
    appendWorkActivity(session, { kind: "run_start", label: "Sarah started assignment execution" });
    await persistPersonalSarahSession(session);

    /** @type {Array<object>} */
    const meteringSteps = [];
    const ctx = { reviewSummary: "", researchSummary: "", draft: null, finalReport: null };

    for (const step of RUN_STEPS) {
        const gate = await gateStepCredits(session);
        if (!gate.allowed) {
            const msg =
                gate.reason === "cap"
                    ? "This assignment hit its automatic fair-share credit cap. Start a new Work task or top up to continue heavy work."
                    : "Not enough AI credits to run this assignment. Buy a top-up or wait for your plan to renew.";
            return pauseWorkSession(session, msg);
        }

        beginMilestone(session, step.milestoneId);
        await persistPersonalSarahSession(session);

        let stepResult;
        try {
            stepResult = await step.run(session, ctx);
        } catch (err) {
            stepResult = { metering: templateMetering(), error: String(err?.message || err).slice(0, 200) };
        }

        const applied = applyStepCredits(session, stepResult.metering);
        meteringSteps.push({
            ...applied.metering,
            credits: applied.credits,
            milestoneId: step.milestoneId,
        });

        if (session.workWorkspace?.budget) {
            session.workWorkspace.budget.usedCredits = session.workCreditsUsedCredits;
        }

        const msTitle =
            session.workWorkspace?.milestones?.find((m) => m.id === step.milestoneId)?.title || step.milestoneId;
        appendWorkActivity(session, {
            kind: "step_meter",
            label: msTitle,
            detail: applied.credits > 0 ? `${applied.credits} credits used for this step` : "Step metered",
            milestoneId: step.milestoneId,
            credits: applied.credits,
        });

        completeMilestone(session, step.milestoneId);
        const pct = session.workWorkspace?.progressPercent ?? 0;
        void notifyWorkMilestoneIfMeaningful(session, step.milestoneId, pct);
        await persistPersonalSarahSession(session);
    }

    const taskTitle = taskTitleFromSession(session);
    const report = ctx.finalReport || ctx.draft || {
        taskTitle,
        summary: `Sarah completed: ${taskTitle}`,
        markdown: "## Assignment complete",
        mode: "template",
    };
    report.taskTitle = taskTitle;
    report.generatedAt = new Date().toISOString();
    report.metering = meteringSteps[meteringSteps.length - 1] || { archetype: "WORK-STEP" };
    report.budget = {
        ...workBudgetSnapshot(session),
        stepCredits: meteringSteps.reduce((s, m) => s + (Number(m.credits) || 0), 0),
        actualCredits: session.workCreditsUsedCredits,
        steps: meteringSteps.length,
    };
    report.execution = {
        review: ctx.reviewSummary,
        research: ctx.researchSummary,
        stepsCompleted: RUN_STEPS.map((s) => s.milestoneId),
    };

    session.workReport = report;
    session.workCompletedAt = new Date().toISOString();
    session.status = "completed";
    appendWorkActivity(session, { kind: "complete", label: "Assignment completed" });
    syncWorkWorkspace(session);
    await persistPersonalSarahSession(session);

    await createSarahWorkCompletionNotification(session.userId, {
        sessionId: session.id,
        taskTitle,
        summary: report.summary,
    });

    return {
        ran: true,
        report,
        taskTitle,
        metering: report.metering,
        meteringSteps,
    };
}