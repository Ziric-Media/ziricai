/**
 * Personal Sarah — Sarah Network tool helpers + listing.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import {
    resolveNetworkCompanyId,
    executePersonalSarahNetworkTool,
} from "../services/sarah/personal/personalSarahNetworkTools.js";
import { PERSONAL_SARAH_TOOL_DEFINITIONS } from "../services/sarah/personal/personalSarahTools.js";
import { EDUCARE_COMPANY_ID } from "../services/education/educareDefaults.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/storage/centralMotorsPilot.js";

assert.ok(
    PERSONAL_SARAH_TOOL_DEFINITIONS.some((t) => t.function.name === "listSarahNetworkOrganisations"),
    "list tool registered"
);
assert.ok(
    PERSONAL_SARAH_TOOL_DEFINITIONS.some((t) => t.function.name === "askCompanySarahOnNetwork"),
    "ask tool registered"
);

assert.equal(await resolveNetworkCompanyId({ companyName: "Educare" }), EDUCARE_COMPANY_ID);
assert.equal(await resolveNetworkCompanyId({ companyName: "Central Motors" }), CENTRAL_MOTORS_RTB_COMPANY_ID);
assert.equal(await resolveNetworkCompanyId({ companyId: "custom-co" }), "custom-co");

const list = await executePersonalSarahNetworkTool(
    "listSarahNetworkOrganisations",
    { uid: "u-net-1", preferredName: "Spencer" },
    { category: "education", limit: 5 }
);
assert.equal(list.success, true);
assert.ok(Array.isArray(list.data?.organisations));

console.log("personal-sarah-network-tools.test.mjs OK");