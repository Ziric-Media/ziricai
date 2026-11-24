/**
 * SNA-01H — location-triggered reminders (haversine fence).
 */
import { listPersonalReminders } from "./personalSarahTaskStore.js";
import { deliverDuePersonalReminders } from "./personalSarahReminderDelivery.js";
import { markPersonalReminderFired } from "./personalSarahTaskStore.js";
import { createSarahReminderDueNotification } from "../../network/notificationService.js";

function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * @param {string} uid
 * @param {{ lat: number, lng: number }} coords
 */
export async function deliverGeofenceReminders(uid, coords = {}) {
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    if (!uid || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { delivered: 0, items: [] };
    }
    const reminders = await listPersonalReminders(uid, { limit: 100 });
    const items = [];
    const now = Date.now();
    for (const task of reminders) {
        if (task.status !== "scheduled") continue;
        const tLat = Number(task.geoLat);
        const tLng = Number(task.geoLng);
        if (!Number.isFinite(tLat) || !Number.isFinite(tLng)) continue;
        const mode = task.triggerMode || "time";
        if (mode === "time") continue;
        const dueMs = task.dueAt ? Date.parse(task.dueAt) : null;
        if (dueMs != null && dueMs > now) continue;
        const radius = Math.min(5000, Math.max(50, Number(task.geoRadiusM) || 200));
        const dist = haversineM(lat, lng, tLat, tLng);
        if (dist > radius) continue;
        const loc = task.locationLabel ? ` · ${task.locationLabel}` : "";
        await createSarahReminderDueNotification(uid, {
            reminderId: task.id,
            title: task.title,
            body: (task.notes || task.title) + loc,
        });
        await markPersonalReminderFired(uid, task.id);
        items.push({ id: task.id, title: task.title, distanceM: Math.round(dist) });
    }
  // Also deliver time-based due (shared path)
    const timeDue = await deliverDuePersonalReminders(uid);
    return { delivered: items.length + timeDue.delivered, items: [...items, ...(timeDue.items || [])], geo: items.length };
}
