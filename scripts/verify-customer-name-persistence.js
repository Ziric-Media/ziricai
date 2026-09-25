#!/usr/bin/env node
/**
 * Verify outbound message persistence never writes undefined customerName to Firestore.
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { saveOutboundMessage } from "../services/conversationService.js";
import { getTenantConversation } from "../services/storage/tenantStorage.js";

const COMPANY = "central-motors-rtb";
const PHONE = "27821112233";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    resetMemoryTenantStore();

    await saveOutboundMessage(PHONE, "Hello from Sarah", {
        companyId: COMPANY,
        channel: "whatsapp",
    });

    const conversation = await getTenantConversation(COMPANY, PHONE, "whatsapp");
    assert(conversation, "Conversation should be created");
    assert(conversation.customerName === PHONE, `Expected phone fallback name, got ${conversation.customerName}`);
    assert(conversation.customerName != null, "customerName must not be null/undefined");

    resetMemoryTenantStore();

    await saveOutboundMessage(PHONE, "Named reply", {
        companyId: COMPANY,
        channel: "whatsapp",
        customerName: "Thabo",
        contactName: "Thabo M",
    });

    const named = await getTenantConversation(COMPANY, PHONE, "whatsapp");
    assert(named?.customerName === "Thabo M", `contactName should win, got ${named?.customerName}`);

    console.log("✓ saveOutboundMessage never leaves customerName undefined");
    console.log("✓ contactName / customerName / phone fallback order verified");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
