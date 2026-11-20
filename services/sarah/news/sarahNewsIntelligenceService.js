/**
 * SHI/SN — shared news intelligence for Sarah News UI and Personal Sarah tools.
 */
import { getSarahNewsProfile } from "./sarahNewsProfileService.js";
import { compileSarahNewsEdition } from "./sarahNewsEditionService.js";

/**
 * @param {string} uid
 * @param {{ slot?: string, query?: string, maxItems?: number }} [opts]
 */
export async function getSarahNewsSnapshotForUser(uid, opts = {}) {
    if (!uid) {
        return { success: false, error: "uid required", code: "UID_REQUIRED" };
    }
    let profile = await getSarahNewsProfile(uid);
    if (!profile?.regions?.length) {
        return {
            success: false,
            error: "Sarah News is not set up yet. Ask the user to open the News tab and save preferences first.",
            code: "NEWS_PROFILE_MISSING",
        };
    }
    const edition = await compileSarahNewsEdition(profile, { slot: opts.slot });
    let headlines = [...(edition.topStories || []), ...(edition.headlines || [])];
    const seen = new Set();
    headlines = headlines.filter((h) => {
        const k = h.storyId || h.headline;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    const q = String(opts.query || "")
        .trim()
        .toLowerCase();
    if (q) {
        headlines = headlines.filter((h) => {
            const hay = `${h.headline} ${h.summary} ${h.publisher || ""}`.toLowerCase();
            return hay.includes(q);
        });
    }

    const maxItems = Math.min(Math.max(Number(opts.maxItems) || 8, 1), 20);
    headlines = headlines.slice(0, maxItems);

    return {
        success: true,
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
export function formatSarahNewsSnapshotForModel(snap) {
    if (!snap.success) return snap.error || "No news snapshot.";
    const lines = snap.headlines.map(
        (h, i) =>
            `${i + 1}. [${h.publisher || "Source"}] ${h.headline} — ${h.summary}${h.sourceNote ? ` (${h.sourceNote})` : ""}`
    );
    return [
        `Sarah News snapshot (${snap.edition?.slot || "edition"} @ ${snap.edition?.compiledAt || "now"}).`,
        `Publishers in mix: ${(snap.edition?.publishers || []).join(", ") || "multiple"}.`,
        "",
        ...lines,
        "",
        "Use these verified feed facts; cite the publisher. Offer in-app News for full Sarah articles.",
    ].join("\n");
}