/**
 * Wire analytics aggregation to the event bus.
 */
import { subscribe } from "./eventBus.js";
import { ingestEvent } from "../analytics/analyticsEngine.js";

export function registerAnalyticsEventHandler() {
    subscribe("*", async (event) => {
        await ingestEvent(event);
    });
    console.log("[events] Analytics event handler registered");
}
