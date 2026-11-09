/**
 * SmileMore client files. Visit history comes from the booking diary.
 * Next-step text is written by the practice. Nothing here is a diagnosis.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { normalizePhone } from "../customerService.js";
import { syncCustomerToTenant } from "../tenants/crmService.js";
import { assertDentalPracticeTenant, isDentalPracticeTenant } from "./assertDentalPracticeTenant.js";
import { emptyMedicalAid, normalizeMedicalAid } from "./dentalMedicalAid.js";

class DentalPatientService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.DENTAL_PATIENTS);
    }
}

const patients = new DentalPatientService();

function clean(value, max) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function dentalPatientId(phone) {
    return normalizePhone(phone);
}

export async function listDentalPatients(companyId) {
    await assertDentalPracticeTenant(companyId, "Client files are only available for dental-clinic tenants.");
    const items = await patients.list(companyId, { max: 300 });
    return items.sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
}

export async function getDentalPatient(companyId, phone) {
    await assertDentalPracticeTenant(companyId, "Client files are only available for dental-clinic tenants.");
    const id = dentalPatientId(phone);
    if (!id) return null;
    return patients.get(companyId, id);
}

export async function saveDentalPatient(companyId, phone, patch = {}) {
    await assertDentalPracticeTenant(companyId, "Client files are only available for dental-clinic tenants.");
    const id = dentalPatientId(phone || patch.phone);
    if (!id || id.length < 7) throw new Error("A phone number is required for the client file.");
    const existing = await patients.get(companyId, id);
    const fullName = clean(patch.fullName ?? existing?.fullName, 120);
    if (fullName.length < 2) throw new Error("A client name is required.");
    const idNumber = clean(patch.idNumber ?? existing?.idNumber, 20).replace(/\s/g, "");
    if (idNumber && !/^\d{13}$/.test(idNumber)) {
        throw new Error("A South African ID number must be 13 digits, or leave it blank.");
    }
    const dateOfBirth = clean(patch.dateOfBirth ?? existing?.dateOfBirth, 10);
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        throw new Error("Date of birth must be YYYY-MM-DD, or leave it blank.");
    }
    if (patch.paymentPreference === "medical_aid") {
        const aid = normalizeMedicalAid(patch.medicalAid || {});
        if (!aid.scheme || aid.scheme === "Private / cash") {
            throw new Error("Choose the medical aid scheme.");
        }
        if (!aid.membershipNumber) throw new Error("Membership number is required for medical aid.");
    }
    const record = {
        fullName,
        phone: id,
        email: clean(patch.email ?? existing?.email, 120),
        idNumber,
        dateOfBirth,
        nextStep: clean(patch.nextStep ?? existing?.nextStep, 500),
        notes: clean(patch.notes ?? existing?.notes, 1000),
        gender: ["male", "female"].includes(patch.gender) ? patch.gender : (existing?.gender || ""),
        address: clean(patch.address ?? existing?.address, 240),
        paymentPreference: ["cash", "medical_aid"].includes(patch.paymentPreference)
            ? patch.paymentPreference
            : (existing?.paymentPreference || ""),
        medicalAid: normalizeMedicalAid(patch.medicalAid ?? existing?.medicalAid),
        createdAt: existing?.createdAt || new Date().toISOString(),
    };
    const saved = existing
        ? await patients.update(companyId, id, record)
        : await patients.create(companyId, record, id);
    try {
        await syncCustomerToTenant(companyId, id, {
            name: fullName,
            phone: id,
            email: record.email || null,
            source: "dental-client-file",
        });
    } catch (err) {
        console.warn("[dental-patient] CRM link failed:", err.message);
    }
    return saved;
}

export async function ensureDentalPatient(companyId, { customerName, phone }) {
    if (!(await isDentalPracticeTenant(companyId))) return null;
    const id = dentalPatientId(phone);
    if (!id) return null;
    const existing = await patients.get(companyId, id);
    if (existing) return existing;
    return saveDentalPatient(companyId, id, { fullName: customerName, phone: id, medicalAid: emptyMedicalAid() });
}

