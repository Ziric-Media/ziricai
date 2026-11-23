/**
 * Sach Accounting — structured service requests + client profiles (tenant-scoped).
 */
import { randomUUID } from "node:crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getCompany, updateCompany } from "../tenants/companyService.js";
import { REQUEST_STATUSES, DOCUMENT_STATUSES, SACH_CONSULT_COMPANY_ID } from "./sachAccountingConfig.js";
import { isSachAccountingTenant } from "./sachAccountingIndustryPreset.js";
import { saveAppointmentRecord } from "../tenants/appointmentService.js";
import {
    buildInitialDocumentChecklist,
    getWorkflowPack,
    listWorkflowPackSummaries,
    suggestNextAction,
} from "./sachAccountingWorkflowPacks.js";

const requestRepo = new ServiceBase(TENANT_COLLECTIONS.SACH_SERVICE_REQUESTS);
const profileRepo = new ServiceBase(TENANT_COLLECTIONS.SACH_CLIENT_PROFILES);
const auditRepo = new ServiceBase(TENANT_COLLECTIONS.SACH_SERVICE_AUDIT);

function err(status, code, message, extra = {}) {
    return Object.assign(new Error(message), { status, code, ...extra });
}

function refCode() {
    const y = String(new Date().getFullYear()).slice(-2);
    const tail = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    return `SACH-${y}-${tail}`;
}

async function requirePractice(companyId) {
    const company = await getCompany(companyId);
    if (!company) throw err(404, "COMPANY_NOT_FOUND", "Company not found.");
    if (!isSachAccountingTenant(companyId, company)) {
        throw err(422, "PRACTICE_NOT_ENABLED", "Accounting practice mode is not enabled for this tenant.");
    }
    return company;
}

