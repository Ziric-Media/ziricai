/**
 * EDU-03 — school learners, guardian links, verification queue.
 */
import { randomUUID } from "node:crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getCompany } from "../tenants/companyService.js";
import { getOrgEntityByCompanyId } from "../network/networkIdentityService.js";
import {
    applyConsumerAction,
    setConnectionPreferences,
    SUBSCRIBE_SCOPE,
} from "../network/connectionService.js";
import { createConsentGrant } from "../users/consentGrantService.js";

const learnerRepo = new ServiceBase(TENANT_COLLECTIONS.SCHOOL_LEARNERS);
const linkRepo = new ServiceBase(TENANT_COLLECTIONS.GUARDIAN_LINKS);
const auditRepo = new ServiceBase(TENANT_COLLECTIONS.GUARDIAN_AUDIT);

export const GUARDIAN_STATUS = Object.freeze({
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
});

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function schoolRequiresVerifiedGuardians(company) {
    if (!company) return false;
    if (company.settings?.education?.requireVerifiedGuardians === true) return true;
    return String(company.industry || "")
        .toLowerCase()
        .includes("education");
}

export async function schoolRequiresVerifiedGuardiansForCompany(companyId) {
    const company = await getCompany(companyId);
    return schoolRequiresVerifiedGuardians(company);
}

