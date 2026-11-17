/**
 * EDU Stage 3 — admission applications (draft, submit, track, staff review).
 */
import { randomUUID } from "node:crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getCompany } from "../tenants/companyService.js";
import { schoolRequiresVerifiedGuardians } from "./schoolGuardianService.js";
import {
    ADMISSION_PRIVACY_NOTICE_VERSION,
    ADMISSION_STATUS,
    APPLICATION_TYPES,
    DEFAULT_DOCUMENT_CHECKLIST,
    DOCUMENT_LABELS,
    PARENT_EDITABLE,
    STAFF_STATUS_TRANSITIONS,
    isTerminalStatus,
    gradeAllowedForCampus,
} from "./educareAdmissionConfig.js";

const appRepo = new ServiceBase(TENANT_COLLECTIONS.ADMISSION_APPLICATIONS);
const auditRepo = new ServiceBase(TENANT_COLLECTIONS.ADMISSION_AUDIT);

function err(status, code, message, extra = {}) {
    return Object.assign(new Error(message), { status, code, ...extra });
}

function uidApp() {
    return `admapp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
function uidAudit() {
    return `admaudit_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function refCode(year) {
    const y = String(year || new Date().getFullYear()).slice(-2);
    const tail = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    return `ADM-${y}-${tail}`;
}

export function schoolAdmissionsEnabled(company) {
    if (!schoolRequiresVerifiedGuardians(company)) return false;
    if (company?.settings?.education?.admissionsEnabled === false) return false;
    return true;
}

async function requireAdmissionsSchool(companyId) {
    const company = await getCompany(companyId);
    if (!company) throw err(404, "COMPANY_NOT_FOUND", "School not found.");
    if (!schoolAdmissionsEnabled(company)) {
        throw err(422, "ADMISSIONS_DISABLED", "Admissions are not enabled for this school.");
    }
    return company;
}

async function audit(companyId, row) {
    await auditRepo.create(companyId, { auditId: uidAudit(), companyId, ...row, createdAt: row.createdAt || new Date().toISOString() });
}

function normalizeLearner(input = {}) {
    return {
        legalFirstName: String(input.legalFirstName || input.firstName || "").trim().slice(0, 80),
        legalSurname: String(input.legalSurname || input.surname || "").trim().slice(0, 80),
        preferredName: String(input.preferredName || "").trim().slice(0, 80) || null,
        dateOfBirth: String(input.dateOfBirth || "").trim().slice(0, 16),
        currentGrade: String(input.currentGrade || "").trim().slice(0, 40) || null,
        previousSchool: String(input.previousSchool || "").trim().slice(0, 200) || null,
        lastGradeCompleted: String(input.lastGradeCompleted || "").trim().slice(0, 40) || null,
    };
}

function normalizeGuardian(input = {}) {
    return {
        fullName: String(input.fullName || input.name || "").trim().slice(0, 120),
        relationship: String(input.relationship || "parent").trim().slice(0, 40),
        mobile: String(input.mobile || input.phone || "").trim().slice(0, 40) || null,
        email: String(input.email || "").trim().slice(0, 120) || null,
        address: String(input.address || "").trim().slice(0, 300) || null,
        isLegalGuardian: input.isLegalGuardian !== false,
        preferredContact: String(input.preferredContact || "mobile").trim().slice(0, 20),
    };
}

function buildDocumentChecklist(applicationType) {
    const types = DEFAULT_DOCUMENT_CHECKLIST[applicationType] || DEFAULT_DOCUMENT_CHECKLIST.new;
    return types.map((type) => ({
        docId: `doc_${type}`,
        type,
        label: DOCUMENT_LABELS[type] || type,
        status: "outstanding",
        fileName: null,
        registeredAt: null,
        staffNote: null,
    }));
}

function validateDob(dob) {
    if (!dob) return false;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() <= Date.now();
}

function validateSubmitPayload(app) {
    const missing = [];
    if (!app.learner?.legalFirstName) missing.push("learner.legalFirstName");
    if (!app.learner?.legalSurname) missing.push("learner.legalSurname");
    if (!validateDob(app.learner?.dateOfBirth)) missing.push("learner.dateOfBirth");
    if (!app.gradeApplyingFor) missing.push("gradeApplyingFor");
    if (!app.campusId) missing.push("campusId");
    if (!app.academicYear) missing.push("academicYear");
    if (!app.guardian?.fullName) missing.push("guardian.fullName");
    if (!app.guardian?.mobile && !app.guardian?.email) missing.push("guardian.mobile_or_email");
    if (app.consent?.privacyNoticeVersion !== ADMISSION_PRIVACY_NOTICE_VERSION) missing.push("consent.privacyNoticeVersion");
    if (!app.consent?.confirmedAt) missing.push("consent.confirmedAt");
    if (missing.length) {
        throw err(422, "VALIDATION_FAILED", "Complete required fields before submitting.", { fields: missing });
    }
}

/** Detect possible duplicate — flag only, no merge. */
async function findPossibleDuplicate(companyId, app) {
    const rows = await appRepo.list(companyId, { max: 2000 });
    const dob = app.learner?.dateOfBirth;
    const grade = app.gradeApplyingFor;
    const year = app.academicYear;
    const surname = (app.learner?.legalSurname || "").toLowerCase();
    const first = (app.learner?.legalFirstName || "").toLowerCase();
    for (const row of rows) {
        if (row.applicationId === app.applicationId) continue;
        if (isTerminalStatus(row.status) && row.status !== ADMISSION_STATUS.WITHDRAWN) continue;
        const r = row.learner || {};
        if (
            String(row.academicYear) === String(year) &&
            String(row.gradeApplyingFor) === String(grade) &&
            String(r.dateOfBirth) === String(dob) &&
            String(r.legalSurname || "").toLowerCase() === surname &&
            String(r.legalFirstName || "").toLowerCase() === first
        ) {
            return row.applicationId;
        }
    }
    return null;
}

function publicSummary(app) {
    return {
        applicationId: app.applicationId,
        reference: app.reference,
        status: app.status,
        applicationType: app.applicationType,
        academicYear: app.academicYear,
        gradeApplyingFor: app.gradeApplyingFor,
        campusId: app.campusId,
        learner: {
            legalFirstName: app.learner?.legalFirstName,
            legalSurname: app.learner?.legalSurname,
            preferredName: app.learner?.preferredName,
            dateOfBirth: app.learner?.dateOfBirth,
            currentGrade: app.learner?.currentGrade,
        },
        documents: (app.documents || []).map((d) => ({
            docId: d.docId,
            type: d.type,
            label: d.label,
            status: d.status,
        })),
        submittedAt: app.submittedAt || null,
        updatedAt: app.updatedAt,
        duplicateReviewFlag: app.duplicateReviewFlag || false,
        possibleDuplicateOf: app.possibleDuplicateOf || null,
        decision: app.decision
            ? { outcome: app.decision.outcome, decidedAt: app.decision.decidedAt }
            : null,
    };
}

/**
 * @param {string} companyId
 * @param {string} parentUid
 * @param {object} input
 */
export async function createAdmissionDraft(companyId, parentUid, input = {}) {
    if (!parentUid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const company = await requireAdmissionsSchool(companyId);

    const applicationType = APPLICATION_TYPES.includes(input.applicationType)
        ? input.applicationType
        : "new";
    const academicYear = String(input.academicYear || new Date().getFullYear() + 1).trim().slice(0, 8);
    const gradeApplyingFor = String(input.gradeApplyingFor || "").trim().slice(0, 40);
    const campusId = String(input.campusId || "").trim();
    if (campusId && gradeApplyingFor && !gradeAllowedForCampus(company, campusId, gradeApplyingFor)) {
        throw err(422, "GRADE_CAMPUS_MISMATCH", "This grade is not configured for the selected campus.");
    }

    const ts = new Date().toISOString();
    const applicationId = uidApp();
    const app = {
        applicationId,
        reference: refCode(academicYear),
        companyId,
        parentUid,
        status: ADMISSION_STATUS.DRAFT,
        applicationType,
        academicYear,
        gradeApplyingFor,
        campusId,
        learner: normalizeLearner(input.learner || {}),
        guardian: normalizeGuardian({
            ...input.guardian,
            fullName: input.guardian?.fullName || input.parentName,
            email: input.guardian?.email || input.parentEmail,
            mobile: input.guardian?.mobile || input.parentPhone,
        }),
        emergencyContact: input.emergencyContact || null,
        documents: buildDocumentChecklist(applicationType),
        consent: {
            privacyNoticeVersion: null,
            confirmedAt: null,
            confirmedByUid: null,
        },
        reviewNotes: [],
        decision: null,
        assignedOfficerUid: null,
        duplicateReviewFlag: false,
        possibleDuplicateOf: null,
        schemaVersion: 1,
        createdAt: ts,
        updatedAt: ts,
        submittedAt: null,
    };

    await appRepo.create(companyId, app, applicationId);
    await audit(companyId, {
        action: "draft_created",
        applicationId,
        reference: app.reference,
        actor: parentUid,
        actorRole: "parent",
    });
    return publicSummary(app);
}

export async function getAdmissionForParent(companyId, parentUid, applicationId) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app || app.parentUid !== parentUid) throw err(404, "NOT_FOUND", "Application not found.");
    return publicSummary(app);
}

