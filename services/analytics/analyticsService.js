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



    // Do NOT remap message_processed / inbound_message_processed → MessageReceived.
    // Pipeline already publishes MessageReceived (with aiReplyPending). Remapping here
    // re-fires automations AFTER Sarah replies and caused duplicate "team member will
    // follow up" WhatsApp spam (Central Motors Service Reminder workflow).



    return event;

}



export function getRecentEvents(limit = 50) {

    return legacyEvents.slice(-limit);

}



export { EventTypes, publish };