function uidLearner() {
    return `learner_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
function uidLink() {
    return `glink_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
function uidAudit() {
    return `gaudit_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * @param {string} companyId
 * @param {string} uid consumer
 * @param {{ learners: object[], relationship?: string, prefs?: object, competentPersonConsent?: boolean, parentName?: string, parentEmail?: string, parentPhone?: string }} input
 */
export async function submitGuardianApplication(companyId, uid, input = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const company = await getCompany(companyId);
    if (!company) throw err(404, "COMPANY_NOT_FOUND", "School not found.");
    if (!schoolRequiresVerifiedGuardians(company)) {
        throw err(422, "NOT_EDUCATION_SCHOOL", "This organisation does not use school guardian verification.");
    }
    if (input.competentPersonConsent !== true) {
        throw err(422, "CONSENT_REQUIRED", "Competent-person consent is required for children's information.");
    }
    const learners = Array.isArray(input.learners) ? input.learners : [];
    if (!learners.length || learners.length > 8) {
        throw err(422, "LEARNERS_INVALID", "Add between 1 and 8 learners.");
    }
  const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity?.snId) throw err(404, "ENTITY_NOT_FOUND", "School is not on Sarah Network yet.");

    const relationship = String(input.relationship || "parent").trim().slice(0, 40);
    const prefs = {
        notifications: input.prefs?.notifications !== false,
        announcements: input.prefs?.announcements !== false,
        reminders: input.prefs?.reminders !== false,
    };
    const applicationId = `gapp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const createdAt = new Date().toISOString();
    const createdLinks = [];

    for (const row of learners) {
        const name = String(row.name || "").trim();
        const grade = String(row.grade || "").trim();
        const campusId = String(row.campusId || "").trim();
        if (!name || name.length > 80) throw err(422, "LEARNER_NAME_INVALID", "Each learner needs a name.");
        if (!grade || grade.length > 40) throw err(422, "LEARNER_GRADE_INVALID", "Each learner needs a grade.");
        if (!campusId) throw err(422, "CAMPUS_REQUIRED", "Select a campus for each learner.");

        const learnerId = uidLearner();
        await learnerRepo.create(
            companyId,
            {
                learnerId,
                name,
                grade,
                campusId,
                admissionNo: String(row.admissionNo || "").trim().slice(0, 40) || null,
                applicationId,
                schemaVersion: 1,
                createdAt,
            },
            learnerId
        );

        const linkId = uidLink();
        const link = {
            linkId,
            applicationId,
            parentUid: uid,
            learnerId,
            relationship,
            campusId,
            status: GUARDIAN_STATUS.PENDING,
            prefs,
            parentName: String(input.parentName || "").trim().slice(0, 120) || null,
            parentEmail: String(input.parentEmail || "").trim().slice(0, 120) || null,
            parentPhone: String(input.parentPhone || "").trim().slice(0, 40) || null,
            competentPersonConsentAt: createdAt,
            schemaVersion: 1,
            createdAt,
            updatedAt: createdAt,
        };
        await linkRepo.create(companyId, link, linkId);
        createdLinks.push({ linkId, learnerId, status: link.status });
    }

    await auditRepo.create(
        companyId,
        {
            auditId: uidAudit(),
            action: "application_submitted",
            applicationId,
            parentUid: uid,
            linkIds: createdLinks.map((l) => l.linkId),
            actor: uid,
            actorRole: "parent",
            createdAt,
        }
    );

    return {
        applicationId,
        status: GUARDIAN_STATUS.PENDING,
        links: createdLinks,
        message: "Application received. School staff will verify your guardian relationship before communications activate.",
    };
}

/** @param {string} companyId @param {{ status?: string, limit?: number }} [opts] */
export async function listGuardianLinksForSchool(companyId, { status = "", limit = 100 } = {}) {
    const rows = await linkRepo.list(companyId, { max: 500 });
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const slice = out.slice(0, Math.min(Math.max(Number(limit) || 100, 1), 200));
    const learners = Object.fromEntries((await learnerRepo.list(companyId, { max: 500 })).map((l) => [l.learnerId, l]));
    return slice.map((link) => ({
        ...link,
        learner: learners[link.learnerId]
            ? { name: learners[link.learnerId].name, grade: learners[link.learnerId].grade, campusId: learners[link.learnerId].campusId }
            : null,
        parentUid: undefined,
        parentUidMasked: link.parentUid ? `parent_${String(link.parentUid).slice(-6)}` : null,
    }));
}

/** Parent — own links only. */
export async function listGuardianLinksForParent(companyId, uid) {
    const rows = (await linkRepo.list(companyId, { max: 200 })).filter((r) => r.parentUid === uid);
    const learners = Object.fromEntries((await learnerRepo.list(companyId, { max: 500 })).map((l) => [l.learnerId, l]));
    return rows.map((link) => ({
        linkId: link.linkId,
        status: link.status,
        relationship: link.relationship,
        campusId: link.campusId,
        prefs: link.prefs,
        learner: learners[link.learnerId] || null,
        rejectionReason: link.rejectionReason || null,
        updatedAt: link.updatedAt,
    }));
}

/**
 * @param {string} companyId
 * @param {string} linkId
 * @param {"approve"|"reject"} action
 * @param {string} actorUid staff
 * @param {{ reason?: string }} [opts]
 */
export async function decideGuardianLink(companyId, linkId, action, actorUid, opts = {}) {
    const link = await linkRepo.get(companyId, linkId);
    if (!link) throw err(404, "LINK_NOT_FOUND", "Guardian link not found.");
    if (link.status !== GUARDIAN_STATUS.PENDING) {
        throw err(409, "LINK_NOT_PENDING", "This application was already decided.");
    }
    const ts = new Date().toISOString();
    if (action === "reject") {
        const reason = String(opts.reason || "").trim().slice(0, 500) || "Not verified";
        await linkRepo.update(companyId, linkId, {
            status: GUARDIAN_STATUS.REJECTED,
            rejectionReason: reason,
            decidedBy: actorUid,
            decidedAt: ts,
            updatedAt: ts,
        });
        await auditRepo.create(companyId, {
            auditId: uidAudit(),
            action: "link_rejected",
            linkId,
            parentUid: link.parentUid,
            actor: actorUid,
            actorRole: "staff",
            reason,
            createdAt: ts,
        });
        return { linkId, status: GUARDIAN_STATUS.REJECTED };
    }
    if (action !== "approve") throw err(422, "ACTION_INVALID", "action must be approve or reject.");

    const entity = await getOrgEntityByCompanyId(companyId);
    const grant = createConsentGrant(link.parentUid, {
        scope: SUBSCRIBE_SCOPE,
        companyId,
        snId: entity.snId,
        disclosedFields: ["school_guardian_verification", "competent_person_consent"],
    });
    await applyConsumerAction(link.parentUid, entity.snId, "subscribe", { grantId: grant.grantId });
    if (link.prefs) await setConnectionPreferences(link.parentUid, entity.snId, link.prefs);

    await linkRepo.update(companyId, linkId, {
        status: GUARDIAN_STATUS.APPROVED,
        decidedBy: actorUid,
        decidedAt: ts,
        updatedAt: ts,
        consentGrantId: grant.grantId,
    });
    await auditRepo.create(companyId, {
        auditId: uidAudit(),
        action: "link_approved",
        linkId,
        parentUid: link.parentUid,
        actor: actorUid,
        actorRole: "staff",
        createdAt: ts,
    });
    return { linkId, status: GUARDIAN_STATUS.APPROVED };
}

/**
 * Approved guardian uids for comms audience (optionally campus-scoped).
 * @param {string} companyId
 * @param {string} [campusId]
 */
export async function listApprovedGuardianUids(companyId, campusId = "") {
    const rows = await linkRepo.list(companyId, { max: 5000 });
    const uids = new Set();
    for (const row of rows) {
        if (row.status !== GUARDIAN_STATUS.APPROVED) continue;
        if (campusId && row.campusId !== campusId) continue;
        if (row.parentUid) uids.add(row.parentUid);
    }
    return [...uids];
}
