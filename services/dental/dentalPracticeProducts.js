/**
 * Default Discover "Products" catalog for all dental-clinic preset tenants.
 * Indicative ZAR ranges are for orientation only — final fees at consultation.
 */
export const DENTAL_PRODUCTS_CATALOG_VERSION = 1;

/** @typedef {{ id: string, name: string, description: string, category: string, price?: string, imageUrl?: string, promotion?: string }} DentalProduct */

/** @type {DentalProduct[]} */
export const DENTAL_PRACTICE_PRODUCTS = Object.freeze([
    {
        id: "ortho-metal-braces",
        category: "Braces",
        name: "Traditional metal braces",
        description:
            "Stainless steel brackets and archwires bonded to the teeth, widely used for complex bite and alignment corrections.",
        price: "From R28 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Dental_braces.jpg/640px-Dental_braces.jpg",
    },
    {
        id: "ortho-ceramic-braces",
        category: "Braces",
        name: "Ceramic (clear) braces",
        description:
            "Tooth-colored or translucent brackets that blend with natural teeth for a less noticeable look.",
        price: "From R32 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Ceramic_braces.jpg/640px-Ceramic_braces.jpg",
    },
    {
        id: "ortho-self-ligating",
        category: "Braces",
        name: "Self-ligating braces",
        description:
            "Specialized brackets (including Damon-style systems) with built-in clips instead of elastic bands, lowering friction and adjustment visits.",
        price: "From R35 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Dental_braces.jpg/640px-Dental_braces.jpg",
        promotion: "Braces",
    },
    {
        id: "ortho-lingual",
        category: "Braces",
        name: "Lingual braces",
        description:
            "Custom metal brackets bonded on the tongue side of the teeth so they are hidden from view.",
        price: "From R45 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Dental_braces.jpg/640px-Dental_braces.jpg",
        promotion: "Braces",
    },
    {
        id: "align-invisalign",
        category: "Clear aligners",
        name: "Invisalign",
        description:
            "Widely used clear aligner system with custom 3D-planned removable trays to gradually shift teeth.",
        price: "From R38 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Invisalign_brand_logo.svg/320px-Invisalign_brand_logo.svg.png",
    },
    {
        id: "align-active",
        category: "Clear aligners",
        name: "Active Aligners",
        description:
            "South African clear aligner brand (Smile Club) offered by local dentists for mild-to-moderate straightening.",
        price: "From R25 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Orthodontic_clear_aligners.jpg/640px-Orthodontic_clear_aligners.jpg",
    },
    {
        id: "align-spark",
        category: "Clear aligners",
        name: "Spark clear aligners",
        description:
            "Medical-grade, stain-resistant clear aligners often prescribed as an alternative to other aligner systems.",
        price: "From R36 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Orthodontic_clear_aligners.jpg/640px-Orthodontic_clear_aligners.jpg",
        promotion: "Clear aligners",
    },
    {
        id: "align-clearcorrect",
        category: "Clear aligners",
        name: "ClearCorrect",
        description:
            "Clear aligner system used by orthodontists and general dentists for staged tooth movement.",
        price: "From R34 000",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Orthodontic_clear_aligners.jpg/640px-Orthodontic_clear_aligners.jpg",
        promotion: "Clear aligners",
    },
    {
        id: "appliance-retainers",
        category: "Retainers & appliances",
        name: "Orthodontic retainers",
        description:
            "Essix (clear) retainers, Hawley plates, or bonded fixed wires to keep teeth stable after braces or aligners.",
        price: "From R2 500",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Orthodontic_retainer.jpg/640px-Orthodontic_retainer.jpg",
    },
    {
        id: "appliance-night-guard",
        category: "Retainers & appliances",
        name: "Bite plates & night guards",
        description:
            "Hard or soft splints to protect against bruxism (night grinding) and ease jaw tension.",
        price: "From R1 800",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Mouthguard.jpg/640px-Mouthguard.jpg",
    },
    {
        id: "appliance-sports-guard",
        category: "Retainers & appliances",
        name: "Custom sports mouthguards",
        description:
            "Shock-absorbing guards moulded to the teeth for contact sports such as rugby, hockey, or boxing.",
        price: "From R1 200",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Mouthguard.jpg/640px-Mouthguard.jpg",
        promotion: "Guards",
    },
    {
        id: "appliance-sleep",
        category: "Retainers & appliances",
        name: "Anti-snoring & sleep appliances",
        description:
            "Mandibular advancement devices that hold the lower jaw slightly forward during sleep to help keep the airway open.",
        price: "From R4 500",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Mouthguard.jpg/640px-Mouthguard.jpg",
        promotion: "Sleep",
    },
    {
        id: "prosthetic-restorations",
        category: "Restorative",
        name: "Crowns, bridges, veneers & dentures",
        description:
            "Lab-made prosthetic restorations to replace missing teeth or restore damaged teeth after assessment.",
        price: "From R3 500 per unit",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Dental_crowns.jpg/640px-Dental_crowns.jpg",
    },
]);

/**
 * Discover listing shape (Sarah App company profile).
 */
export function buildDentalPracticeDiscoverProducts() {
    return DENTAL_PRACTICE_PRODUCTS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price || null,
        imageUrl: p.imageUrl || null,
        promotion: p.promotion || p.category,
    }));
}

export function buildDentalPracticeProductsKnowledgeText() {
    const byCategory = new Map();
    for (const p of DENTAL_PRACTICE_PRODUCTS) {
        const list = byCategory.get(p.category) || [];
        list.push(p);
        byCategory.set(p.category, list);
    }
    const sections = [];
    for (const [category, items] of byCategory) {
        sections.push(
            `### ${category}\n${items
                .map((p) => `- **${p.name}** — ${p.description}${p.price ? ` Indicative: ${p.price} (quote at consultation).` : ""}`)
                .join("\n")}`
        );
    }
    return `Orthodontic and custom dental products offered at dental-clinic preset practices (catalog v${DENTAL_PRODUCTS_CATALOG_VERSION}):

${sections.join("\n\n")}

Prices are indicative only and vary by case complexity, lab fees, and medical-aid rules. Sarah must not invent final fees — confirm at reception or consultation.`;
}

export function dentalProductsCatalogIsCurrent(products = []) {
    if (!Array.isArray(products) || !products.length) return false;
    const ids = new Set(products.map((p) => p.id));
    return ids.has("ortho-metal-braces") && ids.has("align-invisalign") && ids.has("prosthetic-restorations");
}