export async function listAdmissionsForParent(companyId, parentUid) {
    await requireAdmissionsSchool(companyId);
    const rows = (await appRepo.list(companyId, { max: 100 })).filter((r) => r.parentUid === parentUid);
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return rows.map(publicSummary);
}

/**
 * @param {string} companyId
 * @param {string} parentUid
 * @param {string} applicationId
 * @param {object} patch
 */
export async function updateAdmissionDraft(companyId, parentUid, applicationId, patch = {}) {
    const company = await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app || app.parentUid !== parentUid) throw err(404, "NOT_FOUND", "Application not found.");
    if (!PARENT_EDITABLE.has(app.status)) {
        throw err(409, "NOT_EDITABLE", "This application can no longer be edited online.");
    }

    const ts = new Date().toISOString();
    const next = { ...app, updatedAt: ts };
    if (patch.applicationType && APPLICATION_TYPES.includes(patch.applicationType)) {
        next.applicationType = patch.applicationType;
        if (!patch.documents) next.documents = buildDocumentChecklist(patch.applicationType);
    }
    if (patch.academicYear) next.academicYear = String(patch.academicYear).trim().slice(0, 8);
    if (patch.gradeApplyingFor) next.gradeApplyingFor = String(patch.gradeApplyingFor).trim().slice(0, 40);
    if (patch.campusId) next.campusId = String(patch.campusId).trim();
    if (patch.learner) {
        const ln = normalizeLearner(patch.learner);
        next.learner = { ...(next.learner || {}) };
        for (const [k, v] of Object.entries(ln)) {
            if (v !== null && v !== "") next.learner[k] = v;
        }
    }
    if (patch.guardian) {
        const gn = normalizeGuardian(patch.guardian);
        next.guardian = { ...(next.guardian || {}) };
        for (const [k, v] of Object.entries(gn)) {
            if (v !== null && v !== "") next.guardian[k] = v;
        }
    }
    if (patch.emergencyContact) next.emergencyContact = patch.emergencyContact;

    if (next.campusId && next.gradeApplyingFor && !gradeAllowedForCampus(company, next.campusId, next.gradeApplyingFor)) {
        throw err(422, "GRADE_CAMPUS_MISMATCH", "This grade is not configured for the selected campus.");
    }

    await appRepo.update(companyId, applicationId, next);
    await audit(companyId, { action: "draft_updated", applicationId, actor: parentUid, actorRole: "parent" });
    return publicSummary(next);
}

