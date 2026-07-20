/**
 * Seed tenant-scoped customer ops demo data (appointments, leads) for memory backend.
 */
import { createAppointment } from "../tenants/appointmentService.js";
import { createLead } from "../tenants/crmService.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { DEMO_COMPANY_ID, shouldSeedDemoData } from "../core/dataMode.js";

export async function seedCustomerOpsDemoIfEmpty() {
    if (!shouldSeedDemoData(DEMO_COMPANY_ID)) {
        return { seeded: false, reason: "demo seed disabled (set DEMO_SEED=true or use demo tenant)" };
    }

    const adapter = await getStorageAdapter();
    if (adapter.name !== "memory") return { seeded: false, reason: "not memory backend" };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);

    try {
        await createLead(DEMO_COMPANY_ID, {
            id: "lead-web-demo",
            name: "James K.",
            phone: "27821112233",
            leadScore: 78,
            stage: "qualified",
            source: "webchat",
            topic: "Test drive request",
        });

        await createAppointment(DEMO_COMPANY_ID, {
            id: "appt-demo-1",
            customerName: "John Smith",
            phone: "27849000523",
            scheduledAt: tomorrow.toISOString(),
            service: "Hilux test drive",
            status: "scheduled",
            source: "sarah",
        });

        await createAppointment(DEMO_COMPANY_ID, {
            id: "appt-demo-2",
            customerName: "David Nkosi",
            phone: "27718889900",
            scheduledAt: dayAfter.toISOString(),
            service: "Finance consultation",
            status: "scheduled",
            source: "portal",
        });

        return { seeded: true, companyId: DEMO_COMPANY_ID };
    } catch (err) {
        console.warn("[seedCustomerOpsDemo] skipped:", err.message);
        return { seeded: false, error: err.message };
    }
}
