/** Authoritative Educare pilot constants (EDU-00). */

export const EDUCARE_COMPANY_ID = "educare-christian-combined";

export const EDUCARE_CAMPUSES = Object.freeze([
    {
        id: "primary",
        name: "Primary Campus",
        kind: "primary",
        address: "25 Von Wielligh Street, Rustenburg, 2999",
        hours: "Mon–Fri 07:00–16:00",
        gradesText: "Preschool (3 months–4 years) and primary grades",
        phone: "+27 14 592 2854",
        email: "info@educarechristianschool.co.za",
    },
    {
        id: "secondary",
        name: "Secondary Campus",
        kind: "secondary",
        address: "155 Leyds Street, Rustenburg, 0299",
        hours: "Mon–Fri 07:00–16:00",
        gradesText: "Grades 8–12",
        phone: "+27 14 592 2854",
        email: "info@educarechristianschool.co.za",
    },
]);

export function defaultEducationSettings() {
    return {
        requireVerifiedGuardians: true,
        admissionsEnabled: true,
        industryTag: "education",
    };
}
