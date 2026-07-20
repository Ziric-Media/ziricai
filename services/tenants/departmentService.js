/**
 * Department service — org structure within a tenant.
 * Subcollection: companies/{companyId}/departments/{deptId}
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

class DepartmentService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.DEPARTMENTS);
    }
}

const deptService = new DepartmentService();

export const DEFAULT_DEPARTMENTS = [
    { name: "Sales", slug: "sales", description: "Revenue and lead conversion" },
    { name: "Support", slug: "support", description: "Customer support and service" },
    { name: "Operations", slug: "operations", description: "Day-to-day business operations" },
];

export async function listDepartments(companyId) {
    return deptService.list(companyId);
}

export async function getDepartment(companyId, deptId) {
    return deptService.get(companyId, deptId);
}

export async function createDepartment(companyId, data) {
    const slug =
        data.slug ||
        String(data.name || "dept")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    return deptService.create(
        companyId,
        {
            name: String(data.name || slug).trim(),
            slug,
            description: data.description || "",
            status: data.status || "active",
        },
        data.id || slug
    );
}

export async function updateDepartment(companyId, deptId, patch) {
    return deptService.update(companyId, deptId, patch);
}

export async function deleteDepartment(companyId, deptId) {
    return deptService.delete(companyId, deptId);
}

/** Seed Sales, Support, Operations on first provision. */
export async function seedDefaultDepartments(companyId) {
    const existing = await listDepartments(companyId);
    if (existing.length) return existing;

    const created = [];
    for (const dept of DEFAULT_DEPARTMENTS) {
        created.push(await createDepartment(companyId, dept));
    }
    return created;
}
