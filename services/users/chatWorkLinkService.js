/**
 * CH8 — Chat ↔ Work link stubs (MS-02 integration points).
 */
import { randomUUID } from "node:crypto";

/** @type {Map<string, object[]>} conversationId → links */
const links = new Map();

/**
 * @param {string} conversationId
 * @param {object} payload
 */
export function createChatWorkLink(conversationId, payload = {}) {
    const entry = {
        id: randomUUID(),
        conversationId,
        workItemId: payload.workItemId ? String(payload.workItemId) : null,
        bookingId: payload.bookingId ? String(payload.bookingId) : null,
        orderId: payload.orderId ? String(payload.orderId) : null,
        paymentId: payload.paymentId ? String(payload.paymentId) : null,
        appointmentId: payload.appointmentId ? String(payload.appointmentId) : null,
        linkType: payload.linkType ? String(payload.linkType) : "work",
        deepLink: payload.deepLink ? String(payload.deepLink).slice(0, 500) : null,
        label: payload.label ? String(payload.label).slice(0, 200) : "Linked work item",
        createdAt: new Date().toISOString(),
    };
    const list = links.get(conversationId) || [];
    list.push(entry);
    links.set(conversationId, list);
    return entry;
}

export function listChatWorkLinks(conversationId) {
    return links.get(conversationId) || [];
}

export function clearChatWorkLinksForTests() {
    links.clear();
}
