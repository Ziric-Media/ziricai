/**
 * MC-PO-04A — record safety signals + optional auto-case for elevated/critical.
 */
import { randomUUID } from "node:crypto";
import { PLATFORM_GOVERNANCE } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import {
    classifyConsumerMessageSafety,
    safetyBlockReply,
    redactedExcerpt,
} from "./consumerSafetyClassifier.js";
import { createConsumerSafetyCase, listConsumerSafetyCases } from "./consumerSafetyService.js";

const signalCol = createNetworkCollection(PLATFORM_GOVERNANCE.SAFETY_SIGNALS);

const DEDUPE_MS = 15 * 60 * 1000;

function refCode() {
    return `TS-${String(new Date().getFullYear()).slice(-2)}-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * @param {{ uid: string, channel: string, message: string, conversationId?: string|null, companyId?: string|null }} input
 */
export async function evaluateAndRecordConsumerSafety(input) {
    const uid = String(input.uid || "").trim();
    const channel = String(input.channel || "unknown").trim();
    const message = String(input.message || "").trim();
    const classification = classifyConsumerMessageSafety(message);
    if (classification.severity === "normal") {
        return { ...classification, recorded: false, caseId: null, blockReply: null };
    }

    const now = new Date().toISOString();
    const signalId = randomUUID();
    const excerptPreview = redactedExcerpt(message);
    const signal = {
        signalId,
        reference: refCode(),
        subjectUid: uid,
        channel,
        companyId: input.companyId || null,
        conversationId: input.conversationId || null,
        category: classification.category,
        severity: classification.severity,
        confidence: classification.confidence,
        summary: classification.summary,
        excerptPreview,
        createdAt: now,
        schemaVersion: 1,
    };
    await signalCol.put(signalId, signal, { merge: false });

    let caseId = null;
    if (classification.severity === "elevated" || classification.severity === "critical") {
        const recent = (await listConsumerSafetyCases({ limit: 200 })).filter(
            (c) =>
                c.subjectUid === uid &&
                c.status === "open" &&
                Date.now() - new Date(c.createdAt).getTime() < DEDUPE_MS
        );
        if (!recent.length) {
            const created = await createConsumerSafetyCase({
                subjectUid: uid,
                reason: `[${signal.reference}] ${classification.summary}`,
                details: `Auto-detected (${channel}). Category: ${classification.category}. Excerpt: ${excerptPreview}`,
                actorUid: "system:safety-detection",
            });
            caseId = created.caseId;
        } else {
            caseId = recent[0].caseId;
        }
    }

    const blockReply =
        classification.shouldBlock && classification.category
            ? safetyBlockReply(classification.category)
            : null;

    return {
        ...classification,
        recorded: true,
        signalId,
        reference: signal.reference,
        caseId,
        blockReply,
    };
}

export async function listSafetySignalsForConsumer(uid, { limit = 50 } = {}) {
    const rows = await signalCol.list({ limit: 500 });
    return rows
        .filter((r) => r.subjectUid === uid)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, Math.min(limit, 100));
}

export async function getSafetyOverview() {
    const cases = await listConsumerSafetyCases({ limit: 500 });
    const signals = await signalCol.list({ limit: 500 });
    const openCases = cases.filter((c) => c.status === "open");
    const critical = openCases.filter((c) => /critical|imminent|weapons/i.test(c.reason || ""));
    const elevated = openCases.filter((c) => !critical.includes(c));
    const signals24h = signals.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 86_400_000);
    return {
        openCases: openCases.length,
        criticalReview: critical.length,
        elevatedReview: elevated.length,
        awaitingReview: openCases.length,
        signals24h: signals24h.length,
        recentCases: cases.slice(0, 20),
    };
}

export function clearSafetySignalsForTests() {
    signalCol.clearMemory();
}