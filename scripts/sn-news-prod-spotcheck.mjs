#!/usr/bin/env node
/**
 * SN-06 — Sarah News production spot-check (health + ZA edition + optional authenticated API).
 *
 *   node scripts/sn-news-prod-spotcheck.mjs
 *   SARAH_NEWS_ID_TOKEN="<firebase id token>" node scripts/sn-news-prod-spotcheck.mjs
 *
 * Remote compile only (no local RSS): set SN_NEWS_SPOTCHECK_REMOTE=1
 */
import assert from "node:assert/strict";

const API = (process.env.SN_NEWS_SPOTCHECK_API || process.env.SNET_SMOKE_API || "https://ziricai-production.up.railway.app").replace(
    /\/$/,
    ""
);

async function checkHealth() {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200, `health HTTP ${res.status}`);
    assert.equal(body.status, "ok", `health body ${JSON.stringify(body)}`);
    return body;
}

async function checkEditionLocal() {
    process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
    const { compileSarahNewsEdition } = await import("../services/sarah/news/sarahNewsEditionService.js");
  const { REGION_FEED_LISTS } = await import("../services/sarah/news/sarahNewsSources.js");

    assert.ok(
        REGION_FEED_LISTS.za.some((f) => f.url.includes("capi24.com") && f.publisher === "News24"),
        "SN-06: News24 capi24 feed missing from za allow-list"
    );

    const edition = await compileSarahNewsEdition({
        regions: ["za"],
        interests: ["general", "business", "tech"],
    });

    assert.equal(edition.ok, true, edition.message || "edition failed");
    const publishers = new Set(edition.publishers || []);
    const headlines = edition.headlines || [];

    const hasNews24Publisher = publishers.has("News24");
    const news24InStories = headlines.some((h) => String(h.sourceNote || h.publisher || "").includes("News24"));

    return {
        slot: edition.slot,
        headlineCount: headlines.length,
        publisherCount: publishers.size,
        publishers: [...publishers].sort(),
        news24: hasNews24Publisher || news24InStories,
        sample: headlines[0]?.headline?.slice(0, 80),
    };
}

async function checkEditionRemote(idToken) {
    const url = `${API}/api/personal-sarah/news/editions/latest?slot=morning&refresh=1`;
    const res = await fetch(url, {
        headers: { authorization: `Bearer ${idToken}` },
        signal: AbortSignal.timeout(120_000),
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200, `editions/latest HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    const edition = body.edition || {};
    const publishers = edition.publishers || [];
    const headlines = edition.headlines || [];
    const news24 = publishers.includes("News24") || headlines.some((h) => String(h.sourceNote || "").includes("News24"));
    return {
        slot: edition.slot,
        headlineCount: headlines.length,
        publisherCount: publishers.length,
        news24,
        sample: headlines[0]?.headline?.slice(0, 80),
    };
}

async function main() {
    const health = await checkHealth();
    console.log("health:", health.status, health.timestamp || "");

    const idToken = process.env.SARAH_NEWS_ID_TOKEN || process.env.SN_NEWS_SPOTCHECK_ID_TOKEN;
    let edition;
    if (idToken) {
        edition = await checkEditionRemote(idToken);
        console.log("edition (prod API):", edition);
    } else if (process.env.SN_NEWS_SPOTCHECK_REMOTE === "1") {
        console.warn("SN_NEWS_SPOTCHECK_REMOTE=1 set but no SARAH_NEWS_ID_TOKEN — skipping authenticated prod edition");
        edition = null;
    } else {
        edition = await checkEditionLocal();
        console.log("edition (local compile / same code as deploy):", edition);
    }

    if (edition) {
        assert.ok(edition.headlineCount >= 1, "expected at least one headline");
        assert.ok(edition.publisherCount >= 2, "expected multiple publishers");
        assert.ok(edition.news24, "expected News24 in edition or publisher list (SN-06)");
    }

    console.log("sn-news-prod-spotcheck.mjs: ok");
}

main().catch((err) => {
    console.error("sn-news-prod-spotcheck.mjs: fail", err.message || err);
    process.exit(1);
});