async function audit(companyId, row) {
    await auditRepo.create(companyId, {
        auditId: `sachaudit_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        companyId,
        ...row,
        createdAt: row.createdAt || new Date().toISOString(),
    });
}

function publicRequest(app) {
    return {
        requestId: app.requestId,
        reference: app.reference,
        status: app.status,
        categories: app.categories || [],
        serviceType: app.serviceType,
        reportingPeriod: app.reportingPeriod || null,
        urgency: app.urgency || "normal",
        summary: app.summary || "",
        business: app.business
            ? { legalName: app.business.legalName, tradingName: app.business.tradingName, cipcNumber: app.business.cipcNumber }
            : null,
        documents: (app.documents || []).map((d) => ({
            docId: d.docId,
            type: d.type,
            label: d.label,
            status: d.status,
        })),
        intakeAnswers: app.intakeAnswers || null,
        documentChecklist: app.documentChecklist || null,
        submittedAt: app.submittedAt || null,
        updatedAt: app.updatedAt,
        nextAction: app.nextAction || null,
    };
}

function staffRequest(app) {
    return {
        ...publicRequest(app),
        contact: app.contact,
        conversationSummary: app.conversationSummary,
        assignedDepartment: app.assignedDepartment,
        assignedEmployeeUid: app.assignedEmployeeUid,
        internalNotes: app.internalNotes || [],
        clientUid: app.clientUid,
    };
}

function applyPackDefaults(app, input = {}) {
    const pack = getWorkflowPack(input.serviceType || app.serviceType);
    if (!pack) return app;
    const next = { ...app };
    if (!next.categories?.length) next.categories = [...pack.categories];
    if (!next.assignedDepartment) next.assignedDepartment = pack.department;
    if (!next.documentChecklist?.length) {
        next.documentChecklist = buildInitialDocumentChecklist(pack);
    }
    if (input.intakeAnswers) {
        next.intakeAnswers = { ...(next.intakeAnswers || {}), ...input.intakeAnswers };
    }
    next.nextAction = suggestNextAction(pack, next.intakeAnswers || {}, next.documentChecklist);
    return next;
}

function syncChecklistFromUpload(checklist = [], documentType) {
    const key = String(documentType || "").trim();
    if (!key) return checklist;
    let touched = false;
    const next = checklist.map((row) => {
        if (row.docKey === key && row.status === "requested") {
            touched = true;
            return { ...row, status: "uploaded" };
        }
        return row;
    });
    return touched ? next : checklist;
}

export async function listWorkflowPacksForPractice(companyId) {
    await requirePractice(companyId);
    return listWorkflowPackSummaries();
}

export async function getWorkflowPackDetail(companyId, serviceType) {
    await requirePractice(companyId);
    const pack = getWorkflowPack(serviceType);
    if (!pack) throw err(404, "PACK_NOT_FOUND", "No workflow pack for this service type.");
    return pack;
}

export async function getClientProfile(companyId, clientUid) {
    await requirePractice(companyId);
    const row = await profileRepo.get(companyId, clientUid);
    return row || null;
}

export async function saveClientProfile(companyId, clientUid, patch = {}) {
    await requirePractice(companyId);
    const ts = new Date().toISOString();
    const existing = (await profileRepo.get(companyId, clientUid)) || { clientUid, companyId };
    const next = {
        ...existing,
        ...patch,
        clientUid,
        companyId,
        updatedAt: ts,
        createdAt: existing.createdAt || ts,
    };
    await profileRepo.upsert(companyId, clientUid, next);
    return next;
}

export async function createServiceRequestDraft(companyId, clientUid, input = {}) {
    await requirePractice(companyId);
    const ts = new Date().toISOString();
    const requestId = `sachreq_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    let app = {
        requestId,
        reference: refCode(),
        companyId,
        clientUid,
        status: "new",
        categories: input.categories || [],
        serviceType: input.serviceType || "consultation",
        reportingPeriod: input.reportingPeriod || null,
        urgency: input.urgency || "normal",
        summary: String(input.summary || "").slice(0, 2000),
        conversationSummary: String(input.conversationSummary || "").slice(0, 4000),
        business: input.business || null,
        contact: input.contact || null,
        intakeAnswers: input.intakeAnswers || {},
        documentChecklist: [],
        documents: [],
        assignedDepartment: input.assignedDepartment || null,
        assignedEmployeeUid: null,
        internalNotes: [],
        nextAction: input.nextAction || "Collect remaining information",
        submittedAt: null,
        createdAt: ts,
        updatedAt: ts,
    };
    app = applyPackDefaults(app, input);
    await requestRepo.create(companyId, app, requestId);
    await audit(companyId, { action: "request_created", requestId, reference: app.reference, actor: clientUid, actorRole: "client" });
    return publicRequest(app);
}

export async function updateServiceRequestDraft(companyId, clientUid, requestId, patch = {}) {
    await requirePractice(companyId);
    const app = await requestRepo.get(companyId, requestId);
    if (!app || app.clientUid !== clientUid) throw err(404, "NOT_FOUND", "Service request not found.");
    if (!["new", "information_required", "client_action_required"].includes(app.status)) {
        throw err(409, "NOT_EDITABLE", "This request can no longer be edited by the client.");
    }
    const ts = new Date().toISOString();
    const next = { ...app, updatedAt: ts };
    if (patch.categories) next.categories = patch.categories;
    if (patch.serviceType) next.serviceType = patch.serviceType;
    if (patch.reportingPeriod !== undefined) next.reportingPeriod = patch.reportingPeriod;
    if (patch.urgency) next.urgency = patch.urgency;
    if (patch.summary !== undefined) next.summary = String(patch.summary || "").slice(0, 2000);
    if (patch.conversationSummary !== undefined) next.conversationSummary = String(patch.conversationSummary || "").slice(0, 4000);
    if (patch.business) next.business = { ...(next.business || {}), ...patch.business };
    if (patch.contact) next.contact = { ...(next.contact || {}), ...patch.contact };
    if (patch.nextAction) next.nextAction = patch.nextAction;
    if (patch.intakeAnswers) {
        next.intakeAnswers = { ...(next.intakeAnswers || {}), ...patch.intakeAnswers };
    }
    if (patch.serviceType || patch.intakeAnswers) {
        const merged = applyPackDefaults(next, { serviceType: next.serviceType, intakeAnswers: next.intakeAnswers });
        next.categories = merged.categories;
        next.assignedDepartment = merged.assignedDepartment;
        next.documentChecklist = merged.documentChecklist;
        next.nextAction = patch.nextAction || merged.nextAction;
    }
    await requestRepo.update(companyId, requestId, next);
    return publicRequest(next);
}

export async function submitServiceRequest(companyId, clientUid, requestId) {
    await requirePractice(companyId);
    const app = await requestRepo.get(companyId, requestId);
    if (!app || app.clientUid !== clientUid) throw err(404, "NOT_FOUND", "Service request not found.");
    const ts = new Date().toISOString();
    const status = "ready_for_review";
    await requestRepo.update(companyId, requestId, {
        status,
        submittedAt: ts,
        updatedAt: ts,
        nextAction: "Awaiting staff assignment",
    });
    await audit(companyId, { action: "request_submitted", requestId, actor: clientUid, actorRole: "client" });
    return publicRequest({ ...app, status, submittedAt: ts, updatedAt: ts });
}

export async function registerServiceDocument(companyId, clientUid, requestId, input = {}) {
    await requirePractice(companyId);
    const app = await requestRepo.get(companyId, requestId);
    if (!app || app.clientUid !== clientUid) throw err(404, "NOT_FOUND", "Service request not found.");
    const type = String(input.type || "other").trim();
    const label = String(input.label || input.fileName || type).trim().slice(0, 120);
    const ts = new Date().toISOString();
    const doc = {
        docId: `doc_${type}_${Date.now()}`,
        type,
        label,
        status: "uploaded",
        fileName: input.fileName || null,
        storageRef: input.storageRef || null,
        registeredAt: ts,
    };
    const documents = [...(app.documents || []), doc];
    const documentChecklist = syncChecklistFromUpload(app.documentChecklist || [], type);
    const pack = getWorkflowPack(app.serviceType);
    const nextAction =
        pack && documentChecklist.length
            ? suggestNextAction(pack, app.intakeAnswers || {}, documentChecklist)
            : app.nextAction;
    await requestRepo.update(companyId, requestId, {
        documents,
        documentChecklist,
        updatedAt: ts,
        status: "awaiting_documents",
        nextAction,
    });
    await audit(companyId, { action: "document_registered", requestId, type, actor: clientUid, actorRole: "client" });
    return publicRequest({
        ...app,
        documents,
        documentChecklist,
        nextAction,
        status: "awaiting_documents",
        updatedAt: ts,
    });
}

/** Most recent client-editable draft (status `new` etc.) for deduping chat saves. */
export async function findLatestEditableDraft(companyId, clientUid, { maxAgeMs = 4 * 60 * 60 * 1000 } = {}) {
    const list = await listServiceRequestsForClient(companyId, clientUid);
    const cutoff = Date.now() - maxAgeMs;
    const editable = list.filter((r) =>
        ["new", "information_required", "client_action_required"].includes(r.status)
    );
    const recent = editable.filter((r) => {
        const ts = Date.parse(r.updatedAt || r.createdAt || "");
        return Number.isFinite(ts) && ts >= cutoff;
    });
    recent.sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
    return recent[0] || null;
}

export async function listServiceRequestsForClient(companyId, clientUid) {
    await requirePractice(companyId);
    const rows = (await requestRepo.list(companyId, { max: 500 })).filter((r) => r.clientUid === clientUid);
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return rows.map(publicRequest);
}

export async function listServiceRequestsForStaff(companyId, opts = {}) {
    await requirePractice(companyId);
    let rows = await requestRepo.list(companyId, { max: 1000 });
    if (opts.status) rows = rows.filter((r) => r.status === opts.status);
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { requests: rows.map(staffRequest), total: rows.length };
}

export async function getServiceRequestForStaff(companyId, requestId) {
    await requirePractice(companyId);
    const app = await requestRepo.get(companyId, requestId);
    if (!app) throw err(404, "NOT_FOUND", "Service request not found.");
    return staffRequest(app);
}

export async function staffTransitionServiceRequest(companyId, requestId, actorUid, input = {}) {
    await requirePractice(companyId);
    const app = await requestRepo.get(companyId, requestId);
    if (!app) throw err(404, "NOT_FOUND", "Service request not found.");
    const status = String(input.status || "").trim();
    if (!REQUEST_STATUSES.includes(status)) throw err(422, "STATUS_INVALID", "Invalid status.");
    const ts = new Date().toISOString();
    const patch = {
        status,
        updatedAt: ts,
        ...(input.assignedDepartment ? { assignedDepartment: input.assignedDepartment } : {}),
        ...(input.assignedEmployeeUid ? { assignedEmployeeUid: input.assignedEmployeeUid } : {}),
        ...(input.nextAction ? { nextAction: String(input.nextAction).slice(0, 500) } : {}),
    };
    if (input.note) {
        patch.internalNotes = [
            ...(app.internalNotes || []),
            { at: ts, by: actorUid, note: String(input.note).slice(0, 2000) },
        ];
    }
    await requestRepo.update(companyId, requestId, patch);
    await audit(companyId, { action: "staff_transition", requestId, status, actor: actorUid, actorRole: "staff" });
    return staffRequest({ ...app, ...patch });
}

export async function bookConsultationForClient(companyId, clientUid, input = {}) {
    await requirePractice(companyId);
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null;
    const record = await saveAppointmentRecord(companyId, {
        appointmentType: "sach_consultation",
        bookingKind: "professional_services",
        status: "requested",
        customerName: String(input.clientName || input.contactName || "").trim(),
        phone: String(input.phone || "").trim(),
        email: String(input.email || "").trim(),
        service: String(input.consultationType || "general_accounting"),
        serviceId: String(input.consultationType || "general_accounting"),
        scheduledAt,
        scheduledLabel: input.scheduledLabel || input.preferredSlot || null,
        channel: "sarah_app",
        source: "sarah_app",
        notes: String(input.matterSummary || "").slice(0, 500),
        customerId: clientUid,
    });
    return {
        appointmentId: record.id,
        status: record.status,
        scheduledAt: record.scheduledAt,
        message: "Consultation request recorded — Sach staff will confirm the appointment.",
    };
}

/** Enable practice flag on existing Sach tenant (idempotent). */
export async function ensureSachAccountingTenantSettings(companyId = SACH_CONSULT_COMPANY_ID) {
    const company = await getCompany(companyId);
    if (!company) throw err(404, "NOT_FOUND", "Company not found.");
    await updateCompany(companyId, {
        settings: {
            ...(company.settings || {}),
            accountingPractice: { enabled: true, version: 1 },
        },
    });
    return { companyId, accountingPractice: true };
}