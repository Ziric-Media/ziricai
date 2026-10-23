/**
 * Test-drive appointment classification — explicit type first, conservative text heuristic second.
 */

const TEST_DRIVE_TYPE = "test_drive";

function normalizeType(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function isExplicitTestDriveType(value) {
    const norm = normalizeType(value);
    return norm === TEST_DRIVE_TYPE || norm === "testdrive";
}

/**
 * @param {object} appointment
 * @returns {boolean}
 */
export function isTestDriveAppointment(appointment) {
    if (!appointment || typeof appointment !== "object") return false;

    if (isExplicitTestDriveType(appointment.appointmentType)) return true;
    if (isExplicitTestDriveType(appointment.type)) return true;
    if (isExplicitTestDriveType(appointment.metadata?.appointmentType)) return true;
    if (isExplicitTestDriveType(appointment.metadata?.kind)) return true;

    const textFields = [appointment.service, appointment.title].filter(Boolean).map((s) => String(s).toLowerCase());

    for (const text of textFields) {
        if (/\btest[\s_-]?drive\b/.test(text)) return true;
    }

    return false;
}
