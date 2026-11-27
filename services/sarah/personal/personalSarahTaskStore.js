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

function isTimeDuePersonalReminder(task, nowMs = Date.now()) {
    if (!task || task.status !== "scheduled" || !task.dueAt) return false;
    const mode = task.triggerMode || "time";
    if (mode === "geo") return false;
    const at = Date.parse(task.dueAt);
    return Number.isFinite(at) && at <= nowMs;
}

/**
 * @param {string} uid
 */
export async function listDuePersonalReminders(uid) {
    if (!uid) return [];
    const now = Date.now();

    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        const due = [];
        for (const [key, task] of memoryTasks.entries()) {
            if (!key.startsWith(`${uid}:`)) continue;
            if (isTimeDuePersonalReminder(task, now)) due.push(task);
        }
        return due;
    }

    const col = personalSarahCollectionRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS);
    const snap = await getDocs(query(col, queryLimit(200)));
    const due = [];
    for (const d of snap.docs) {
        const task = { id: d.id, userId: uid, ...d.data() };
        if (isTimeDuePersonalReminder(task, now)) due.push(task);
    }
    return due;
}

/**
 * @param {string} uid
 * @param {string} taskId
 */
export async function markPersonalReminderFired(uid, taskId) {
    if (!uid || !taskId) return;

    const key = taskKey(uid, taskId);
    const memTask = memoryTasks.get(key);
    if (memTask) {
        memTask.status = "fired";
        memTask.firedAt = Date.now();
        memoryTasks.set(key, memTask);
    }

    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) return;

    await setDoc(
        personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS, taskId),
        { status: "fired", firedAt: serverTimestamp() },
        { merge: true }
    );
}

/**
 * @param {string} uid
 * @param {object} body
 */
export async function createPersonalReminderFromApi(uid, body = {}) {
    let dueAt = body.dueAt;
    try {
        const { resolveReminderDueAt } = await import("./personalSarahTools.js");
        dueAt = resolveReminderDueAt(body.dueAt, { userMessage: body.dueAt || body.notes, title: body.title });
    } catch {
        /* keep raw */
    }
    return createPersonalReminder(uid, {
        title: body.title,
        dueAt,
        notes: body.notes,
        geoLat: body.geoLat ?? body.lat,
        geoLng: body.geoLng ?? body.lng,
        geoRadiusM: body.geoRadiusM ?? body.radiusM,
        locationLabel: body.locationLabel,
        triggerMode: body.triggerMode,
    });
}
