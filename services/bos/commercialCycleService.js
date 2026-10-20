/**
 * Sarah BOS commercial cycle — persistent quote → verified payment → mobilisation.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    CYCLE_STAGES,
    STAGE_LABELS,
    SARAH_ROLES,
    assertTransition,
} from "./commercialCycleModel.js";
import { isBosPilotTenant } from "./bosPilot.js";
import { ensureCentralMotorsDemoCycle } from "./seedCentralMotorsCommercialCycle.js";
import {
    createFinanceInvoiceForAccess,
    updateFinanceInvoiceForAccess,
    recordInvoicePaymentForAccess,
    getFinanceInvoiceForAccess,
} from "../finance/financeInvoiceService.js";
import { createTaskForAccess } from "../tenants/taskService.js";
import { publish, EventTypes } from "../events/index.js";
import { syncWorkforceInstructionsForCycle } from "./bosCycleWorkforceBridge.js";

const QUOTATION_MARKER = "__DOC:quotation__";

class CommercialCycleService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.BOS_COMMERCIAL_CYCLES);
    }
}

const cycleRepo = new CommercialCycleService();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

function accessFromActor(actor = {}) {
    return { role: actor.role, uid: actor.uid ?? null };
}

function nowIso() {
    return new Date().toISOString();
}

function appendLog(cycle, entry) {
    const log = Array.isArray(cycle.activityLog) ? [...cycle.activityLog] : [];
    log.push({ ...entry, at: nowIso() });
    return log;
}

function appendDelegation(cycle, delegation) {
    const list = Array.isArray(cycle.delegations) ? [...cycle.delegations] : [];
    list.push({
        id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: "open",
        createdAt: nowIso(),
        ...delegation,
    });
    return list;
}

function closeDelegation(cycle, type, resultSummary) {
    const list = Array.isArray(cycle.delegations) ? [...cycle.delegations] : [];
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].type === type && list[i].status === "open") {
            list[i] = {
                ...list[i],
                status: "completed",
                completedAt: nowIso(),
                resultSummary: resultSummary || "",
            };
            break;
        }
    }
    return list;
}

export async function listCommercialCycles(companyId, { seedIfEmpty = true } = {}) {
    if (seedIfEmpty && isBosPilotTenant(companyId)) {
        await ensureCentralMotorsDemoCycle(companyId);
    }
    const items = await cycleRepo.list(companyId, { max: 50, orderByField: "updatedAt", orderDirection: "desc" });
    return items;
}

export async function getCommercialCycle(companyId, cycleId) {
    const row = await cycleRepo.get(companyId, cycleId);
    return row || null;
}

function normalizePhoneKey(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
}

/** Active cycle for customer phone (excludes completed / exception / mobilised). */
export async function findOpenCommercialCycleForCustomer(companyId, customerPhone) {
    const key = normalizePhoneKey(customerPhone);
    if (!key) return null;
    const items = await listCommercialCycles(companyId, { seedIfEmpty: false });
    const terminal = new Set([
        CYCLE_STAGES.COMPLETED,
        CYCLE_STAGES.EXCEPTION,
        CYCLE_STAGES.MOBILISED,
    ]);
    for (const c of items) {
        if (normalizePhoneKey(c.customerPhone) !== key) continue;
        if (terminal.has(c.stage)) continue;
        return c;
    }
    return null;
}

export async function createCommercialCycle(companyId, actor, body = {}) {
    const customerName = String(body.customerName || "").trim();
    const title = String(body.title || "").trim();
    if (!customerName || !title) {
        throw httpError("customerName and title are required", 400, "BOS_VALIDATION");
    }
    const stage = CYCLE_STAGES.QUOTATION_PENDING;
    const created = await cycleRepo.create(companyId, {
        title,
        customerName,
        customerPhone: body.customerPhone || null,
        leadId: body.leadId || null,
        stage,
        stageLabel: STAGE_LABELS[stage],
        quotationInvoiceId: null,
        paymentProof: null,
        paymentVerifiedAt: null,
        paymentVerifiedByUid: null,
        workAuthorisedAt: null,
        workAuthorisedByUid: null,
        mobilisedAt: null,
        mobilisedTaskIds: [],
        projectId: body.projectId || `proj-${Date.now().toString(36).slice(2, 8)}`,
        conversationId: body.conversationId || null,
        sourceChannel: body.sourceChannel || null,
        inboundConsentKind: body.inboundConsentKind || null,
        delegations: [],
        activityLog: [
            {
                type: "cycle_created",
                message: body.conversationId
                    ? `Commercial cycle opened for ${customerName} from ${body.sourceChannel || "channel"} conversation.`
                    : `Commercial cycle opened for ${customerName}.`,
                actorRole: SARAH_ROLES.SALES,
                actorUid: actor.uid,
                at: nowIso(),
            },
        ],
        createdByUid: actor.uid,
        updatedByUid: actor.uid,
    });
    await syncWorkforceInstructionsForCycle(companyId, created, "created").catch((err) => {
        console.warn("[bos] cycle bridge (created):", err.message);
    });
    return created;
}

