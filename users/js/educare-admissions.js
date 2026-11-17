/**
 * Educare Sarah App — admission application client (Stage 3).
 * Requires consumer auth token from SarahLive.getIdToken().
 */

export async function createEducareAdmissionDraft(companyId, token, payload) {
    const res = await fetch(`/api/education/v1/orgs/${encodeURIComponent(companyId)}/admission-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || "Could not start application");
    return json.data.application;
}

export async function submitEducareAdmission(companyId, token, applicationId, consent = true) {
    const res = await fetch(
        `/api/education/v1/orgs/${encodeURIComponent(companyId)}/admission-applications/${encodeURIComponent(applicationId)}/submit`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ consent }),
        }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json?.error?.message || "Submit failed");
    return json.data.application;
}

/** Sample Grade 4 primary application (synthetic demo). */
export function educareGrade4DemoPayload() {
    return {
        applicationType: "new",
        academicYear: String(new Date().getFullYear() + 1),
        gradeApplyingFor: "4",
        campusId: "primary",
        learner: {
            legalFirstName: "Demo",
            legalSurname: "Applicant",
            dateOfBirth: "2016-03-15",
            currentGrade: "3",
            previousSchool: "Example Primary (synthetic)",
        },
        guardian: {
            fullName: "Demo Guardian",
            mobile: "+27820000001",
            email: "demo.guardian@example.com",
            relationship: "parent",
        },
    };
}