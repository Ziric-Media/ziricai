/**
 * Practice-side medical-aid claim worksheets for SmileMore.
 * Marking a worksheet submitted records the practice's own action.
 * It does not contact a scheme, Healthbridge, or GoodX.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getAppointment } from "../tenants/appointmentService.js";
import { getDentalPatient } from "./dentalPatientService.js";
import { assertClaimTransition, medicalAidReady } from "./dentalMedicalAid.js";
import { assertDentalPracticeTenant } from "./assertDentalPracticeTenant.js";

class DentalClaimService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.DENTAL_CLAIMS);
    }
}

const claims = new DentalClaimService();

export async function listDentalClaims(companyId) {
    await assertDentalPracticeTenant(companyId, "Medical-aid worksheets are only available for dental-clinic tenants.");
    const items = await claims.list(companyId, { max: 300 });
    return items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function prepareDentalClaim(companyId, bookingId) {
    await assertDentalPracticeTenant(companyId, "Medical-aid worksheets are only available for dental-clinic tenants.");
    const booking = await getAppointment(companyId, bookingId);
    if (!booking) throw new Error("That booking is not on the diary.");
    if (String(booking.status || "") !== "completed") {
        throw new Error("Complete the visit on the diary before preparing a claim worksheet.");
    }
    const existing = await listDentalClaims(companyId);
    if (existing.some((item) => item.bookingId === bookingId && item.status !== "rejected")) {
        throw new Error("This visit already has a claim worksheet. Open it instead of creating another.");
    }
    const patient = await getDentalPatient(companyId, booking.phone || booking.customerId);
    const aid = patient?.medicalAid || {};
    if (!medicalAidReady(aid)) {
        throw new Error("Add the scheme, membership number, and dependant code from the card to the client file first. Private / cash visits are not claim worksheets.");
    }
    return claims.create(companyId, {
        patientId: patient.phone || patient.id,
        patientName: patient.fullName || booking.customerName,
        bookingId: booking.id,
        scheme: aid.scheme,
        option: aid.option || "",
        membershipNumber: aid.membershipNumber,
        dependantCode: aid.dependantCode,
        principalMemberName: aid.principalMemberName || "",
        relationship: aid.relationship || "",
        procedure: booking.service || "",
        visitAt: booking.scheduledAt || "",
        visitLabel: booking.scheduledLabel || "",
        locationLabel: booking.locationLabel || "",
        tariffCode: "",
        icd10: "",
        status: "draft",
        switchConnected: false,
        note: "",
    });
}

export async function updateDentalClaim(companyId, claimId, patch = {}) {
    await assertDentalPracticeTenant(companyId, "Medical-aid worksheets are only available for dental-clinic tenants.");
    const existing = await claims.get(companyId, claimId);
    if (!existing) throw new Error("That claim worksheet is not on file.");
    const next = {};
    if (patch.status) {
        const status = String(patch.status);
        assertClaimTransition(existing.status, status);
        if (status === "ready" && !existing.membershipNumber) {
            throw new Error("A worksheet needs the membership number before it can be marked ready.");
        }
        next.status = status;
        if (status === "submitted") next.submittedAt = new Date().toISOString();
    }
    if (patch.tariffCode != null) next.tariffCode = cleanCode(patch.tariffCode);
    if (patch.icd10 != null) next.icd10 = cleanCode(patch.icd10);
    if (patch.note != null) next.note = String(patch.note || "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!Object.keys(next).length) return existing;
    return claims.update(companyId, claimId, next);
}

function cleanCode(value) {
    return String(value || "").replace(/[^A-Za-z0-9./-]/g, "").slice(0, 20);
}
