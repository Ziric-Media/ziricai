/**
 * Single default Meta Graph API version for WhatsApp Cloud + Embedded Signup.
 * Override with META_GRAPH_VERSION (e.g. v26.0).
 */
export function getMetaGraphVersion() {
    return String(process.env.META_GRAPH_VERSION || "v26.0").trim();
}

export const DEFAULT_META_GRAPH_VERSION = "v26.0";
