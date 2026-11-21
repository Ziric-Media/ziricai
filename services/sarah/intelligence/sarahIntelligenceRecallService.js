/**
 * SWI-M1 — recall stored world intelligence for Personal Sarah and APIs.
 */
import { listIntelligenceObservations } from "./sarahIntelligenceMemoryStore.js";
import { listIntelligenceTimeline } from "./sarahIntelligenceTimelineService.js";
import { queryWorldMemoryEntityProfiles } from "./sarahIntelligenceMemoryPersistence.js";
import { graphContextForEntityIds, sarahIntelligenceGraphActive } from "./sarahIntelligenceGraphService.js";
import { listIntelligenceTrends } from "./sarahIntelligenceTrendService.js";
import { deriveEntityRefsFromObservation } from "./sarahIntelligenceEntityProfiles.js";

export function sarahIntelligenceMemoryActive() {
    return String(process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED || "").toLowerCase() === "true";
}

/**
 * @param {{ query?: string, domain?: string, region?: string, limit?: number, includeTimeline?: boolean }} opts
 */
export async function recallWorldContext(opts = {}) {
    if (!sarahIntelligenceMemoryActive()) {
        return {
            ok: true,
            active: false,
            observations: [],
            timeline: [],
            entities: [],
            trends: [],
            graphEdges: [],
            message: "Sarah World Intelligence Memory is not enabled on this server.",
        };
    }

    const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 20);
    const queryOpts = {
        query: opts.query,
        domain: opts.domain,
        region: opts.region,
        limit,
    };
    const [observations, timeline, entities] = await Promise.all([
        listIntelligenceObservations(queryOpts),
        opts.includeTimeline === false
            ? Promise.resolve([])
            : listIntelligenceTimeline({ ...queryOpts, limit: Math.min(limit * 2, 20) }),
        queryWorldMemoryEntityProfiles({ query: opts.query, limit: 6 }),
    ]);

    const graphOn = sarahIntelligenceGraphActive();
    const [trends, graphEdges] = graphOn
        ? await Promise.all([
              listIntelligenceTrends({
                  query: opts.query,
                  region: opts.region,
                  limit: 5,
              }),
              graphContextForEntityIds(
                  (() => {
                      const ids = entities.map((e) => e.entityId).filter(Boolean);
                      if (ids.length || !observations.length) return ids;
                      return deriveEntityRefsFromObservation(observations[0]).map((r) => r.entityId);
                  })(),
                  { limit: 10 }
              ),
          ])
        : [[], []];

    return {
        ok: true,
        active: true,
        graphActive: graphOn,
        query: opts.query || null,
        domain: opts.domain || null,
        region: opts.region || null,
        observations,
        timeline,
        entities,
        trends,
        graphEdges,
        count: observations.length,
    };
}

/**
 * @param {Awaited<ReturnType<typeof recallWorldContext>>} payload
 */
export function formatWorldContextForModel(payload) {
    if (!payload?.active) {
        return (
            payload?.message ||
            "World intelligence memory is off here — use fetchSarahNewsHeadlines for today's headlines."
        );
    }
    if (!payload.observations?.length) {
        const hint = payload.query
            ? `No stored intelligence matched "${payload.query}" yet. I can still fetch live headlines.`
            : "No matching stored intelligence yet — memory builds as News editions admit stories.";
        return `${hint}\n\n(Sarah World Memory is historical context from admitted headlines, not a live wire.)`;
    }

    const lines = [
        "Sarah World Intelligence Memory (stored developments — pair with fetchSarahNewsHeadlines for live news):",
        "",
    ];
    for (const row of payload.observations) {
        lines.push(
            `• [${row.domain || "topic"}${row.region ? ` · ${row.region}` : ""}] **${row.headline}**`,
            `  First seen: ${row.firstSeenAt || "?"} · Last update: ${row.lastSeenAt || "?"} (v${row.version || 1})`,
            `  ${String(row.summary || "").slice(0, 280)}${row.publisher ? ` — ${row.publisher}` : ""}`
        );
        lines.push("");
    }
    if (payload.entities?.length) {
        lines.push("Related entity profiles:");
        for (const e of payload.entities.slice(0, 5)) {
            lines.push(`- ${e.label}: ${e.lastHeadline || "no headline yet"} (observations: ${e.observationCount || 1})`);
        }
        lines.push("");
    }
    if (payload.timeline?.length) {
        lines.push("Recent timeline (headline changes on tracked stories):");
        for (const t of payload.timeline.slice(0, 5)) {
            lines.push(`- ${t.at}: ${t.headline} (v${t.version})`);
        }
        lines.push("");
    }
    if (payload.trends?.length) {
        lines.push("Emergent trends (corroboration-gated):");
        for (const tr of payload.trends.slice(0, 4)) {
            lines.push(
                `- ${tr.label}${tr.region ? ` (${tr.region})` : ""}: ${tr.corroborationTier} · strength ${tr.strength} · ${tr.publisherCount} publishers · "${String(tr.headlineSample || "").slice(0, 100)}"`
            );
        }
        lines.push("");
    }
    if (payload.graphEdges?.length) {
        lines.push("Graph links (region / industry → developments):");
        for (const g of payload.graphEdges.slice(0, 6)) {
            lines.push(`- ${g.fromNodeId} —${g.edgeType}→ ${g.toNodeId}${g.headline ? `: ${g.headline.slice(0, 80)}` : ""}`);
        }
        lines.push("");
    }
    lines.push(
        "",
        "When answering: explain what we have stored, what may have changed since lastSeenAt, and note uncertainty. Offer live headlines via fetchSarahNewsHeadlines."
    );
    return lines.join("\n");
}