/**
 * Register document metadata (no binary upload in v1 — fileName + optional storageRef).
 */
export async function registerAdmissionDocument(companyId, parentUid, applicationId, input = {}) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app || app.parentUid !== parentUid) throw err(404, "NOT_FOUND", "Application not found.");
    if (!PARENT_EDITABLE.has(app.status) && app.status !== ADMISSION_STATUS.DOCUMENTS_PENDING) {
        throw err(409, "NOT_EDITABLE", "Documents cannot be added at this stage.");
    }

    const type = String(input.type || "").trim();
    const fileName = String(input.fileName || "").trim().slice(0, 200);
    if (!type || !fileName) throw err(422, "DOCUMENT_INVALID", "Document type and file name are required.");

    const ts = new Date().toISOString();
    const documents = [...(app.documents || [])];
    let doc = documents.find((d) => d.type === type);
    if (!doc) {
        doc = {
            docId: `doc_${type}`,
            type,
            label: DOCUMENT_LABELS[type] || type,
            status: "received",
            fileName,
            storageRef: input.storageRef || null,
            registeredAt: ts,
            staffNote: null,
        };
        documents.push(doc);
    } else {
        doc.status = "received";
        doc.fileName = fileName;
        doc.storageRef = input.storageRef || doc.storageRef;
        doc.registeredAt = ts;
    }

    await appRepo.update(companyId, applicationId, { documents, updatedAt: ts });
    await audit(companyId, { action: "document_registered", applicationId, type, actor: parentUid, actorRole: "parent" });
    return publicSummary({ ...app, documents, updatedAt: ts });
}

