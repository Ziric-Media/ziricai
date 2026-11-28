/**
 * U2 / ST-02 — Personal Sarah tasks (reminders, preparation, execution metadata).
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import { PERSONAL_SARAH_COLLECTIONS } from "../../database/schema.js";
import {
    personalSarahDocRef,
    personalSarahCollectionRef,
    setDoc,
    getDoc,
    getDocs,
    query,
    queryLimit,
    serverTimestamp,
    useAdminBackend,
} from "../../database/firestoreClient.js";
import { assertConsumerSarahTaskAllowance } from "./personalSarahTaskAllowance.js";
import { isActiveReminderTask } from "./personalSarahReminderSlots.js";
import { syncPersonalSarahReminderSubscriber } from "./personalSarahReminderSubscriberIndex.js";

const memoryTasks = new Map();

function taskKey(uid, taskId) {
    return `${uid}:${taskId}`;
}

function checklistProgress(checklist) {
    const list = Array.isArray(checklist) ? checklist : [];
    if (!list.length) return 0;
    const done = list.filter((c) => c && c.done).length;
    return Math.round((100 * done) / list.length);
}

function sanitizeChecklist(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((c) => {
            if (typeof c === "string") return { label: c.trim(), done: false };
            if (!c || typeof c !== "object") return null;
            const label = String(c.label || "").trim();
            if (!label) return null;
            return { label, done: Boolean(c.done) };
        })
        .filter(Boolean);
}

function normalizeStatus(input, dueAt) {
    const s = String(input || "").toLowerCase();
    if (["open", "scheduled", "waiting", "completed", "cancelled", "fired", "dismissed"].includes(s)) {
        return s === "fired" ? "completed" : s;
    }
    return dueAt ? "scheduled" : "open";
}

/**
 * @param {string} uid
 * @param {object} body
 * @param {{ skipAllowance?: boolean }} [opts]
 */
export async function createPersonalSarahTask(uid, body = {}, opts = {}) {
    if (!uid) throw Object.assign(new Error("uid required"), { status: 400 });
    if (!opts.skipAllowance) await assertConsumerSarahTaskAllowance(uid);

    const cleanTitle = String(body.title || "").trim();
    if (!cleanTitle) {
        throw Object.assign(new Error("Task title is required"), { status: 400, code: "TITLE_REQUIRED" });
    }

    const taskKind = String(body.taskKind || "preparation").trim() || "preparation";
    const isReminder = taskKind === "reminder" || body.type === "reminder";
    const checklist = sanitizeChecklist(body.checklist);
    const dueAt = body.dueAt ? String(body.dueAt) : null;
    const progress = Number.isFinite(Number(body.progress))
        ? Math.min(100, Math.max(0, Number(body.progress)))
        : checklistProgress(checklist);

    const taskId = String(body.id || "").trim() || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task = {
        id: taskId,
        userId: uid,
        type: isReminder ? "reminder" : "task",
        taskKind,
        categoryId: body.categoryId ? String(body.categoryId) : null,
        taskType: body.taskType ? String(body.taskType) : null,
        title: cleanTitle,
        dueAt,
        notes: String(body.notes || "").trim(),
        status: normalizeStatus(body.status, dueAt),
        checklist,
        progress,
        reminderSchedule: Array.isArray(body.reminderSchedule) ? body.reminderSchedule.slice(0, 24) : [],
        firedScheduleKeys: [],
        lifecycleState: body.lifecycleState ? String(body.lifecycleState) : "assigned",
        sessionId: body.sessionId ? String(body.sessionId) : null,
        sarahPhase: body.sarahPhase ? String(body.sarahPhase) : "idle",
        planSummary: body.planSummary ? String(body.planSummary) : null,
        assignedAt: body.assignedAt || null,
        timeline: Array.isArray(body.timeline) ? body.timeline.slice(0, 24) : [],
        suggestions: Array.isArray(body.suggestions) ? body.suggestions.map(String).slice(0, 12) : [],
        artifacts: Array.isArray(body.artifacts) ? body.artifacts.slice(0, 8) : [],
        executionState: body.executionState && typeof body.executionState === "object" ? body.executionState : null,
        meta: body.meta && typeof body.meta === "object" ? body.meta : {},
        hiddenInList: Boolean(body.hiddenInList),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(body.geoLat != null ? { geoLat: Number(body.geoLat) } : {}),
        ...(body.geoLng != null ? { geoLng: Number(body.geoLng) } : {}),
        ...(body.geoRadiusM != null ? { geoRadiusM: Number(body.geoRadiusM) } : {}),
        ...(body.locationLabel ? { locationLabel: String(body.locationLabel).trim() } : {}),
        ...(body.triggerMode ? { triggerMode: String(body.triggerMode).trim() } : {}),
    };

    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        memoryTasks.set(taskKey(uid, taskId), task);
    } else {
        await setDoc(personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS, taskId), {
            ...task,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }
    if (isActiveReminderTask(task)) {
        await syncPersonalSarahReminderSubscriber(uid).catch(() => {});
    }
    return task;
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
    return createPersonalSarahTask(
        uid,
        {
            title,
            dueAt,
            notes,
            taskKind: "reminder",
            type: "reminder",
            status: "scheduled",
            geoLat,
            geoLng,
            geoRadiusM,
            locationLabel,
            triggerMode,
        },
        { skipAllowance: false }
    );
}

/**
 * @param {string} uid
 * @param {{ limit?: number }} [options]
 */
