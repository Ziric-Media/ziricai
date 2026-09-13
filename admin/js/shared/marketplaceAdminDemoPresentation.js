/**
 * Admin-only demo social proof — isolated from customer Marketplace API (4C-4B-3).
 * Mirrors services/platform/marketplaceTemplate.js PACK_DEMO_RATINGS for Admin UI only.
 */
const PACK_DEMO_RATINGS = {
    "pack-school-ai": { average: 4.8, count: 124 },
    "pack-law-ai": { average: 4.6, count: 89 },
    "pack-clinic-ai": { average: 4.9, count: 156 },
    "pack-funeral-ai": { average: 4.9, count: 67 },
    "pack-sales-ai": { average: 4.7, count: 203 },
    "pack-receptionist-ai": { average: 4.8, count: 312 },
    "pack-church-ai": { average: 4.7, count: 78 },
    "pack-construction-ai": { average: 4.5, count: 45 },
    "pack-security-ai": { average: 4.6, count: 34 },
    "pack-restaurant-ai": { average: 4.8, count: 91 },
    "pack-automotive-ai": { average: 4.7, count: 118 },
    "pack-retail-ai": { average: 4.6, count: 82 },
};

export function getAdminDemoRatingDisplay(packId) {
    const data = PACK_DEMO_RATINGS[packId] || { average: 0, count: 0 };
    return { rating: data.average, ratingCount: data.count, source: "admin_demo_presentation" };
}
