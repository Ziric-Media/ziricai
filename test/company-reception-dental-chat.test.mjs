import test from "node:test";
import assert from "node:assert/strict";
import { getDentalOpenAIToolDefinitions } from "../services/sarah/company/companyReceptionDentalChat.js";
import { SMILEMORE_WHATSAPP_TOOL_NAMES } from "../services/dental/smilemorePractice.js";
import { LEGACY_SMILEMORE_COMPANY_ID } from "../services/dental/dentalIndustryPreset.js";
import { shouldRunDentalReceptionChat } from "../services/sarah/company/companyReceptionDentalChat.js";

test("dental Sarah App exposes diary booking tools", () => {
    const tools = getDentalOpenAIToolDefinitions();
    assert.equal(tools.length, SMILEMORE_WHATSAPP_TOOL_NAMES.length);
    for (const name of SMILEMORE_WHATSAPP_TOOL_NAMES) {
        assert.ok(tools.some((t) => t.function?.name === name), name);
    }
});

test("shouldRunDentalReceptionChat is true for legacy SmileMore tenant", async () => {
    assert.equal(await shouldRunDentalReceptionChat(LEGACY_SMILEMORE_COMPANY_ID), true);
    assert.equal(await shouldRunDentalReceptionChat("central-motors-demo"), false);
});