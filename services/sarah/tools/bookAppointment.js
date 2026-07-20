import { createAppointment } from "../../tenants/appointmentService.js";
import { publish, EventTypes } from "../../events/index.js";

export default {
    name: "bookAppointment",
    description: "Book an appointment for a customer — test drive, consultation, or service visit.",
    parameters: {
        type: "object",
        properties: {
            customerName: { type: "string", description: "Customer full name" },
            phone: { type: "string", description: "Customer phone (E.164 or local)" },
            scheduledAt: { type: "string", description: "ISO datetime or human date/time" },
            service: { type: "string", description: "Appointment type e.g. test drive, consultation" },
            notes: { type: "string", description: "Optional notes" },
        },
        required: ["customerName", "scheduledAt"],
    },
    requiredPermissions: ["canReply"],
    async execute(ctx, args) {
        const appointment = await createAppointment(ctx.companyId, {
            customerName: args.customerName,
            phone: args.phone || null,
            scheduledAt: args.scheduledAt,
            service: args.service || "General appointment",
            notes: args.notes || "",
            source: "sarah",
        });

        await publish(ctx.companyId, EventTypes.APPOINTMENT_BOOKED, {
            appointmentId: appointment.id,
            customerName: args.customerName,
            scheduledAt: args.scheduledAt,
            service: args.service,
        });

        return {
            message: `Booked ${args.service || "appointment"} for ${args.customerName} at ${args.scheduledAt}.`,
            data: { appointment },
            uiHints: [{ navigate: "appointments" }],
        };
    },
};
