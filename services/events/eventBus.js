/**
 * Event bus — publish/subscribe with async handlers.
 * Heavy handlers can be deferred via jobQueue (PROCESS_EVENT).
 */
import { createEvent } from "./eventTypes.js";
import { persistEvent } from "./eventStore.js";
import { enqueue, JOB_TYPES } from "../queue/jobQueue.js";

/** @type {Map<string, Set<Function>>} */
const subscribers = new Map();
/** @type {Set<Function>} */
const globalSubscribers = new Set();

let initialized = false;

export function subscribe(eventType, handler) {
    if (typeof handler !== "function") throw new Error("handler must be a function");
    if (eventType === "*") {
        globalSubscribers.add(handler);
        return () => globalSubscribers.delete(handler);
    }
    if (!subscribers.has(eventType)) subscribers.set(eventType, new Set());
    subscribers.get(eventType).add(handler);
    return () => subscribers.get(eventType)?.delete(handler);
}

async function invokeHandlers(event) {
    const handlers = [
        ...globalSubscribers,
        ...(subscribers.get(event.type) || []),
        ...(subscribers.get("*") || []),
    ];

    await Promise.allSettled(
        handlers.map(async (fn) => {
            try {
                await fn(event);
            } catch (err) {
                console.error("[eventBus] Handler error:", event.type, err.message);
            }
        })
    );
}

/**
 * Publish an event — persists then notifies handlers.
 * @param {string} companyId
 * @param {string} type
 * @param {object} [payload]
 * @param {object} [options]
 */
export async function publish(companyId, type, payload = {}, options = {}) {
    const event = createEvent(companyId, type, payload, options);
    await persistEvent(event);

    if (options.async === true) {
        enqueue({
            type: JOB_TYPES.PROCESS_EVENT,
            event,
        });
        return event;
    }

    await invokeHandlers(event);
    return event;
}

/**
 * Process a persisted event (used by job queue worker).
 * @param {import('./eventTypes.js').ZiricEvent} event
 */
export async function dispatchEvent(event) {
    await invokeHandlers(event);
    return event;
}

export function isEventBusInitialized() {
    return initialized;
}

export function markEventBusInitialized() {
    initialized = true;
}
