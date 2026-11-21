/**
 * Shared sentence splitting for story room + composer.
 */
export function splitSentencesForStory(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    return clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) || [clean];
}