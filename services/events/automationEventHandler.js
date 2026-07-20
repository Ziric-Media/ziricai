/**
 * Wire automation engine to the event bus.
 */
import { subscribe } from "./eventBus.js";
import { handleEvent } from "../automation/automationEngine.js";

export function registerAutomationEventHandler() {
    subscribe("*", async (event) => {
        await handleEvent(event);
    });
    console.log("[events] Automation event handler registered");
}
