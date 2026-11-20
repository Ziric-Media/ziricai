/**
 * SN-01 — allow-listed RSS sources (BBC public feeds v1).
 */

/** @type {Record<string, { url: string, publisher: string }>} */
export const REGION_FEEDS = Object.freeze({
    za: { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
    zw: { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
    africa: { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
    world: { url: "https://feeds.bbci.co.uk/news/world/rss.xml", publisher: "BBC News" },
});

/** @type {Record<string, { url: string, publisher: string }>} */
export const INTEREST_FEEDS = Object.freeze({
    politics: { url: "https://feeds.bbci.co.uk/news/politics/rss.xml", publisher: "BBC News" },
    business: { url: "https://feeds.bbci.co.uk/news/business/rss.xml", publisher: "BBC News" },
    tech: { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", publisher: "BBC News" },
    sports: { url: "https://feeds.bbci.co.uk/sport/rss.xml", publisher: "BBC Sport" },
    health: { url: "https://feeds.bbci.co.uk/news/health/rss.xml", publisher: "BBC News" },
    entertainment: { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", publisher: "BBC News" },
});

export const ZIMBABWE_KEYWORDS =
    /\bzimbabwe|harare|bulawayo|zanu|mnangagwa|chamisa\b/i;

export const SOUTH_AFRICA_KEYWORDS =
    /\bsouth africa|pretoria|cape town|johannesburg|eskom|anc\b|gauteng\b/i;