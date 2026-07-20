/**
 * Bootstrap event system — handlers, queue worker, graceful shutdown flush.
 */
import { registerAnalyticsEventHandler } from "./analyticsEventHandler.js";
import { registerAutomationEventHandler } from "./automationEventHandler.js";
import { dispatchEvent, markEventBusInitialized } from "./eventBus.js";
import { registerJobHandler, JOB_TYPES } from "../queue/jobQueue.js";
import { flushAnalytics } from "../analytics/analyticsEngine.js";

let bootstrapped = false;

export function initEventSystem() {
    if (bootstrapped) return;
    bootstrapped = true;

    registerAnalyticsEventHandler();
    registerAutomationEventHandler();

    registerJobHandler(JOB_TYPES.PROCESS_EVENT, async (job) => {
        if (job.event) await dispatchEvent(job.event);
    });

    process.on("beforeExit", () => {
        flushAnalytics().catch(() => {});
    });

    markEventBusInitialized();
    console.log("[events] Event system initialized");
}

export { publish } from "./eventBus.js";
export { EventTypes, createEvent } from "./eventTypes.js";
