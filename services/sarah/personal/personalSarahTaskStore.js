/**
 * U2 — Personal reminders/tasks (scheduler delivery in U8).
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import { PERSONAL_SARAH_COLLECTIONS } from "../../database/schema.js";
import {
    personalSarahDocRef,
    personalSarahCollectionRef,
    setDoc,
    getDocs,
    query,
    queryLimit,
    serverTimestamp,
    useAdminBackend,
} from "../../database/firestoreClient.js";

const memoryTasks = new Map();

function taskKey(uid, taskId) {
    return `${uid}:${taskId}`;
}

export async function createPersonalReminder(
    uid,
    {
        title,
        dueAt,
        notes = "",
        geoLat,
        geoLng,
        geoRadiusM,
        locationLabel,
        triggerMode,
    } = {}
) {
    if (!uid) throw Object.assign(new Error("uid required"), { status: 400 });
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
        throw Object.assign(new Error("Reminder title is required"), { status: 400, code: "TITLE_REQUIRED" });
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task = {
        id: taskId,
        userId: uid,
        type: "reminder",
        title: cleanTitle,
        dueAt: dueAt ? String(dueAt) : null,
        notes: String(notes || "").trim(),
        status: "scheduled",
        createdAt: Date.now(),
        ...(geoLat != null ? { geoLat: Number(geoLat) } : {}),
        ...(geoLng != null ? { geoLng: Number(geoLng) } : {}),
        ...(geoRadiusM != null ? { geoRadiusM: Number(geoRadiusM) } : {}),
        ...(locationLabel ? { locationLabel: String(locationLabel).trim() } : {}),
        ...(triggerMode ? { triggerMode: String(triggerMode).trim() } : {}),
    };

    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        memoryTasks.set(taskKey(uid, taskId), task);
        return task;
    }

    await setDoc(personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS, taskId), {
        ...task,
        createdAt: serverTimestamp(),
    });

    return task;
}

/**
 * @param {string} uid
 * @param {{ limit?: number }} [options]
 */
export async function listPersonalReminders(uid, { limit: cap = 50 } = {}) {
    if (!uid) return [];
    const limit = Math.min(Math.max(Number(cap) || 50, 1), 200);
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        const out = [];
        for (const [key, task] of memoryTasks.entries()) {
            if (!key.startsWith(`${uid}:`)) continue;
            out.push(task);
        }
        out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return out.slice(0, limit);
    }
    const col = personalSarahCollectionRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS);
    const snap = await getDocs(query(col, queryLimit(limit)));
    return snap.docs.map((d) => ({ id: d.id, userId: uid, ...d.data() }));
}

/**
 * @param {string} uid
 */
export async function listDuePersonalReminders(uid) {
    if (!uid) return [];
    const now = Date.now();
    const due = [];
    for (const [key, task] of memoryTasks.entries()) {
        if (!key.startsWith(`${uid}:`)) continue;
        if (task.status !== "scheduled" || !task.dueAt) continue;
        const at = Date.parse(task.dueAt);
        if (Number.isFinite(at) && at <= now) due.push(task);
    }
    return due;
}

/**
 * @param {string} uid
 * @param {string} taskId
 */
export async function markPersonalReminderFired(uid, taskId) {
    const task = memoryTasks.get(taskKey(uid, taskId));
    if (!task) return;
    task.status = "fired";
    task.firedAt = Date.now();
    memoryTasks.set(taskKey(uid, taskId), task);
}

/**
 * @param {string} uid
 * @param {object} body
 */
export async function createPersonalReminderFromApi(uid, body = {}) {
    return createPersonalReminder(uid, {
        title: body.title,
        dueAt: body.dueAt,
        notes: body.notes,
        geoLat: body.geoLat ?? body.lat,
        geoLng: body.geoLng ?? body.lng,
        geoRadiusM: body.geoRadiusM ?? body.radiusM,
        locationLabel: body.locationLabel,
        triggerMode: body.triggerMode,
    });
}
