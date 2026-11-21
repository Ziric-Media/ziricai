/**
 * Local politics / elections — open web + Google News (not generic Sarah News edition only).
 */
import {
    formatOpenWebSearchForModel,
    personalSarahOpenWebEnabled,
    searchOpenWeb,
} from "../openWeb/openWebSearchService.js";
import {
    enrichQueryWithUserLocale,
    resolvePersonalSarahUserLocale,
} from "./personalSarahUserLocale.js";

const LOCAL_AFFAIRS_RE =
    /\belections?\b|\bcoalition\b|\bmunicipal\b|\blocal government\b|\bmetro\b|\bmetropolitan\b|\bcouncil\b|\bpolitics\b|\bvoting\b|\bballot\b|\banc\b|\beff\b|\bda\b|\bmk party\b|\bhere in\b|\bin south africa\b|\bsouth african\b|\blocal news\b/i;

/**
 * @param {Array<{ role?: string, content?: string }>} history
 * @param {string} message
 */
export function recentUserConversationBlob(history = [], message = "") {
    const prior = (history || [])
        .filter((t) => t.role === "user")
        .slice(-3)
        .map((t) => String(t.content || "").trim())
        .filter(Boolean);
    prior.push(String(message || "").trim());
    return prior.join(" ").slice(0, 500);
}

/**
 * @param {string} message
 * @param {Array<{ role?: string, content?: string }>} history
 * @param {object} ctx
 */
export function shouldPrefetchLocalAffairs(message = "", history = [], ctx = {}) {
    if (!personalSarahOpenWebEnabled()) return false;
    const blob = recentUserConversationBlob(history, message);
    if (LOCAL_AFFAIRS_RE.test(blob)) return true;
    if (/\bhere\b|\blocally\b|\bin my country\b/i.test(message) && (ctx.country || ctx.locale)) return true;
    return false;
}

/**
 * @param {object} ctx
 * @param {string} message
 * @param {Array<{ role?: string, content?: string }>} history
 */
export async function buildLocalAffairsPrefetchBlock(ctx, message, history = []) {
    const locale = resolvePersonalSarahUserLocale(ctx);
    const topic = recentUserConversationBlob(history, message);
    const primary = enrichQueryWithUserLocale(topic, locale).slice(0, 200);
    const secondary = enrichQueryWithUserLocale(
        `${topic} coalition local government elections news`,
        locale
    ).slice(0, 200);

    const [a, b] = await Promise.all([
        searchOpenWeb(primary, {
            maxResults: 8,
            localeHint: locale,
            includeGoogleNews: true,
            topicalFilter: "politics",
        }),
        searchOpenWeb(secondary, {
            maxResults: 6,
            localeHint: locale,
            includeGoogleNews: true,
            topicalFilter: "politics",
        }),
    ]);

    const merged = {
        ok: true,
        active: true,
        query: primary,
        resultCount: 0,
        results: [],
        locale: { country: locale.country, city: locale.city },
        providers: { googleNews: true },
    };
    const seen = new Set();
    for (const payload of [a, b]) {
        for (const r of payload.results || []) {
            const key = `${r.title}|${r.url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.results.push(r);
        }
    }
    merged.resultCount = merged.results.length;

    const lines = [
        `LOCAL AFFAIRS PREFETCH — user is in **${locale.country}**${locale.city ? ` (${locale.city})` : ""}.`,
        `Treat "here", "locally", and follow-ups as **${locale.country}** unless they name another place.`,
        "Answer from these live open-web results — **do not** give generic textbook explanations of coalitions or elections.",
        "Do **not** say headlines or updates are unavailable when results appear below.",
        "",
        formatOpenWebSearchForModel(merged),
    ];

    return {
        locale,
        query: primary,
        resultCount: merged.resultCount,
        block: lines.join("\n"),
    };
}