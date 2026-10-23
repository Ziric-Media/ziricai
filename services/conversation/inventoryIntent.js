/** Detect customer messages that are browsing vehicle/inventory (sales funnel). */
export function isInventoryBrowseIntent(text) {
    const raw = String(text || "");
    const lower = raw.toLowerCase();
    if (
        /\b(inventory|in stock|stock list|vehicles?|cars?|suv|bakkie|hilux|fortuner|used car|what do you have|show me (?:some )?(?:cars|vehicles|options))\b/.test(
            lower
        )
    ) {
        return true;
    }
    return /\b(r\s?\d[\d,.\s]*k?)\b/i.test(raw);
}