/**
 * @param {string} companyId
 * @param {string} cycleId
 * @param {string} action
 * @param {{ role?: string, uid?: string|null }} actor
 * @param {object} body
 */
export async function applyCommercialCycleAction(companyId, cycleId, action, actor, body = {}) {
    let cycle = await getCommercialCycle(companyId, cycleId);
    if (!cycle) throw httpError("Cycle not found", 404, "BOS_NOT_FOUND");

    const access = accessFromActor(actor);
    const rule = assertTransition(action, cycle.stage);
    let patch = { updatedByUid: actor.uid, updatedAt: nowIso() };

    switch (action) {
        case "request-quotation": {
            patch.delegations = appendDelegation(cycle, {
                type: "prepare_quotation",
                fromRole: SARAH_ROLES.ADMIN,
                toRole: SARAH_ROLES.FINANCE,
                instruction: body.note || "Prepare quotation from approved catalogue and pricing rules.",
            });
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.activityLog = appendLog(cycle, {
                type: "delegation",
                message: "Admin Sarah delegated quotation preparation to Finance Sarah.",
                actorRole: SARAH_ROLES.ADMIN,
                actorUid: actor.uid,
            });
            break;
        }
        case "prepare-quotation": {
            if (!["owner", "manager", "finance"].includes(String(actor.role || ""))) {
                throw httpError("Finance role required to prepare quotation", 403, "BOS_FORBIDDEN");
            }
            const counterpartyName = body.counterpartyName || cycle.customerName;
            const lineItems = Array.isArray(body.lineItems)
                ? body.lineItems.map((li) => ({
                      ...li,
                      unitAmount:
                          li.unitAmount ?? li.unitPrice ?? (Number(li.amount) || 0),
                  }))
                : [
                      {
                          description: body.description || cycle.title,
                          quantity: 1,
                          unitAmount: body.unitAmount ?? body.unitPrice ?? 0,
                      },
                  ];
            const invoice = await createFinanceInvoiceForAccess(companyId, access, {
                invoiceKind: "receivable",
                status: "draft",
                counterpartyName,
                currency: body.currency || "ZAR",
                issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
                dueDate: body.dueDate || null,
                lineItems,
                notes: `${QUOTATION_MARKER}\nBOS cycle ${cycleId}`,
            });
            patch.quotationInvoiceId = invoice.id;
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.delegations = closeDelegation(cycle, "prepare_quotation", `Quotation draft ${invoice.id}`);
            patch.activityLog = appendLog(cycle, {
                type: "quotation_prepared",
                message: `Finance Sarah prepared quotation ${invoice.invoiceNumber || invoice.id}.`,
                actorRole: SARAH_ROLES.FINANCE,
                actorUid: actor.uid,
            });
            break;
        }
        case "send-quotation": {
            if (!cycle.quotationInvoiceId) throw httpError("No quotation linked", 409, "BOS_NO_QUOTATION");
            await updateFinanceInvoiceForAccess(companyId, cycle.quotationInvoiceId, access, { status: "sent" });
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.activityLog = appendLog(cycle, {
                type: "quotation_sent",
                message: "Sales Sarah sent quotation to customer.",
                actorRole: SARAH_ROLES.SALES,
                actorUid: actor.uid,
            });
            await publish(companyId, EventTypes.QUOTATION_SENT, {
                cycleId,
                invoiceId: cycle.quotationInvoiceId,
                customerName: cycle.customerName,
            });
            break;
        }
        case "accept-quotation": {
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.activityLog = appendLog(cycle, {
                type: "quotation_accepted",
                message: "Customer accepted quotation — awaiting payment.",
                actorRole: SARAH_ROLES.SALES,
                actorUid: actor.uid,
            });
            break;
        }
        case "submit-payment-proof": {
            patch.paymentProof = {
                reference: String(body.reference || "").trim() || null,
                proofUrl: body.proofUrl || null,
                submittedAt: nowIso(),
                submittedByUid: actor.uid,
                note: body.note || "",
            };
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.activityLog = appendLog(cycle, {
                type: "payment_proof",
                message: "Payment proof submitted — Finance Sarah must verify against trusted evidence.",
                actorRole: SARAH_ROLES.SALES,
                actorUid: actor.uid,
            });
            break;
        }
        case "verify-payment": {
            if (!["owner", "manager", "finance"].includes(String(actor.role || ""))) {
                throw httpError("Finance role required to verify payment", 403, "BOS_FORBIDDEN");
            }
            if (!cycle.quotationInvoiceId) throw httpError("No invoice to verify against", 409, "BOS_NO_QUOTATION");
            const invoice = await getFinanceInvoiceForAccess(companyId, cycle.quotationInvoiceId, access);
            if (!invoice) throw httpError("Linked invoice not found", 404, "BOS_INVOICE_NOT_FOUND");

            const amount = body.amount != null ? Number(body.amount) : fromMinor(invoice.totalMinor, invoice.currency);
            const idempotencyKey = body.idempotencyKey || `bos-${cycleId}-verify`;
            await recordInvoicePaymentForAccess(companyId, access, cycle.quotationInvoiceId, {
                amount,
                currency: invoice.currency,
                occurredAt: body.paymentDate || new Date().toISOString().slice(0, 10),
                paymentMethod: body.method || "eft",
                reference: body.reference || cycle.paymentProof?.reference || idempotencyKey,
                idempotencyKey,
                description: "BOS verified payment",
            });

            patch.paymentVerifiedAt = nowIso();
            patch.paymentVerifiedByUid = actor.uid;
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.activityLog = appendLog(cycle, {
                type: "payment_verified",
                message: "Finance Sarah verified payment — work may be authorised.",
                actorRole: SARAH_ROLES.FINANCE,
                actorUid: actor.uid,
            });
            await publish(companyId, EventTypes.PAYMENT_RECEIVED, {
                cycleId,
                invoiceId: cycle.quotationInvoiceId,
                verified: true,
            });
            break;
        }
        case "authorise-work": {
            if (!["owner", "manager"].includes(String(actor.role || ""))) {
                throw httpError("Owner or manager required to authorise work", 403, "BOS_FORBIDDEN");
            }
            if (!cycle.paymentVerifiedAt) {
                throw httpError("Payment must be verified before work authorisation", 409, "BOS_PAYMENT_NOT_VERIFIED");
            }
            patch.workAuthorisedAt = nowIso();
            patch.workAuthorisedByUid = actor.uid;
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.delegations = appendDelegation(cycle, {
                type: "mobilise_delivery",
                fromRole: SARAH_ROLES.ADMIN,
                toRole: SARAH_ROLES.OPERATIONS,
                instruction: "Create delivery tasks and schedule resources.",
            });
            patch.activityLog = appendLog(cycle, {
                type: "work_authorised",
                message: "Admin Sarah authorised mobilisation — Operations Sarah to execute.",
                actorRole: SARAH_ROLES.ADMIN,
                actorUid: actor.uid,
            });
            await publish(companyId, EventTypes.WORK_AUTHORISED, { cycleId, projectId: cycle.projectId });
            break;
        }
        case "mobilise": {
            const role = String(actor.role || "");
            if (!["owner", "manager", "sales", "support", "reception"].includes(role)) {
                throw httpError("Operations access required to mobilise", 403, "BOS_FORBIDDEN");
            }
            const task = await createTaskForAccess(companyId, access, {
                title: `Deliver: ${cycle.title}`,
                description: `BOS mobilisation for ${cycle.customerName}. Cycle ${cycleId}. Project ${cycle.projectId}.`,
                priority: "high",
                status: "open",
                assigneeType: "human",
            });
            patch.mobilisedAt = nowIso();
            patch.mobilisedTaskIds = [...(cycle.mobilisedTaskIds || []), task.id];
            patch.stage = rule.to;
            patch.stageLabel = STAGE_LABELS[rule.to];
            patch.delegations = closeDelegation(cycle, "mobilise_delivery", `Task ${task.id} created`);
            patch.activityLog = appendLog(cycle, {
                type: "mobilised",
                message: `Operations Sarah mobilised work (task ${task.id}).`,
                actorRole: SARAH_ROLES.OPERATIONS,
                actorUid: actor.uid,
            });
            await publish(companyId, EventTypes.COMMERCIAL_CYCLE_MOBILISED, {
                cycleId,
                taskId: task.id,
            });
            break;
        }
        default:
            throw httpError("Unsupported action", 400, "BOS_INVALID_ACTION");
    }

    const updated = await cycleRepo.update(companyId, cycleId, patch);
    await syncWorkforceInstructionsForCycle(companyId, updated, action).catch((err) => {
        console.warn("[bos] cycle bridge:", action, err.message);
    });
    return updated;
}

function fromMinor(minor, currency) {
    const n = Number(minor) || 0;
    return Math.round(n) / 100;
}
