/**
 * Sach Accounting Solutions — service catalogue, statuses, governance constants.
 */

export const SACH_CONSULT_COMPANY_ID = "sach-consult";

export const ENQUIRY_CATEGORIES = Object.freeze([
    "new_accounting_client",
    "existing_accounting_client",
    "bookkeeping",
    "tax",
    "payroll",
    "company_registration",
    "corporate_compliance",
    "financial_statement",
    "business_advisory",
    "consultation",
    "pricing",
    "service_follow_up",
    "complaint",
    "general",
]);

export const SERVICE_TYPES = Object.freeze([
    "bookkeeping",
    "management_accounts",
    "annual_financial_statements",
    "vat",
    "paye",
    "emp201",
    "emp501",
    "income_tax_personal",
    "income_tax_company",
    "provisional_tax",
    "tax_clearance",
    "sars_correspondence",
    "payroll_onboarding",
    "payroll_monthly",
    "payslip_request",
    "cipc_registration",
    "cipc_annual_return",
    "cipc_director_change",
    "beneficial_ownership",
    "csd",
    "cidb",
    "coida",
    "rma",
    "business_advisory",
    "consultation",
    "quotation",
    "client_onboarding",
]);

export const REQUEST_STATUSES = Object.freeze([
    "new",
    "information_required",
    "awaiting_documents",
    "ready_for_review",
    "awaiting_assignment",
    "assigned",
    "in_progress",
    "awaiting_professional_approval",
    "client_action_required",
    "awaiting_external",
    "completed",
    "closed",
    "cancelled",
]);

export const DOCUMENT_STATUSES = Object.freeze([
    "requested",
    "awaiting_upload",
    "uploaded",
    "under_review",
    "accepted",
    "rejected",
    "replacement_requested",
    "archived",
]);

/** Website-advertised plans — require Sach sign-off before quoting in production. */
export const SERVICE_PLANS = Object.freeze({
    standard: {
        label: "Standard Plan",
        inclusions: [
            "Bookkeeping and accounting",
            "Annual turnover reference R1 million",
            "Management accounts",
            "Annual financial statements",
            "Income tax submissions",
            "Payroll at R100 per employee (confirm current rate with firm)",
        ],
    },
    premium: {
        label: "Premium Plan",
        inclusions: [
            "Bookkeeping and accounting",
            "VAT reconciliations and submissions",
            "Management accounts",
            "Annual financial statements",
            "Income tax submissions",
            "Payroll at R100 per employee (confirm current rate with firm)",
        ],
    },
    personal: {
        label: "Personal Plan",
        inclusions: [
            "Individual tax submissions from R350 per year (confirm)",
            "Self-employed individual services from R1,500 per year (confirm)",
        ],
    },
});

export const CONSULTATION_TYPES = Object.freeze([
    "general_accounting",
    "tax",
    "vat",
    "payroll",
    "company_registration",
    "business_advisory",
    "financial_statements",
    "compliance",
    "existing_client_review",
]);

export const PROFESSIONAL_GOVERNANCE_RULES = Object.freeze({
    neverRoleAs: ["independent accountant", "auditor", "tax practitioner", "CIPC agent"],
    requiresApproval: [
        "finalise_financial_statements",
        "approve_payroll",
        "file_tax_returns",
        "submit_vat",
        "submit_emp201_emp501",
        "statutory_filings",
        "professional_opinion",
    ],
});