/**
 * @param {string} companyId
 * @param {string} parentUid
 * @param {string} applicationId
 * @param {{ consent: boolean, privacyNoticeVersion?: string }} input
 */
export async function submitAdmissionApplication(companyId, parentUid, applicationId, input = {}) {
    const company = await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app || app.parentUid !== parentUid) throw err(404, "NOT_FOUND", "Application not found.");
    if (app.status !== ADMISSION_STATUS.DRAFT && app.status !== ADMISSION_STATUS.AWAITING_PARENT_CONFIRMATION) {
        throw err(409, "ALREADY_SUBMITTED", "This application was already submitted or closed.");
    }
    if (input.consent !== true) throw err(422, "CONSENT_REQUIRED", "Confirm the privacy notice before submitting.");

    const ts = new Date().toISOString();
    const withConsent = {
        ...app,
        consent: {
            privacyNoticeVersion: ADMISSION_PRIVACY_NOTICE_VERSION,
            confirmedAt: ts,
            confirmedByUid: parentUid,
        },
    };
    validateSubmitPayload(withConsent);

    const duplicateId = await findPossibleDuplicate(companyId, withConsent);
    const outstanding = (withConsent.documents || []).some((d) => d.status === "outstanding");
    const status = outstanding ? ADMISSION_STATUS.DOCUMENTS_PENDING : ADMISSION_STATUS.SUBMITTED;

    const patch = {
        status,
        consent: withConsent.consent,
        submittedAt: ts,
        updatedAt: ts,
        duplicateReviewFlag: Boolean(duplicateId),
        possibleDuplicateOf: duplicateId,
    };

    await appRepo.update(companyId, applicationId, patch);
    await audit(companyId, {
        action: "application_submitted",
        applicationId,
        reference: app.reference,
        status,
        duplicateReviewFlag: patch.duplicateReviewFlag,
        actor: parentUid,
        actorRole: "parent",
    });

    const fresh = await appRepo.get(companyId, applicationId);
    return publicSummary(fresh);
}

export async function withdrawAdmissionApplication(companyId, parentUid, applicationId) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app || app.parentUid !== parentUid) throw err(404, "NOT_FOUND", "Application not found.");
    if (isTerminalStatus(app.status)) throw err(409, "NOT_WITHDRAWABLE", "This application is already closed.");

    const ts = new Date().toISOString();
    await appRepo.update(companyId, applicationId, { status: ADMISSION_STATUS.WITHDRAWN, updatedAt: ts });
    await audit(companyId, { action: "application_withdrawn", applicationId, actor: parentUid, actorRole: "parent" });
    return { applicationId, status: ADMISSION_STATUS.WITHDRAWN };
}

function staffSummary(app) {
    return {
        ...publicSummary(app),
        guardian: app.guardian,
        emergencyContact: app.emergencyContact,
        reviewNotes: app.reviewNotes || [],
        assignedOfficerUid: app.assignedOfficerUid,
        parentUidMasked: app.parentUid ? `parent_${String(app.parentUid).slice(-6)}` : null,
        consent: app.consent,
    };
}

/** @param {string} companyId @param {{ status?: string, campusId?: string, academicYear?: string, limit?: number }} [opts] */
export async function listAdmissionsForSchool(companyId, opts = {}) {
    await requireAdmissionsSchool(companyId);
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
    let rows = await appRepo.list(companyId, { max: 2000 });
    if (opts.status) rows = rows.filter((r) => r.status === opts.status);
    if (opts.campusId) rows = rows.filter((r) => r.campusId === opts.campusId);
    if (opts.academicYear) rows = rows.filter((r) => String(r.academicYear) === String(opts.academicYear));
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const slice = rows.slice(0, limit);

    const counts = {};
    for (const r of rows) {
        counts[r.status] = (counts[r.status] || 0) + 1;
    }

    return { applications: slice.map(staffSummary), total: rows.length, countsByStatus: counts };
}

export async function getAdmissionForSchool(companyId, applicationId) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app) throw err(404, "NOT_FOUND", "Application not found.");
    return staffSummary(app);
}

/**
 * @param {string} companyId
 * @param {string} applicationId
 * @param {string} actorUid
 * @param {{ status: string, note?: string, assignedOfficerUid?: string }} input
 */
