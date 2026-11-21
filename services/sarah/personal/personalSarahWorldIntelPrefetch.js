/**
 * Pre-fetch News + World Memory for trend/compare questions so Sarah never skips tools silently.
 */
import { getSarahNewsSnapshotForUser } from "../news/sarahNewsIntelligenceService.js";
import { recallWorldContext, sarahIntelligenceMemoryActive } from "../intelligence/sarahIntelligenceRecallService.js";
import {
    formatSarahNewsSnapshotForPersonalSarah,
    formatWorldContextForPersonalSarah,
} from "./personalSarahConversationVoice.js";

const INTEL_TRIGGERS =
    /\btrend(?:s|ing)?\b|\bmining\b|\bzimbabwe\b|\bcompared?\b|\bcompar(?:e|ing)\b|\bhow does\b|\bheadlines?\b|\bwhat(?:'s| is) happening\b|\bbefore\b|\bworld memory\b|\bintelligence memory\b/i;

export function shouldPrefetchWorldIntelligence(message = "") {
    return INTEL_TRIGGERS.test(String(message || ""));
}

export function deriveWorldIntelQuery(message = "") {
    let q = String(message || "")
        .replace(/[^\w\s'-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    q = q.replace(/^(wh?at|how|tell me|explain)\s+/i, "").slice(0, 120);
    return q || "news";
}

/**
 * @param {{ uid: string }} ctx
 * @param {string} message
 */
export async function buildWorldIntelligencePrefetchBlock(ctx, message) {
    const query = deriveWorldIntelQuery(message);
    const region = /\bzimbabwe\b|\bzw\b/i.test(message) ? "zw" : undefined;

    const tasks = [
        getSarahNewsSnapshotForUser(ctx.uid, {
            query,
            maxItems: 10,
            useDefaultProfileIfMissing: true,
            refresh: false,
        }),
    ];
    if (sarahIntelligenceMemoryActive()) {
        tasks.push(
            recallWorldContext({
                query,
                region,
                limit: 8,
            })
        );
    }

    const results = await Promise.all(tasks);
    const snap = results[0];
    const mem = results[1];

    const blocks = [
        "LIVE PREFETCH (internal — intimate voice to user; no links or outlet names):",
        "",
        "## Today",
        formatSarahNewsSnapshotForPersonalSarah(snap),
    ];

    if (mem) {
        blocks.push("", "## Stored context", formatWorldContextForPersonalSarah(mem));
    }

    return {
        query,
        region: region || null,
        block: blocks.join("\n"),
        newsHeadlineCount: snap.headlines?.length || 0,
        memoryCount: mem?.count || 0,
    };
}