/**
 * SWI-M0 — graph edge types for future M2 implementation.
 */

export const GRAPH_NODE_TYPES = Object.freeze([
    "country",
    "region",
    "industry",
    "organisation",
    "person",
    "event",
    "policy",
    "commodity",
    "trend",
    "development",
]);

export const GRAPH_EDGE_TYPES = Object.freeze([
    "located_in",
    "contains_industry",
    "related_development",
    "regulated_by",
    "trades_with",
    "announced",
    "supersedes",
    "supports_trend",
]);