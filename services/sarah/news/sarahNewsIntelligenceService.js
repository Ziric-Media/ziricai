/**
 * SHI/SN — shared news intelligence for Sarah News UI and Personal Sarah tools.
 */
import { DEFAULT_SARAH_NEWS_PROFILE, getSarahNewsProfile } from "./sarahNewsProfileService.js";
import { compileSarahNewsEdition } from "./sarahNewsEditionService.js";
import { buildSarahNewsStoryRoom } from "./sarahNewsStoryService.js";
import { composeSarahArticleBodyFull } from "./sarahNewsArticleComposer.js";

function filterHeadlinesByQuery(headlines, rawQuery) {
    const q = String(rawQuery || "").trim().toLowerCase();
    if (!q) return headlines;
  const matchHay = (h) => `${h.headline} ${h.summary} ${h.publisher || ""} ${h.interest || ""}`.toLowerCase();

    let filtered = headlines.filter((h) => matchHay(h).includes(q));
    if (filtered.length) return filtered;

    const tokens = q.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length > 1) {
        filtered = headlines.filter((h) => {
            const hay = matchHay(h);
            return tokens.some((t) => hay.includes(t));
        });
    }
    return filtered;
}

/**
 * @param {string} uid
 * @param {{ slot?: string, query?: string, maxItems?: number, useDefaultProfileIfMissing?: boolean, persistEdition?: boolean, refresh?: boolean, useCache?: boolean }} [opts]
 */
export async function getSarahNewsSnapshotForUser(uid, opts = {}) {
    if (!uid) {
        return { success: false, error: "uid required", code: "UID_REQUIRED" };
    }
    let profile = await getSarahNewsProfile(uid);
    let usedDefaultProfile = false;
    if (!profile?.regions?.length) {
        if (opts.useDefaultProfileIfMissing) {
            profile = { ...DEFAULT_SARAH_NEWS_PROFILE };
            usedDefaultProfile = true;
        } else {
            return {
                success: false,
                error: "Sarah News is not set up yet. Ask the user to open the News tab and save preferences first.",
                code: "NEWS_PROFILE_MISSING",
            };
        }
    }
    const edition = await compileSarahNewsEdition(profile, {
        slot: opts.slot,
        uid,
        persistEdition: opts.persistEdition === true,
        refresh: opts.refresh === true,
        useCache: opts.useCache !== false,
    });
    let headlines = [...(edition.topStories || []), ...(edition.headlines || [])];
    const seen = new Set();
    headlines = headlines.filter((h) => {
        const k = h.storyId || h.headline;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    headlines = filterHeadlinesByQuery(headlines, opts.query);

    const maxItems = Math.min(Math.max(Number(opts.maxItems) || 8, 1), 20);
    if (!headlines.length && opts.query) {
        const all = [...(edition.topStories || []), ...(edition.headlines || [])];
        const seen = new Set();
        headlines = all.filter((h) => {
            const k = h.storyId || h.headline;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }
    headlines = headlines.slice(0, maxItems);

    return {
        success: true,
        usedDefaultProfile,
        profile,
        edition: {
            slot: edition.slot,
            compiledAt: edition.compiledAt,
            publishers: edition.publishers,
            disclaimer: edition.disclaimer,
        },
        headlines: headlines.map((h) => ({
            storyId: h.storyId,
            headline: h.headline,
            summary: h.summary,
            publisher: h.publisher,
            region: h.region,
            interest: h.interest,
            sourceNote: h.sourceNote,
            publishedAt: h.publishedAt,
        })),
    };
}

/**
 * Format headlines for LLM tool output (compact).
 * @param {Awaited<ReturnType<typeof getSarahNewsSnapshotForUser>>} snap
 */
/**
 * @param {string} uid
 * @param {string} storyId
 * @param {{ slot?: string }} [opts]
 */
export async function getSarahNewsStoryForUser(uid, storyId, opts = {}) {
    if (!uid || !storyId) {
        return { success: false, error: "uid and storyId required", code: "INVALID_REQUEST" };
    }
    const profile = await getSarahNewsProfile(uid);
    if (!profile?.regions?.length) {
        return {
            success: false,
            error: "Sarah News is not set up yet.",
            code: "NEWS_PROFILE_MISSING",
        };
    }
    const edition = await compileSarahNewsEdition(profile, {
        slot: opts.slot,
        uid,
        persistEdition: false,
        useCache: true,
    });
    const base = edition.storiesById?.[storyId];
    if (!base) {
        return { success: false, error: "Story not found in current edition.", code: "STORY_NOT_FOUND" };
    }
    const room = buildSarahNewsStoryRoom(base, edition);
    const articleBodyFull = composeSarahArticleBodyFull(base) || base.articleBody;
    return {
        success: true,
        story: { ...base, ...room, articleBody: articleBodyFull || base.articleBody },
        edition: { slot: edition.slot, compiledAt: edition.compiledAt, editionDay: edition.editionDay },
    };
}

export function formatSarahNewsSnapshotForModel(snap) {
    if (!snap.success) return snap.error || "No news snapshot.";
    const defaultNote = snap.usedDefaultProfile
        ? "(Using platform default News regions za/zw/world until the user saves News preferences.)"
        : "";
    if (!snap.headlines?.length) {
        return [
            `Sarah News snapshot: no headlines matched that exact topic in the current edition ${defaultNote}`.trim(),
            `Publishers in mix: ${(snap.edition?.publishers || []).join(", ") || "multiple"}.`,
            "Summarise the closest stories from a follow-up tool call without query filter, or widen the topic.",
        ].join("\n");
    }
    const lines = snap.headlines.map(
        (h, i) =>
            `${i + 1}. [${h.publisher || "Source"}] ${h.headline} — ${h.summary}${h.sourceNote ? ` (${h.sourceNote})` : ""}`
    );
    return [
        `Sarah News snapshot (${snap.edition?.slot || "edition"} @ ${snap.edition?.compiledAt || "now"}). ${defaultNote}`.trim(),
        `Publishers in mix: ${(snap.edition?.publishers || []).join(", ") || "multiple"}.`,
        "",
        ...lines,
        "",
        "Use these verified feed facts; cite the publisher. Offer in-app News for full Sarah articles.",
    ].join("\n");
}