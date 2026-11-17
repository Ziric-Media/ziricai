/**
 * Educare admissions — validation config (working draft).
 * Management can extend grade availability per academic year via company.settings.education.admissions.
 */

export const ADMISSION_PRIVACY_NOTICE_VERSION = "edu-admissions-v1";

export const APPLICATION_TYPES = Object.freeze([
    "new",
    "transfer_sa",
    "transfer_international",
    "grade_r",
    "sibling",
    "re_enrol",
]);

/** @type {Record<string, string[]>} */
export const DEFAULT_DOCUMENT_CHECKLIST = Object.freeze({
    new: ["birth_certificate", "latest_school_report", "guardian_id"],
    transfer_sa: ["birth_certificate", "latest_school_report", "transfer_records", "guardian_id"],
    transfer_international: ["birth_certificate", "latest_school_report", "guardian_id"],
    grade_r: ["birth_certificate", "guardian_id"],
    sibling: ["birth_certificate", "latest_school_report", "guardian_id"],
    re_enrol: ["guardian_id"],
});

export const DOCUMENT_LABELS = Object.freeze({
    birth_certificate: "Learner birth certificate or ID",
    latest_school_report: "Latest school report",
    transfer_records: "Transfer or leaving documentation",
    guardian_id: "Parent or guardian identification",
    support_report: "Educational or support report (if applicable)",
});

export const ADMISSION_STATUS = Object.freeze({
    DRAFT: "draft",
    AWAITING_PARENT_CONFIRMATION: "awaiting_parent_confirmation",
    SUBMITTED: "submitted",
    DOCUMENTS_PENDING: "documents_pending",
    UNDER_REVIEW: "under_review",
    ASSESSMENT_REQUIRED: "assessment_required",
    AWAITING_PARENT_INFORMATION: "awaiting_parent_information",
    PROVISIONAL_OFFER: "provisional_offer",
    ACCEPTED: "accepted",
    DECLINED: "declined",
    WAITLISTED: "waitlisted",
    WITHDRAWN: "withdrawn",
    CLOSED: "closed",
});

const TERMINAL = new Set([
    ADMISSION_STATUS.ACCEPTED,
    ADMISSION_STATUS.DECLINED,
    ADMISSION_STATUS.WITHDRAWN,
    ADMISSION_STATUS.CLOSED,
]);

/** Parent-editable statuses */
export const PARENT_EDITABLE = new Set([ADMISSION_STATUS.DRAFT, ADMISSION_STATUS.AWAITING_PARENT_CONFIRMATION]);

/** Staff workflow transitions (status -> allowed targets) */
export const STAFF_STATUS_TRANSITIONS = Object.freeze({
    [ADMISSION_STATUS.SUBMITTED]: [ADMISSION_STATUS.UNDER_REVIEW, ADMISSION_STATUS.DOCUMENTS_PENDING],
    [ADMISSION_STATUS.DOCUMENTS_PENDING]: [ADMISSION_STATUS.UNDER_REVIEW, ADMISSION_STATUS.AWAITING_PARENT_INFORMATION],
    [ADMISSION_STATUS.UNDER_REVIEW]: [
        ADMISSION_STATUS.ASSESSMENT_REQUIRED,
        ADMISSION_STATUS.AWAITING_PARENT_INFORMATION,
        ADMISSION_STATUS.PROVISIONAL_OFFER,
        ADMISSION_STATUS.DECLINED,
        ADMISSION_STATUS.WAITLISTED,
    ],
    [ADMISSION_STATUS.ASSESSMENT_REQUIRED]: [
        ADMISSION_STATUS.UNDER_REVIEW,
        ADMISSION_STATUS.PROVISIONAL_OFFER,
        ADMISSION_STATUS.DECLINED,
        ADMISSION_STATUS.WAITLISTED,
    ],
    [ADMISSION_STATUS.AWAITING_PARENT_INFORMATION]: [
        ADMISSION_STATUS.UNDER_REVIEW,
        ADMISSION_STATUS.DOCUMENTS_PENDING,
    ],
    [ADMISSION_STATUS.PROVISIONAL_OFFER]: [ADMISSION_STATUS.ACCEPTED, ADMISSION_STATUS.DECLINED, ADMISSION_STATUS.WITHDRAWN],
    [ADMISSION_STATUS.WAITLISTED]: [ADMISSION_STATUS.UNDER_REVIEW, ADMISSION_STATUS.PROVISIONAL_OFFER, ADMISSION_STATUS.DECLINED],
    [ADMISSION_STATUS.ACCEPTED]: [ADMISSION_STATUS.CLOSED],
    [ADMISSION_STATUS.DECLINED]: [ADMISSION_STATUS.CLOSED],
});

export function isTerminalStatus(status) {
    return TERMINAL.has(status);
}

/**
 * @param {object} company
 * @param {string} campusId
 * @param {string} grade
 */
function normalizeGradeToken(grade) {
    const g = String(grade).trim().toLowerCase().replace(/^grade\s*/, "");
    if (g === "r" || g === "grade r") return "r";
    const n = parseInt(g, 10);
    return Number.isFinite(n) ? String(n) : g;
}

export function companyCampusList(company) {
    return (
        company?.campuses ||
        company?.settings?.campuses ||
        company?.settings?.campusesPublic ||
        []
    );
}

export function gradeAllowedForCampus(company, campusId, grade) {
    const campuses = companyCampusList(company);
    if (!campuses.find((c) => c.id === campusId)) return false;

    const cfg = company?.settings?.education?.admissions;
    const list = cfg?.gradesByCampus?.[campusId];
    if (Array.isArray(list) && list.length) {
        const norm = normalizeGradeToken(grade);
        return list.some((g) => normalizeGradeToken(g) === norm);
    }

    const token = normalizeGradeToken(grade);
    if (campusId === "primary") {
        if (token === "r") return true;
        const n = parseInt(token, 10);
        return Number.isFinite(n) && n >= 0 && n <= 9;
    }
    if (campusId === "secondary") {
        const n = parseInt(token, 10);
        return Number.isFinite(n) && n >= 8 && n <= 12;
    }
    return token.length > 0;
}