function listTasksMemory(uid, limit) {
    const out = [];
    for (const [key, task] of memoryTasks.entries()) {
        if (!key.startsWith(`${uid}:`)) continue;
        if (task.hiddenInList) continue;
        out.push(task);
    }
    out.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return out.slice(0, limit);
}

/**
 * @param {string} uid
 * @param {{ limit?: number, status?: string }} [options]
 */
export async function listPersonalSarahTasks(uid, { limit: cap = 50, status } = {}) {
    if (!uid) return [];
    const limit = Math.min(Math.max(Number(cap) || 50, 1), 200);
    let rows;
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        rows = listTasksMemory(uid, limit);
    } else {
        const col = personalSarahCollectionRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS);
        const snap = await getDocs(query(col, queryLimit(limit)));
        rows = snap.docs
            .map((d) => ({ id: d.id, userId: uid, ...d.data() }))
            .filter((t) => !t.hiddenInList);
    }
    if (status) {
        const want = String(status).toLowerCase();
        rows = rows.filter((t) => String(t.status || "").toLowerCase() === want);
    }
    return rows;
}

export async function getPersonalSarahTask(uid, taskId) {
    if (!uid || !taskId) return null;
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        return memoryTasks.get(taskKey(uid, taskId)) || null;
    }
    const snap = await getDoc(personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS, taskId));
    if (!snap.exists()) return null;
    return { id: snap.id, userId: uid, ...snap.data() };
}

const TASK_PATCH_KEYS = new Set([
    "title",
    "dueAt",
    "notes",
    "status",
    "checklist",
    "progress",
    "meta",
    "reminderSchedule",
    "firedScheduleKeys",
    "lifecycleState",
    "sessionId",
    "sarahPhase",
    "planSummary",
    "assignedAt",
    "categoryId",
    "taskType",
    "taskKind",
    "timeline",
    "suggestions",
    "artifacts",
    "executionState",
]);

export async function updatePersonalSarahTask(uid, taskId, patch = {}) {
    if (!uid || !taskId) throw Object.assign(new Error("task id required"), { status: 400 });
    const existing = await getPersonalSarahTask(uid, taskId);
    if (!existing) throw Object.assign(new Error("Task not found"), { status: 404, code: "TASK_NOT_FOUND" });

    const next = { ...existing, updatedAt: Date.now() };
    for (const [k, v] of Object.entries(patch || {})) {
        if (!TASK_PATCH_KEYS.has(k)) continue;
        if (k === "checklist") next.checklist = sanitizeChecklist(v);
        else if (k === "meta" && v && typeof v === "object") next.meta = { ...existing.meta, ...v };
        else next[k] = v;
    }
    if (patch.checklist) next.progress = checklistProgress(next.checklist);
    if (patch.dueAt !== undefined || patch.reminderSchedule !== undefined) {
        next.firedScheduleKeys = [];
    }
    if (patch.status === "completed" || patch.status === "cancelled") {
        next.completedAt = Date.now();
    }
    if (patch.dueAt !== undefined) next.dueAt = patch.dueAt ? String(patch.dueAt) : null;

    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        memoryTasks.set(taskKey(uid, taskId), next);
        if (isActiveReminderTask(next)) {
            await syncPersonalSarahReminderSubscriber(uid).catch(() => {});
        }
        return next;
    }

    await setDoc(
        personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.TASKS, taskId),
        { ...next, updatedAt: serverTimestamp() },
        { merge: true }
    );
    if (isActiveReminderTask(next)) {
        await syncPersonalSarahReminderSubscriber(uid).catch(() => {});
    }
    return next;
}

export async function listPersonalReminders(uid, { limit: cap = 50 } = {}) {
    const all = await listPersonalSarahTasks(uid, { limit: cap });
    return all.filter(
        (t) =>
            t.type === "reminder" ||
            t.taskKind === "reminder" ||
            (!t.taskKind && !t.categoryId && t.dueAt)
    );
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
    return markReminderScheduleSlotFired(uid, taskId, "__main__");
}

/**
 * @param {string} uid
 * @param {string} taskId
 * @param {string} slotKey
 */
export async function markReminderScheduleSlotFired(uid, taskId, slotKey) {
    if (!uid || !taskId || !slotKey) return null;
    const existing = await getPersonalSarahTask(uid, taskId);
    if (!existing) return null;
    const fired = [...(Array.isArray(existing.firedScheduleKeys) ? existing.firedScheduleKeys : [])];
    if (!fired.includes(slotKey)) fired.push(slotKey);
    const { futureSlotsRemaining } = await import("./personalSarahReminderSlots.js");
    const patch = { firedScheduleKeys: fired };
    if (!futureSlotsRemaining(existing, fired)) {
        const hasChecklist = Array.isArray(existing.checklist) && existing.checklist.length > 0;
        patch.status = hasChecklist ? "open" : "fired";
    }
    return updatePersonalSarahTask(uid, taskId, patch);
}

/**
 * @param {string} uid
 * @param {object} body
 */
export async function createPersonalReminderFromApi(uid, body = {}) {
    let dueAt = body.dueAt;
    try {
        const { resolveReminderDueAt } = await import("./personalSarahTools.js");
        const tz = String(body.timeZone || body.timezone || "Africa/Johannesburg").trim() || "Africa/Johannesburg";
        dueAt = resolveReminderDueAt(body.dueAt, {
            userMessage: body.dueAt || body.notes,
            title: body.title,
            timeZone: tz,
        });
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
