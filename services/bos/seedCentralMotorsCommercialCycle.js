/**
 * Seed one demo commercial cycle for Central Motors pilot tenants.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { CYCLE_STAGES, STAGE_LABELS, SARAH_ROLES } from "./commercialCycleModel.js";
import { isBosPilotTenant } from "./bosPilot.js";
import { createFinanceInvoiceForAccess } from "../finance/financeInvoiceService.js";

const SEED_DOC_ID = "cm-demo-hilux-cycle";
const QUOTATION_MARKER = "__DOC:quotation__";
const SEED_ACCESS = { role: "owner", uid: "bos-seed" };

class CommercialCycleService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.BOS_COMMERCIAL_CYCLES);
    }
}

const cycleRepo = new CommercialCycleService();

async function ensureDemoQuotationInvoice(companyId, cycleId, customerName, title) {
    const invoice = await createFinanceInvoiceForAccess(companyId, SEED_ACCESS, {
        invoiceKind: "receivable",
        status: "sent",
        counterpartyName: customerName,
        currency: "ZAR",
        issueDate: new Date().toISOString().slice(0, 10),
        lineItems: [{ description: title, quantity: 1, unitPrice: 15000 }],
        notes: `${QUOTATION_MARKER}\nBOS seed cycle ${cycleId}`,
    });
    return invoice.id;
}

export async function ensureCentralMotorsDemoCycle(companyId) {
    if (!isBosPilotTenant(companyId)) return null;
    const existing = await cycleRepo.get(companyId, SEED_DOC_ID);
    if (existing) {
        if (!existing.quotationInvoiceId && existing.stage === CYCLE_STAGES.QUOTATION_SENT) {
            const quotationInvoiceId = await ensureDemoQuotationInvoice(
                companyId,
                SEED_DOC_ID,
                existing.customerName || "Mr. Ndlovu",
                existing.title || "2024 Toyota Hilux — deposit & delivery prep"
            );
            return cycleRepo.update(companyId, SEED_DOC_ID, { quotationInvoiceId });
        }
        return existing;
    }

    const stage = CYCLE_STAGES.QUOTATION_SENT;
    const title = "2024 Toyota Hilux — deposit & delivery prep";
    const customerName = "Mr. Ndlovu";
    const quotationInvoiceId = await ensureDemoQuotationInvoice(companyId, SEED_DOC_ID, customerName, title);
    return cycleRepo.createIfAbsent(companyId, SEED_DOC_ID, {
        title,
        customerName,
        customerPhone: "+27821234567",
        stage,
        stageLabel: STAGE_LABELS[stage],
        quotationInvoiceId,
        paymentProof: null,
        paymentVerifiedAt: null,
        projectId: "proj-hilux-ndlovu",
        delegations: [
            {
                id: "del-seed-finance",
                type: "prepare_quotation",
                fromRole: SARAH_ROLES.ADMIN,
                toRole: SARAH_ROLES.FINANCE,
                status: "completed",
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                completedAt: new Date(Date.now() - 82800000).toISOString(),
                resultSummary: "Demo quotation prepared (link invoice in Finance when ready).",
            },
        ],
        activityLog: [
            {
                type: "seed",
                message: "Central Motors BOS demo cycle — quotation sent, awaiting customer acceptance.",
                actorRole: SARAH_ROLES.SALES,
                at: new Date().toISOString(),
            },
        ],
        mobilisedTaskIds: [],
        seed: true,
    });
}
