import { registerTool } from "./toolRegistry.js";
import bookTestDrive from "./bookTestDrive.js";
import cancelTestDrive from "./cancelTestDrive.js";
import checkTestDriveAvailability from "./checkTestDriveAvailability.js";
import getCustomerBookings from "./getCustomerBookings.js";
import searchInventory from "./searchInventory.js";

let initialized = false;

const ALL_TOOLS = [
    searchInventory,
    checkTestDriveAvailability,
    bookTestDrive,
    getCustomerBookings,
    cancelTestDrive,
];

export function initAiTools() {
    if (initialized) return;
    for (const tool of ALL_TOOLS) {
        registerTool(tool);
    }
    initialized = true;
}

export { ALL_TOOLS };
export { registerTool, getTool, listTools, getOpenAIToolDefinitions } from "./toolRegistry.js";
export { runTool, buildIdempotencyKey } from "./toolRunner.js";
