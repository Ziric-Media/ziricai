#!/usr/bin/env node
/**
 * Verify WhatsApp native vehicle image outbound plan and Meta payload shape.
 *
 * Usage:
 *   node scripts/verify-whatsapp-vehicle-images.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.WHATSAPP_DEV_MODE = "true";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const {
        buildVehicleOutboundPlan,
        stripWhatsAppImageUrlsFromText,
        isSupportedWhatsAppImageUrl,
        MAX_VEHICLE_IMAGES_PER_TURN,
    } = await import("../services/conversation/vehicleOutboundPlan.js");
    const { buildWhatsAppSystemPrompt, WHATSAPP_MEDIA_RULES } = await import(
        "../services/ai-core/whatsappConversationPrompt.js"
    );
    const { sendWhatsAppImage, sendWhatsAppMessagesSequential } = await import("../services/whatsapp.js");

    console.log("\nWhatsApp vehicle image outbound verification\n");

    const mockVehicles = [
        {
            vehicleId: "v1",
            stockNumber: "ST001",
            year: 2019,
            make: "Toyota",
            model: "Fortuner",
            price: 450000,
            mileage: 85000,
            location: "Centurion",
            images: [
                "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.webp",
                "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.jpg",
            ],
        },
        {
            vehicleId: "v2",
            stockNumber: "ST002",
            year: 2020,
            make: "Toyota",
            model: "Hilux",
            price: 520000,
            mileage: 62000,
            location: "Sandton",
            images: ["https://centralmotorsrtb.co.za/wp-content/uploads/hilux.png"],
        },
    ];

    const toolResults = [
        {
            tool: "searchInventory",
            ok: true,
            count: 2,
            vehicles: mockVehicles,
        },
    ];

    const llmReply =
        "Here are two great options for you!\n\n" +
        "![Fortuner](https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.jpg)\n" +
        "https://centralmotorsrtb.co.za/wp-content/uploads/hilux.png";

    const plan = buildVehicleOutboundPlan({
        toolResults,
        llmReply,
        channel: "whatsapp",
    });

    assert(plan != null, "Expected outbound plan for WhatsApp + searchInventory");
    assert(plan.vehicleCount === 2, `Expected 2 vehicles, got ${plan.vehicleCount}`);
    assert(plan.messages.length >= 3, `Expected intro + vehicle parts, got ${plan.messages.length}`);

    const textParts = plan.messages.filter((m) => m.type === "text");
    const imageParts = plan.messages.filter((m) => m.type === "image");
    assert(textParts.length >= 2, "Expected intro + vehicle text blocks");
    assert(imageParts.length === 2, `Expected 2 image parts, got ${imageParts.length}`);

    assert(
        !plan.strippedReply.includes("![") && !plan.strippedReply.includes("centralmotorsrtb"),
        "Markdown and image URLs must be stripped from LLM reply"
    );
    assert(
        textParts.some((m) => m.text.includes("Fortuner") && m.text.includes("ST001")),
        "Vehicle text block must include specs without URLs"
    );

    assert(
        imageParts[0].link.endsWith(".jpg"),
        "First vehicle should use jpg hero (webp skipped)"
    );
    assert(imageParts[0].caption.includes("Fortuner"), "Image caption should be vehicle title");
    assert(
        imageParts.every((m) => isSupportedWhatsAppImageUrl(m.link)),
        "All image links must be jpg/png"
    );

    const strippedOnly = stripWhatsAppImageUrlsFromText(
        "See ![car](https://x.com/a.jpg) and https://centralmotorsrtb.co.za/img/b.png"
    );
    assert(!strippedOnly.includes("!["), "stripWhatsAppImageUrlsFromText removes markdown");
    assert(!strippedOnly.includes("centralmotorsrtb"), "stripWhatsAppImageUrlsFromText removes CM URLs");

    const noPlan = buildVehicleOutboundPlan({
        toolResults,
        llmReply,
        channel: "sms",
    });
    assert(noPlan === null, "Non-WhatsApp channel must not build vehicle media plan");

    const capped = buildVehicleOutboundPlan({
        toolResults: [
            {
                tool: "searchInventory",
                ok: true,
                vehicles: Array.from({ length: 5 }, (_, i) => ({
                    vehicleId: `v${i}`,
                    year: 2020,
                    make: "Toyota",
                    model: `Model${i}`,
                    images: [`https://example.com/${i}.jpg`],
                })),
            },
        ],
        llmReply: "Options",
        channel: "whatsapp",
    });
    assert(
        capped.vehicleCount === MAX_VEHICLE_IMAGES_PER_TURN,
        `Must cap at ${MAX_VEHICLE_IMAGES_PER_TURN} vehicles`
    );

    const prompt = buildWhatsAppSystemPrompt({ companyName: "Central Motors" });
    assert(prompt.includes(WHATSAPP_MEDIA_RULES.slice(0, 40)), "System prompt must include media rules");
    assert(prompt.includes("NEVER use markdown image syntax"), "Media rules must forbid markdown images");

    process.env.PHONE_NUMBER_ID = "test-phone-id";
    process.env.WHATSAPP_TOKEN = "test-token";
    delete process.env.WHATSAPP_DEV_MODE;

    let capturedPayload = null;
    const axios = (await import("axios")).default;
    const originalPost = axios.post.bind(axios);
    axios.post = async (url, body, config) => {
        capturedPayload = body;
        return { data: { messages: [{ id: "wamid.test.image" }] } };
    };

    await sendWhatsAppImage("27821234567", {
        link: "https://centralmotorsrtb.co.za/wp-content/uploads/fortuner.jpg",
        caption: "2019 Toyota Fortuner",
    });

    assert(capturedPayload?.type === "image", "Meta payload type must be image");
    assert(
        capturedPayload?.image?.link?.endsWith(".jpg"),
        "Meta payload must include image.link"
    );
    assert(capturedPayload?.image?.caption === "2019 Toyota Fortuner", "Meta payload must include caption");

    const seqResults = await sendWhatsAppMessagesSequential("27821234567", [
        { type: "text", text: "Hello" },
        {
            type: "image",
            link: "https://centralmotorsrtb.co.za/wp-content/uploads/hilux.png",
            caption: "Hilux",
        },
    ]);
    assert(Array.isArray(seqResults) && seqResults.length === 2, "Sequential send returns array of results");

    axios.post = originalPost;

    console.log("✓ buildVehicleOutboundPlan produces text + image parts");
    console.log("✓ Markdown and bare image URLs stripped from LLM reply");
    console.log("✓ Webp skipped; jpg/png hero images selected");
    console.log("✓ sendWhatsAppImage Meta payload shape verified (mocked)");
    console.log("✓ WHATSAPP_MEDIA_RULES included in system prompt");
    console.log("\nAll WhatsApp vehicle image checks passed.\n");
}

main().catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
});
