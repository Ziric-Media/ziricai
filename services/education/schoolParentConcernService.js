/**
 * EDU — parent concerns logged from Sarah App (verified guardians).
 */
import { randomUUID } from "node:crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getCompany } from "../tenants/companyService.js";
import { schoolRequiresVerifiedGuardians } from "./schoolGuardianService.js";

const auditRepo = new ServiceBase(TENANT_COLLECTIONS.GUARDIAN_AUDIT);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function concernRef() {
    return `EDU-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function uidConcern() {
    return `pconcern_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function requireSchool(companyId) {
    const company = await getCompany(companyId);
    if (!company) throw err(404, "NOT_FOUND", "School not found.");
    if (!schoolRequiresVerifiedGuardians(company)) {
        throw err(403, "NOT_EDUCATION_SCHOOL", "Parent concerns are only supported for school tenants.");
    }
    return company;
}

/**
 * @param {string} companyId
 * @param {string} parentUid
 * @param {object} input
 */
export async function logParentConcern(companyId, parentUid, input = {}) {
    if (!parentUid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    await requireSchool(companyId);

    const childName = String(input.childName || "").trim().slice(0, 120);
    const childGrade = String(input.childGrade || input.grade || "").trim().slice(0, 40);
    const category = String(input.category || "general").trim().slice(0, 60);
    const issue = String(input.issue || input.summary || "").trim().slice(0, 2000);
    const additional = String(input.additional || "").trim().slice(0, 2000);

    if (!childName || !issue) {
        throw err(422, "CONCERN_INCOMPLETE", "Child name and issue description are required before logging.");
    }

    const ts = new Date().toISOString();
    const reference = concernRef();
    const concernId = uidConcern();

    const record = {
        auditId: concernId,
        action: "parent_concern",
        concernId,
        reference,
        parentUid,
        childName,
        childGrade: childGrade || null,
        category,
        issue,
        additional: additional || null,
        status: "open",
        channel: String(input.channel || "sarah_app").slice(0, 40),
        escalatedAt: ts,
        createdAt: ts,
        updatedAt: ts,
        schemaVersion: 1,
    };

    await auditRepo.create(companyId, record, concernId);

    return {
        ok: true,
        success: true,
        reference,
        concernId,
        message: `Concern logged as ${reference}. School staff will follow up.`,
    };
}

/** Staff queue — recent open concerns */
export async function listParentConcernsForSchool(companyId, { status = "open", limit = 50 } = {}) {
    await requireSchool(companyId);
    const rows = (await auditRepo.list(companyId, { max: 500 })).filter((r) => r.action === "parent_concern");
    let out = rows;
    if (status) out = out.filter((r) => (r.status || "open") === status);
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return out.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200)).map((r) => ({
        concernId: r.concernId,
        reference: r.reference,
        status: r.status || "open",
        category: r.category,
        childName: r.childName,
        childGrade: r.childGrade,
        issue: r.issue,
        additional: r.additional,
        channel: r.channel,
        createdAt: r.createdAt,
        parentUidMasked: r.parentUid ? `parent_${String(r.parentUid).slice(-6)}` : null,
    }));
}