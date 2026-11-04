/**
 * U2 — Personal reminders/tasks (scheduler delivery in U8).
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import { PERSONAL_SARAH_COLLECTIONS } from "../../database/schema.js";
import { personalSarahDocRef, setDoc, serverTimestamp, useAdminBackend } from "../../database/firestoreClient.js";

const memoryTasks = new Map();

function taskKey(uid, taskId) {
    return `${uid}:${taskId}`;
}

export async function createPersonalReminder(uid, { title, dueAt, notes = "" } = {}) {
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
