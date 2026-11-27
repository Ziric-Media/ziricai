/**
 * MC-PO-02 — searchable consumer directory (metadata only).
 */
import { getConsumerSubscription } from "../revenue/consumerSubscriptionService.js";
import { DEFAULT_CONSUMER_SKU } from "../revenue/legacyPlanAliases.js";
import { getCatalogueSku } from "../revenue/catalogueService.js";
import { getConsumerProfile, listConsumerProfilesForPlatform, profileTimestampMs } from "../users/consumerProfileService.js";
import { formatConsumerFieldTime } from "./consumerTimestampFormat.js";
import { listConnectionsForUser } from "../network/connectionService.js";
import { listConsumerSafetyCases } from "./consumerSafetyService.js";
import { listSafetySignalsForConsumer } from "./consumerSafetyDetectionService.js";

function tierFromSku(skuId) {
    const m = String(skuId || "").match(/rs02\.sarah\.(\w+)\./i);
    return m ? m[1] : "free";
}

function tierLabelFromSku(skuId) {
    const sku = getCatalogueSku(skuId);
    if (sku?.name) return sku.name;
    const id = tierFromSku(skuId);
    const labels = { free: "Sarah Free", plus: "Sarah Plus", premium: "Sarah Premium", ultimate: "Sarah Ultimate" };
    return labels[id] || id;
}

function toDirectoryRow(profile, sub) {
    const skuId = sub?.skuId || DEFAULT_CONSUMER_SKU;
    const lastActiveAt =
        formatConsumerFieldTime(profile, "lastActiveAt") ||
        formatConsumerFieldTime(profile, "lastLoginAt") ||
        null;
    const registeredAt = formatConsumerFieldTime(profile, "createdAt") || profile.createdAt || null;
    return {
        uid: profile.uid,
        displayName: profile.preferredName || profile.fullName || profile.firstName || profile.uid,
        firstName: profile.firstName || null,
        lastName: profile.lastName || null,
        email: profile.email || null,
        registeredAt,
        createdAt: registeredAt,
        lastActiveAt,
        onboardingCompletedAt: profile.onboardingCompletedAt || null,
        tier: tierLabelFromSku(skuId),
        tierId: tierFromSku(skuId),
        skuId,
        subscriptionStatus: sub?.status || "free",
        safetyStatus: profile.platformSafety?.status || "ok",
        safetyLevel: profile.platformSafety?.level ?? 0,
    };
}

/**
 * @param {{ q?: string, limit?: number, cursor?: string }} [opts]
 */
export async function listConsumersForPlatform({ q = "", limit = 50, cursor = "" } = {}) {
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const needle = String(q || "").trim().toLowerCase();
    const profiles = await listConsumerProfilesForPlatform({ limit: 5000 });
    let filtered = profiles;
    if (needle) {
        filtered = profiles.filter((p) => {
            const hay = `${p.uid} ${p.email || ""} ${p.preferredName || ""} ${p.fullName || ""} ${p.firstName || ""} ${p.lastName || ""}`.toLowerCase();
            return hay.includes(needle);
        });
    }
    filtered.sort((a, b) => {
        const ta =
            profileTimestampMs(a, "lastActiveAt") ??
            profileTimestampMs(a, "lastLoginAt") ??
            profileTimestampMs(a, "updatedAt") ??
            0;
        const tb =
            profileTimestampMs(b, "lastActiveAt") ??
            profileTimestampMs(b, "lastLoginAt") ??
            profileTimestampMs(b, "updatedAt") ??
            0;
        return tb - ta;
    });
    let start = 0;
    if (cursor) {
        const idx = filtered.findIndex((p) => p.uid === cursor);
        start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = filtered.slice(start, start + cap);
    const rows = [];
    for (const p of slice) {
        const sub = await getConsumerSubscription(p.uid);
        rows.push(toDirectoryRow(p, sub));
    }
    const nextCursor = slice.length === cap && start + cap < filtered.length ? slice[slice.length - 1]?.uid : null;
    return {
        rows,
        totalMatched: filtered.length,
        nextCursor,
        partial: profiles.length >= 5000,
    };
}

/** @param {string} uid */
export async function getConsumerDetailForPlatform(uid) {
    const profile = await getConsumerProfile(uid);
    if (!profile) {
        throw Object.assign(new Error("Consumer not found"), { status: 404, code: "CONSUMER_NOT_FOUND" });
    }
    const sub = await getConsumerSubscription(uid);
    const connections = await listConnectionsForUser(uid, { limit: 50 }).catch(() => []);
    const cases = (await listConsumerSafetyCases({ limit: 200 })).filter((c) => c.subjectUid === uid);
    const signals = await listSafetySignalsForConsumer(uid, { limit: 20 });

    return {
        overview: toDirectoryRow(profile, sub),
        profile: {
            uid: profile.uid,
            email: profile.email || null,
            firstName: profile.firstName || null,
            lastName: profile.lastName || null,
            preferredName: profile.preferredName || null,
            city: profile.city || null,
            country: profile.country || null,
            phone: profile.phone || profile.mobile || null,
            popiaConsentVersion: profile.popiaConsentVersion || null,
            onboardingCompletedAt: formatConsumerFieldTime(profile, "onboardingCompletedAt"),
            createdAt: formatConsumerFieldTime(profile, "createdAt"),
            platformSafety: profile.platformSafety || { status: "ok", level: 0 },
        },
        subscription: sub
            ? {
                  skuId: sub.skuId,
                  status: sub.status,
                  currentPeriodEnd: sub.currentPeriodEnd || null,
              }
            : null,
        usage: {
            note: "RS02 / Personal Sarah usage counters — expand in MC-PO-02B.",
        },
        organisations: connections.map((c) => ({
            companyId: c.companyId || c.orgId || c.targetCompanyId,
            state: c.state || c.status,
            role: c.role || null,
            updatedAt: c.updatedAt || null,
        })),
        safety: {
            status: profile.platformSafety?.status || "ok",
            level: profile.platformSafety?.level ?? 0,
            restrictions: profile.platformSafety?.restrictions || [],
            openCases: cases.filter((c) => c.status === "open").length,
            totalCases: cases.length,
            recentCases: cases.slice(0, 10).map((c) => ({
                caseId: c.caseId,
                status: c.status,
                reason: c.reason,
                updatedAt: c.updatedAt,
            })),
            recentSignals: signals.map((s) => ({
                reference: s.reference,
                severity: s.severity,
                category: s.category,
                channel: s.channel,
                excerptPreview: s.excerptPreview,
                createdAt: s.createdAt,
            })),
        },
        privacy: {
            conversationContentVisible: false,
            personalKnowledgeVisible: false,
            safetyExcerptVisible: true,
        },
    };
}
