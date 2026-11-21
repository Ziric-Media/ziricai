/**
 * SWI-M0 — Sarah World Monitor (hybrid: central themes + user interests via News profile).
 */
import { WORLD_MONITOR_REGIONS, WORLD_MONITOR_THEMES } from "./sarahIntelligencePillars.js";
import { compileSarahNewsEdition, slotForNow } from "../news/sarahNewsEditionService.js";
import { DEFAULT_SARAH_NEWS_PROFILE } from "../news/sarahNewsProfileService.js";
import { ingestHeadlinesIntoMemory } from "./sarahIntelligenceMemoryIngest.js";

export function worldMonitorConfig() {
    return {
        mode: "hybrid",
        central: {
            regions: [...WORLD_MONITOR_REGIONS],
            themes: [...WORLD_MONITOR_THEMES],
        },
        personal: {
            usesNewsProfile: true,
            followTopicsField: "followTopics",
        },
    };
}

/**
 * Central tick — compile a wide baseline edition and admit headlines to memory (when enabled).
 * @param {{ uid?: string|null }} [opts]
 */
export async function runSarahWorldMonitorTick(opts = {}) {
    const memoryOn =
        String(process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED || "").toLowerCase() === "true" ||
        String(process.env.SARAH_WORLD_MONITOR_ENABLED || "").toLowerCase() === "true";
    if (!memoryOn) {
        return { ok: true, skipped: true, reason: "memory_disabled" };
    }

    const profile = {
        ...DEFAULT_SARAH_NEWS_PROFILE,
        regions: ["world", "africa", "za", "zw"],
        interests: ["shorts", "politics", "business", "tech", "mining"],
    };
    const edition = await compileSarahNewsEdition(profile, {
        slot: slotForNow(),
        uid: opts.uid || null,
        persistEdition: false,
        useCache: true,
        refresh: false,
    });

    const headlines = [...(edition.topStories || []), ...(edition.headlines || [])];
    const ingest = await ingestHeadlinesIntoMemory(headlines, { pillar: "open_web", source: "world_monitor" });

    return {
        ok: true,
        skipped: false,
        editionSlot: edition.slot,
        headlineCount: headlines.length,
        ingest,
        config: worldMonitorConfig(),
    };
}