export async function staffTransitionAdmission(companyId, applicationId, actorUid, input = {}) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app) throw err(404, "NOT_FOUND", "Application not found.");

    const target = String(input.status || "").trim();
    const allowed = STAFF_STATUS_TRANSITIONS[app.status] || [];
    if (!allowed.includes(target)) {
        throw err(422, "TRANSITION_INVALID", `Cannot move from ${app.status} to ${target}.`);
    }

    const ts = new Date().toISOString();
    const reviewNotes = [...(app.reviewNotes || [])];
    if (input.note) {
        reviewNotes.push({ at: ts, by: actorUid, text: String(input.note).trim().slice(0, 2000) });
    }

    const patch = {
        status: target,
        reviewNotes,
        updatedAt: ts,
    };
    if (input.assignedOfficerUid) patch.assignedOfficerUid = String(input.assignedOfficerUid).trim().slice(0, 80);

    await appRepo.update(companyId, applicationId, patch);
    await audit(companyId, {
        action: "status_transition",
        applicationId,
        from: app.status,
        to: target,
        actor: actorUid,
        actorRole: "staff",
    });
    return staffSummary({ ...app, ...patch });
}

/**
 * Staff admission decision (authorised roles enforced at API layer).
 * @param {string} companyId
 * @param {string} applicationId
 * @param {string} actorUid
 * @param {{ outcome: string, notes?: string }} input
 */
export async function staffRecordAdmissionDecision(companyId, applicationId, actorUid, input = {}) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app) throw err(404, "NOT_FOUND", "Application not found.");

    const outcome = String(input.outcome || "").trim();
    const decisions = [
        ADMISSION_STATUS.PROVISIONAL_OFFER,
        ADMISSION_STATUS.ACCEPTED,
        ADMISSION_STATUS.DECLINED,
        ADMISSION_STATUS.WAITLISTED,
    ];
    if (!decisions.includes(outcome)) throw err(422, "DECISION_INVALID", "Invalid decision outcome.");

    const reviewable = [
        ADMISSION_STATUS.UNDER_REVIEW,
        ADMISSION_STATUS.ASSESSMENT_REQUIRED,
        ADMISSION_STATUS.DOCUMENTS_PENDING,
        ADMISSION_STATUS.PROVISIONAL_OFFER,
        ADMISSION_STATUS.WAITLISTED,
        ADMISSION_STATUS.SUBMITTED,
    ];
    if (!reviewable.includes(app.status) && app.status !== outcome) {
        throw err(409, "DECISION_NOT_ALLOWED", "Application is not in a state that allows this decision.");
    }

    const ts = new Date().toISOString();
    const decision = {
        outcome,
        notes: String(input.notes || "").trim().slice(0, 2000) || null,
        decidedBy: actorUid,
        decidedAt: ts,
    };

    await appRepo.update(companyId, applicationId, {
        status: outcome,
        decision,
        updatedAt: ts,
    });
    await audit(companyId, {
        action: "admission_decision",
        applicationId,
        outcome,
        actor: actorUid,
        actorRole: "staff",
    });
    return staffSummary({ ...app, status: outcome, decision, updatedAt: ts });
}

/**
 * Staff — mark document received / outstanding / rejected.
 */
export async function staffUpdateAdmissionDocument(companyId, applicationId, actorUid, input = {}) {
    await requireAdmissionsSchool(companyId);
    const app = await appRepo.get(companyId, applicationId);
    if (!app) throw err(404, "NOT_FOUND", "Application not found.");

    const type = String(input.type || "").trim();
    const status = String(input.status || "received").trim();
    if (!type) throw err(422, "DOCUMENT_INVALID", "Document type required.");

    const documents = [...(app.documents || [])];
    let doc = documents.find((d) => d.type === type);
    const ts = new Date().toISOString();
    if (!doc) {
        doc = {
            docId: `doc_${type}`,
            type,
            label: DOCUMENT_LABELS[type] || type,
            status,
            fileName: input.fileName || null,
            registeredAt: ts,
            staffNote: input.staffNote || null,
        };
        documents.push(doc);
    } else {
        doc.status = status;
        if (input.staffNote) doc.staffNote = String(input.staffNote).trim().slice(0, 500);
    }

    await appRepo.update(companyId, applicationId, { documents, updatedAt: ts });
    await audit(companyId, { action: "document_staff_update", applicationId, type, status, actor: actorUid, actorRole: "staff" });
    return staffSummary({ ...app, documents, updatedAt: ts });
}