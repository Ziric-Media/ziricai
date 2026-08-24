import { registerTool } from "./toolRegistry.js";
import bookTestDrive from "./bookTestDrive.js";
import checkTestDriveAvailability from "./checkTestDriveAvailability.js";
import searchInventory from "./searchInventory.js";

let initialized = false;

const ALL_TOOLS = [searchInventory, checkTestDriveAvailability, bookTestDrive];

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
