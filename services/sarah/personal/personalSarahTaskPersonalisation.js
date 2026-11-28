/**
 * ST-06 — task templates, completion learning, light routines.
 */
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import { personalSarahDocRef, setDoc, getDoc, useAdminBackend } from "../../database/firestoreClient.js";
import { createPersonalSarahTask } from "./personalSarahTaskStore.js";

const DOC_ID = "task_personalisation_v1";
const MAX_TEMPLATES = 24;

/** @type {Map<string, object>} */
const memoryPrefs = new Map();

function defaultPersonalisation() {
    return {
        templates: [],
        learning: { counts: {}, lastCompletedAt: {} },
        routines: [],
        updatedAt: null,
    };
}

function sanitizeTemplateInput(task) {
    return {
        title: String(task.title || "Task").trim().slice(0, 160),
        categoryId: task.categoryId || null,
        taskType: task.taskType || null,
        taskKind: task.taskKind || "preparation",
        notes: String(task.notes || "").trim().slice(0, 2000),
        checklist: Array.isArray(task.checklist)
            ? task.checklist.slice(0, 32).map((c) => ({ label: c.label, done: false }))
            : [],
        meta: task.meta && typeof task.meta === "object" ? { ...task.meta } : {},
    };
}

async function loadPersonalisation(uid) {
    if (!uid) return defaultPersonalisation();
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        return memoryPrefs.get(uid) || defaultPersonalisation();
    }
    const snap = await getDoc(personalSarahDocRef(uid, "memories", DOC_ID));
    if (!snap.exists()) return defaultPersonalisation();
    const data = snap.data() || {};
    return {
        ...defaultPersonalisation(),
        ...data,
        templates: Array.isArray(data.templates) ? data.templates : [],
        learning:
            data.learning && typeof data.learning === "object"
                ? { counts: data.learning.counts || {}, lastCompletedAt: data.learning.lastCompletedAt || {} }
                : { counts: {}, lastCompletedAt: {} },
    };
}

async function savePersonalisation(uid, data) {
    const row = { ...data, updatedAt: new Date().toISOString() };
    if (getConfiguredStorageBackend() === "memory" || !useAdminBackend()) {
        memoryPrefs.set(uid, row);
        return row;
    }
    await setDoc(personalSarahDocRef(uid, "memories", DOC_ID), row, { merge: true });
    return row;
}

/**
 * @param {string} uid
 */
export async function getTaskPersonalisation(uid) {
    const data = await loadPersonalisation(uid);
    const routines = buildRoutineHints(data.learning);
    return { ...data, routines };
}

function buildRoutineHints(learning) {
    const counts = learning?.counts || {};
    const entries = Object.entries(counts)
        .filter(([, n]) => Number(n) >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    return entries.map(([taskType, count]) => ({
        id: `routine-${taskType}`,
        taskType,
        label: taskType.replace(/_/g, " "),
        count,
        hint: `You've completed this ${count} times — quick start again?`,
    }));
}

/**
 * @param {string} uid
 * @param {object} task
 */
export async function recordTaskLearning(uid, task) {
    if (!uid || !task) return null;
    const done =
        task.status === "completed" ||
        task.lifecycleState === "completed" ||
        task.lifecycleState === "submitted_pending_external";
    if (!done) return null;
    const data = await loadPersonalisation(uid);
    const type = String(task.taskType || task.categoryId || "task");
    data.learning.counts[type] = (data.learning.counts[type] || 0) + 1;
    data.learning.lastCompletedAt[type] = new Date().toISOString();
    return savePersonalisation(uid, data);
}

/**
 * @param {string} uid
 * @param {object} task
 * @param {{ name?: string }} [opts]
 */
export async function saveTaskAsTemplate(uid, task, opts = {}) {
    if (!uid || !task) throw Object.assign(new Error("Task required"), { status: 400 });
    const data = await loadPersonalisation(uid);
    const base = sanitizeTemplateInput(task);
    const template = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...base,
        name: String(opts.name || base.title).trim().slice(0, 120),
        createdAt: new Date().toISOString(),
        useCount: 0,
        sourceTaskId: task.id,
    };
    data.templates = [template, ...(data.templates || [])].slice(0, MAX_TEMPLATES);
    await savePersonalisation(uid, data);
    return template;
}

/**
 * @param {string} uid
 * @param {string} templateId
 * @param {{ dueAt?: string|null, assignToSarah?: boolean }} [opts]
 */
export async function createTaskFromTemplate(uid, templateId, opts = {}) {
    const data = await loadPersonalisation(uid);
    const tpl = (data.templates || []).find((t) => t.id === templateId);
    if (!tpl) throw Object.assign(new Error("Template not found"), { status: 404, code: "TEMPLATE_NOT_FOUND" });
    tpl.useCount = (tpl.useCount || 0) + 1;
    await savePersonalisation(uid, data);
    return createPersonalSarahTask(uid, {
        title: tpl.title,
        categoryId: tpl.categoryId,
        taskType: tpl.taskType,
        taskKind: tpl.taskKind,
        notes: tpl.notes,
        checklist: tpl.checklist,
        meta: { ...(tpl.meta || {}), fromTemplateId: tpl.id },
        dueAt: opts.dueAt || null,
    });
}

/**
 * @param {string} uid
 * @param {string} taskType
 */
export async function createTaskFromRoutine(uid, taskType, opts = {}) {
    const data = await loadPersonalisation(uid);
    const match = (data.templates || []).find((t) => t.taskType === taskType);
    if (match) return createTaskFromTemplate(uid, match.id, opts);
    return createPersonalSarahTask(uid, {
        title: taskType.replace(/_/g, " "),
        taskType,
        categoryId: opts.categoryId || "preparation",
        taskKind: opts.taskKind || "preparation",
        dueAt: opts.dueAt || null,
        meta: { fromRoutine: taskType },
    });
}