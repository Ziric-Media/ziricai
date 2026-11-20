/**
 * SN-03 — allow-listed RSS from multiple media houses (by region + interest).
 *
 * `nativeRegion` — items from this feed are treated as local to that region (no keyword gate).
 */

/** @type {Record<string, Array<{ url: string, publisher: string, nativeRegion?: string }>>} */
export const REGION_FEED_LISTS = Object.freeze({
    za: [
        { url: "https://www.sabcnews.com/sabcnews/feed/", publisher: "SABC News", nativeRegion: "za" },
        { url: "https://www.iol.co.za/rss", publisher: "IOL", nativeRegion: "za" },
        { url: "https://citizen.co.za/feed/", publisher: "The Citizen", nativeRegion: "za" },
        { url: "https://www.dailymaverick.co.za/dmrss/", publisher: "Daily Maverick", nativeRegion: "za" },
        { url: "https://businesstech.co.za/news/feed/", publisher: "BusinessTech", nativeRegion: "za" },
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_africa.rss", publisher: "CNN" },
        { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
    ],
    zw: [
        { url: "https://newsday.co.zw/feed/", publisher: "NewsDay Zimbabwe", nativeRegion: "zw" },
        { url: "https://www.herald.co.zw/feed/", publisher: "The Herald", nativeRegion: "zw" },
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_africa.rss", publisher: "CNN" },
        { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
    ],
    africa: [
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_africa.rss", publisher: "CNN" },
        { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
        { url: "https://rss.dw.com/xml/rss_en_all", publisher: "DW News" },
        { url: "https://www.france24.com/en/rss", publisher: "France 24" },
        { url: "https://www.theguardian.com/world/rss", publisher: "The Guardian" },
    ],
    world: [
        { url: "https://feeds.bbci.co.uk/news/world/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/edition_world.rss", publisher: "CNN" },
        { url: "https://www.theguardian.com/world/rss", publisher: "The Guardian" },
        { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
        { url: "https://rss.dw.com/xml/rss_en_all", publisher: "DW News" },
        { url: "https://www.france24.com/en/rss", publisher: "France 24" },
    ],
});

/** Shared tech / international desks */
const TECH_FEEDS = [
    { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", publisher: "BBC News" },
    { url: "http://rss.cnn.com/rss/cnn_tech.rss", publisher: "CNN" },
    { url: "https://www.theguardian.com/uk/technology/rss", publisher: "The Guardian" },
    { url: "https://techcrunch.com/feed/", publisher: "TechCrunch" },
    { url: "https://www.theverge.com/rss/index.xml", publisher: "The Verge" },
    { url: "https://businesstech.co.za/news/feed/", publisher: "BusinessTech" },
];

const BUSINESS_FEEDS = [
    { url: "https://feeds.bbci.co.uk/news/business/rss.xml", publisher: "BBC News" },
    { url: "http://rss.cnn.com/rss/money_latest.rss", publisher: "CNN" },
    { url: "https://www.dailymaverick.co.za/dmrss/", publisher: "Daily Maverick" },
    { url: "https://businesstech.co.za/news/feed/", publisher: "BusinessTech" },
    { url: "https://www.theguardian.com/uk/business/rss", publisher: "The Guardian" },
];

const SHORTS_FEEDS = [
    { url: "https://feeds.bbci.co.uk/news/rss.xml", publisher: "BBC News" },
    { url: "http://rss.cnn.com/rss/edition.rss", publisher: "CNN" },
    { url: "https://www.theguardian.com/international/rss", publisher: "The Guardian" },
];

/** @type {Record<string, Array<{ url: string, publisher: string, nativeRegion?: string }>>} */
export const INTEREST_FEED_LISTS = Object.freeze({
    shorts: SHORTS_FEEDS,
    politics: [
        { url: "https://feeds.bbci.co.uk/news/politics/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/cnn_allpolitics.rss", publisher: "CNN" },
        { url: "https://www.theguardian.com/politics/rss", publisher: "The Guardian" },
        { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
    ],
    business: BUSINESS_FEEDS,
    tech: TECH_FEEDS,
    sports: [
        { url: "https://feeds.bbci.co.uk/sport/rss.xml", publisher: "BBC Sport" },
        { url: "http://rss.cnn.com/rss/edition_sport.rss", publisher: "CNN" },
        { url: "https://www.theguardian.com/uk/sport/rss", publisher: "The Guardian" },
    ],
    health: [
        { url: "https://feeds.bbci.co.uk/news/health/rss.xml", publisher: "BBC News" },
        { url: "https://www.theguardian.com/society/health/rss", publisher: "The Guardian" },
    ],
    entertainment: [
        { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", publisher: "BBC News" },
        { url: "http://rss.cnn.com/rss/cnn_showbiz.rss", publisher: "CNN" },
        { url: "https://www.theguardian.com/uk/culture/rss", publisher: "The Guardian" },
    ],
    mining: [
        ...BUSINESS_FEEDS,
        { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", publisher: "BBC News" },
    ],
    education: [
        { url: "https://feeds.bbci.co.uk/news/education/rss.xml", publisher: "BBC News" },
        { url: "https://www.theguardian.com/education/rss", publisher: "The Guardian" },
    ],
    auto: [
        { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", publisher: "BBC News" },
        { url: "https://www.theguardian.com/uk/technology/rss", publisher: "The Guardian" },
        { url: "https://businesstech.co.za/news/feed/", publisher: "BusinessTech" },
    ],
    religion: [
        { url: "https://feeds.bbci.co.uk/news/world/rss.xml", publisher: "BBC News" },
        { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
    ],
    fashion: [
        { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", publisher: "BBC News" },
        { url: "https://www.theguardian.com/fashion/rss", publisher: "The Guardian" },
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
    shorts: INTEREST_FEED_LISTS.shorts[0],
    politics: INTEREST_FEED_LISTS.politics[0],
    business: INTEREST_FEED_LISTS.business[0],
    tech: INTEREST_FEED_LISTS.tech[0],
    sports: INTEREST_FEED_LISTS.sports[0],
    health: INTEREST_FEED_LISTS.health[0],
    entertainment: INTEREST_FEED_LISTS.entertainment[0],
    mining: INTEREST_FEED_LISTS.mining[0],
    education: INTEREST_FEED_LISTS.education[0],
    auto: INTEREST_FEED_LISTS.auto[0],
    religion: INTEREST_FEED_LISTS.religion[0],
    fashion: INTEREST_FEED_LISTS.fashion[0],
});

export const ZIMBABWE_KEYWORDS =
    /\bzimbabwe|harare|bulawayo|zanu|mnangagwa|chamisa|zvishavane|mutare\b/i;

export const SOUTH_AFRICA_KEYWORDS =
    /\bsouth africa|pretoria|cape town|johannesburg|eskom|anc\b|gauteng\b|durban|sasol\b/i;

export const MINING_KEYWORDS =
    /\bmining|minerals|gold|platinum|lithium|coal|resources|anglo|sibanye\b/i;

/** Attributed in footnotes when SA local stories also circulate on broadcasters. */
export const ENC_AVAILABLE_ATTRIBUTION = "eNCA";

/** Human-readable list for edition metadata. */
export const SARAH_NEWS_PUBLISHER_ALLOWLIST = Object.freeze([
    "SABC News",
    "IOL",
    "The Citizen",
    "Daily Maverick",
    "BusinessTech",
    "NewsDay Zimbabwe",
    "The Herald",
    "BBC News",
    "BBC Sport",
    "CNN",
    "Al Jazeera",
    "DW News",
    "France 24",
    "The Guardian",
    "TechCrunch",
    "The Verge",
    ENC_AVAILABLE_ATTRIBUTION,
]);