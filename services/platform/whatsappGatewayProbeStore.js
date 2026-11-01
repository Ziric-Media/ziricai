/**
 * G6 — In-memory probe history (production persistence: future platform collection).
 */
const MAX_EVENTS = 200;
/** @type {object[]} */
const events = [];

export function recordGatewayProbeEvent(event) {
    const row = {
        id: `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        recordedAt: new Date().toISOString(),
        ...event,
    };
    events.unshift(row);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    return row;
}

export function listGatewayProbeEvents({ companyId = null, phoneSuffix = null, limit = 20 } = {}) {
    let list = events;
    if (companyId) list = list.filter((e) => e.companyId === companyId);
    if (phoneSuffix) {
        list = list.filter((e) => String(e.phoneNumberIdSuffix || "") === String(phoneSuffix));
    }
    return list.slice(0, limit);
}

export function __clearGatewayProbeEventsForTests() {
    events.length = 0;
}
