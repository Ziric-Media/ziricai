/**

 * Analytics — delegates to event bus for tenant-scoped tracking.

 */

import { publish } from "../events/eventBus.js";
import { EventTypes } from "../events/eventTypes.js";



const legacyEvents = [];



export async function recordEvent(name, payload = {}) {

    const event = {

        name,

        payload,

        recordedAt: new Date().toISOString(),

    };

    legacyEvents.push(event);

    if (legacyEvents.length > 500) legacyEvents.shift();

    console.log("[analytics]", name, payload.phone || payload.companyId || "");



    if (payload.companyId) {

        const typeMap = {

            message_processed: EventTypes.MESSAGE_RECEIVED,

            supervisor_review: null,

            inbound_message_processed: EventTypes.MESSAGE_RECEIVED,

        };

        const mapped = typeMap[name];

        if (mapped) {

            await publish(payload.companyId, mapped, payload).catch(() => {});

        }

    }



    return event;

}



export function getRecentEvents(limit = 50) {

    return legacyEvents.slice(-limit);

}



export { EventTypes, publish };

