/**
 * SN-01/02 — allow-listed RSS sources.
 */

/** @type {Record<string, Array<{ url: string, publisher: string }>>} */
export const REGION_FEED_LISTS = Object.freeze({
    za: [
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_africa.rss", publisher: "CNN" },
    ],
    zw: [
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_africa.rss", publisher: "CNN" },
    ],
    africa: [
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_africa.rss", publisher: "CNN" },
    ],
    world: [
        { url: "https://feeds.bbci.co.uk/news/world/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_world.rss", publisher: "CNN" },
    ],
});

/** @type {Record<string, Array<{ url: string, publisher: string }>>} */
export const INTEREST_FEED_LISTS = Object.freeze({
    politics: [
        { url: "https://feeds.bbci.co.uk/news/politics/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/cnn_allpolitics.rss", publisher: "CNN" },
    ],
    business: [
        { url: "https://feeds.bbci.co.uk/news/business/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/money_latest.rss", publisher: "CNN" },
    ],
    tech: [
        { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/cnn_tech.rss", publisher: "CNN" },
    ],
    sports: [{ url: "https://feeds.bbci.co.uk/sport/rss.xml", publisher: "BBC Sport" }],
    health: [{ url: "https://feeds.bbci.co.uk/news/health/rss.xml", publisher: "BBC News" }],
    entertainment: [
        { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/cnn_showbiz.rss", publisher: "CNN" },
    ],
});

/** Legacy single-feed map (tests / references). */
export const REGION_FEEDS = Object.freeze({
    za: REGION_FEED_LISTS.za[0],
    zw: REGION_FEED_LISTS.zw[0],
    africa: REGION_FEED_LISTS.africa[0],
    world: REGION_FEED_LISTS.world[0],
});

export const INTEREST_FEEDS = Object.freeze({
    politics: INTEREST_FEED_LISTS.politics[0],
    business: INTEREST_FEED_LISTS.business[0],
    tech: INTEREST_FEED_LISTS.tech[0],
    sports: INTEREST_FEED_LISTS.sports[0],
    health: INTEREST_FEED_LISTS.health[0],
    entertainment: INTEREST_FEED_LISTS.entertainment[0],
});

export const ZIMBABWE_KEYWORDS =
    /\bzimbabwe|harare|bulawayo|zanu|mnangagwa|chamisa\b/i;

export const SOUTH_AFRICA_KEYWORDS =
    /\bsouth africa|pretoria|cape town|johannesburg|eskom|anc\b|gauteng\b/i;

/** Footnote when a ZA-tagged story is surfaced (eNCA has no stable public RSS in SN-02). */
export const ENC_AVAILABLE_ATTRIBUTION = "eNCA";