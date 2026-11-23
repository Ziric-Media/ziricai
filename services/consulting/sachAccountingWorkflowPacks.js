/**
 * Sach Accounting — data-driven service workflow packs (Phase 2).
 * Each pack: intake questions, document checklist, default department routing.
 */

/**
 * @typedef {object} SachIntakeQuestion
 * @property {string} id
 * @property {string} prompt
 * @property {boolean} [required]
 * @property {string} [hint]
 */

/**
 * @typedef {object} SachDocumentChecklistItem
 * @property {string} docKey
 * @property {string} label
 * @property {string} [reason]
 * @property {boolean} [required]
 */

/**
 * @typedef {object} SachWorkflowPack
 * @property {string} serviceType
 * @property {string} label
 * @property {string} department
 * @property {string[]} categories
 * @property {SachIntakeQuestion[]} intakeQuestions
 * @property {SachDocumentChecklistItem[]} documentChecklist
 */

/** @type {Record<string, SachWorkflowPack>} */
export const SACH_WORKFLOW_PACKS = Object.freeze({
    vat: {
        serviceType: "vat",
        label: "VAT registration, return or SARS assistance",
        department: "tax",
        categories: ["tax"],
        intakeQuestions: [
            { id: "vat_scenario", prompt: "Is this a new VAT registration, a VAT return, a reconciliation, or help with SARS?", required: true },
            { id: "business_name", prompt: "Registered business name?", required: true },
            { id: "vat_registered", prompt: "Is the business currently registered for VAT?", required: true },
            { id: "vat_period", prompt: "Which VAT period does this relate to?", required: true },
            { id: "sales_records", prompt: "Are sales records / invoices available for that period?", required: false },
            { id: "purchase_invoices", prompt: "Are purchase invoices available?", required: false },
            { id: "bank_statements", prompt: "Are bank statements available for the period?", required: false },
            { id: "sars_notices", prompt: "Any outstanding SARS notices or queries?", required: false },
            { id: "deadline", prompt: "Known submission deadline (if any)?", required: false },
        ],
        documentChecklist: [
            { docKey: "vat_sales_schedule", label: "Sales schedule / invoices", reason: "To prepare or review the VAT return.", required: true },
            { docKey: "vat_purchases", label: "Purchase invoices", reason: "Input VAT and adjustments.", required: true },
            { docKey: "bank_statements", label: "Bank statements", reason: "Reconciliation support.", required: true },
            { docKey: "sars_correspondence", label: "SARS letters or notices", reason: "If SARS has queried the account.", required: false },
            { docKey: "prior_vat_return", label: "Previous VAT return", reason: "Continuity and comparison.", required: false },
        ],
    },
    cipc_annual_return: {
        serviceType: "cipc_annual_return",
        label: "CIPC annual return",
        department: "corporate_compliance",
        categories: ["corporate_compliance"],
        intakeQuestions: [
            { id: "company_name", prompt: "Registered company name?", required: true },
            { id: "cipc_number", prompt: "CIPC registration number?", required: true },
            { id: "return_period", prompt: "Which annual return year/period?", required: true },
            { id: "cipc_notice", prompt: "Have you received a CIPC notice or penalty letter?", required: false },
            { id: "company_active", prompt: "Is the company still trading?", required: true },
            { id: "financial_year_end", prompt: "Financial year-end date?", required: false },
            { id: "urgency", prompt: "Any filing deadline you are aware of?", required: false },
        ],
        documentChecklist: [
            { docKey: "cipc_notice", label: "CIPC notice (if received)", reason: "Shows due dates and penalties.", required: false },
            { docKey: "company_registration_cert", label: "Company registration certificate", reason: "Verify entity details.", required: false },
            { docKey: "annual_financial_statements", label: "Latest financial statements (if applicable)", reason: "May be required for filing.", required: false },
        ],
    },
    payroll_monthly: {
        serviceType: "payroll_monthly",
        label: "Monthly payroll processing",
        department: "payroll",
        categories: ["payroll"],
        intakeQuestions: [
            { id: "business_name", prompt: "Which business is this payroll for?", required: true },
            { id: "payroll_month", prompt: "Which payroll month?", required: true },
            { id: "employee_count", prompt: "How many employees are included?", required: true },
            { id: "new_employees", prompt: "Any new employees this month?", required: false },
            { id: "leavers", prompt: "Any employees who left?", required: false },
            { id: "salary_changes", prompt: "Any salary, overtime, bonus or deduction changes?", required: false },
            { id: "leave_updates", prompt: "Leave or absence updates to apply?", required: false },
            { id: "payroll_input", prompt: "Do you have an approved payroll input schedule?", required: false },
            { id: "special_instructions", prompt: "Any exceptional payroll instructions?", required: false },
        ],
        documentChecklist: [
            { docKey: "payroll_input_schedule", label: "Payroll input schedule", reason: "Approved hours, salaries and deductions.", required: true },
            { docKey: "employee_changes", label: "New / leaver employee details", reason: "If staff changed this month.", required: false },
            { docKey: "prior_payslips", label: "Prior month payslips (if reconciliation needed)", reason: "Cross-check variances.", required: false },
        ],
    },
    bookkeeping: {
        serviceType: "bookkeeping",
        label: "Bookkeeping",
        department: "accounting",
        categories: ["bookkeeping"],
        intakeQuestions: [
            { id: "business_name", prompt: "Business name?", required: true },
            { id: "cipc_number", prompt: "CIPC registration number (if applicable)?", required: false },
            { id: "accounting_period", prompt: "Which accounting period?", required: true },
            { id: "frequency", prompt: "Once-off catch-up or ongoing monthly bookkeeping?", required: true },
            { id: "records_maintained", prompt: "Do you currently maintain accounting records?", required: true },
            { id: "accounting_software", prompt: "Which accounting software do you use?", required: false },
            { id: "outstanding_periods", prompt: "Any outstanding periods?", required: false },
        ],
        documentChecklist: [
            { docKey: "bank_statements", label: "Bank statements", required: true },
            { docKey: "sales_invoices", label: "Sales invoices", required: true },
            { docKey: "purchase_invoices", label: "Purchase invoices / expenses", required: true },
            { docKey: "prior_financials", label: "Prior financial statements or trial balance", required: false },
        ],
    },
    emp501: {
        serviceType: "emp501",
        label: "EMP501 annual reconciliation",
        department: "tax",
        categories: ["tax", "payroll"],
        intakeQuestions: [
            { id: "business_name", prompt: "Employer / business name?", required: true },
            { id: "reconciliation_period", prompt: "Reconciliation tax year or period?", required: true },
            { id: "employee_count", prompt: "Number of employees in scope?", required: true },
            { id: "emp201_complete", prompt: "Were monthly EMP201s submitted for the period?", required: true },
            { id: "irp5_ready", prompt: "Are employee tax certificates (IRP5/IT3(a)) available?", required: false },
            { id: "known_discrepancies", prompt: "Any known SARS discrepancies?", required: false },
        ],
        documentChecklist: [
            { docKey: "monthly_emp201", label: "Monthly EMP201 records", required: true },
            { docKey: "payroll_reports", label: "Payroll reports for the year", required: true },
            { docKey: "irp5_it3a", label: "IRP5 / IT3(a) certificates", required: true },
            { docKey: "sars_correspondence", label: "SARS correspondence", required: false },
        ],
    },
    cipc_director_change: {
        serviceType: "cipc_director_change",
        label: "Director or member amendment",
        department: "corporate_compliance",
        categories: ["corporate_compliance"],
        intakeQuestions: [
            { id: "company_name", prompt: "Company name?", required: true },
            { id: "cipc_number", prompt: "CIPC registration number?", required: true },
            { id: "change_type", prompt: "Add, remove, or update a director/member?", required: true },
            { id: "effective_date", prompt: "Effective date of the change?", required: false },
        ],
        documentChecklist: [
            { docKey: "director_id", label: "ID copies of affected directors", required: true },
            { docKey: "resolution", label: "Signed company resolution", required: true },
            { docKey: "cipc_forms", label: "Completed CIPC forms (if already prepared)", required: false },
        ],
    },
    paye: {
        serviceType: "paye",
        label: "PAYE registration or employer compliance",
        department: "tax",
        categories: ["tax", "payroll"],
        intakeQuestions: [
            { id: "paye_scenario", prompt: "Do you need PAYE registration, monthly PAYE assistance, or help with an employer compliance issue?", required: true },
            { id: "business_name", prompt: "Registered business / employer name?", required: true },
            { id: "paye_registered", prompt: "Is the business already registered for PAYE with SARS?", required: true },
            { id: "employee_count", prompt: "How many employees are affected?", required: true },
            { id: "payroll_period", prompt: "Which payroll or tax period does this relate to?", required: false },
            { id: "payroll_processed", prompt: "Has payroll already been processed for that period?", required: false },
            { id: "employee_changes", prompt: "Any new leavers or salary changes not yet on payroll?", required: false },
            { id: "sars_discrepancies", prompt: "Any SARS discrepancies or outstanding amounts?", required: false },
        ],
        documentChecklist: [
            { docKey: "paye_registration", label: "PAYE registration documents (if new)", reason: "SARS employer registration.", required: false },
            { docKey: "payroll_reports", label: "Payroll reports for the period", reason: "PAYE calculation and reconciliation.", required: true },
            { docKey: "employee_list", label: "Employee list with IDs and tax numbers", reason: "Employer compliance.", required: true },
            { docKey: "sars_correspondence", label: "SARS letters or assessments", reason: "If SARS has queried PAYE.", required: false },
        ],
    },
    emp201: {
        serviceType: "emp201",
        label: "EMP201 monthly declaration",
        department: "tax",
        categories: ["tax", "payroll"],
        intakeQuestions: [
            { id: "business_name", prompt: "Employer / business name?", required: true },
            { id: "paye_registered", prompt: "Is the business registered for PAYE?", required: true },
            { id: "emp201_period", prompt: "Which EMP201 period (month/year)?", required: true },
            { id: "employee_count", prompt: "How many employees are covered?", required: true },
            { id: "payroll_processed", prompt: "Has payroll been processed for this period?", required: true },
            { id: "emp201_request", prompt: "Do you need calculation/review, correction of a prior EMP201, or submission support?", required: true },
            { id: "sars_discrepancies", prompt: "Any SARS discrepancies or penalties?", required: false },
            { id: "deadline", prompt: "Known SARS submission deadline?", required: false },
        ],
        documentChecklist: [
            { docKey: "payroll_reports", label: "Payroll reports for the month", reason: "EMP201 figures.", required: true },
            { docKey: "prior_emp201", label: "Prior EMP201 (if correcting)", reason: "Variance analysis.", required: false },
            { docKey: "employee_changes", label: "Employee changes for the period", reason: "PAYE adjustments.", required: false },
            { docKey: "sars_correspondence", label: "SARS correspondence", required: false },
        ],
    },
    income_tax_personal: {
        serviceType: "income_tax_personal",
        label: "Personal income tax",
        department: "tax",
        categories: ["tax"],
        intakeQuestions: [
            { id: "taxpayer_type", prompt: "Are you salaried, self-employed, a business owner, a pensioner, or do you have multiple income sources?", required: true },
            { id: "full_name", prompt: "Full legal name?", required: true },
            { id: "tax_year", prompt: "Which tax year or period requires assistance?", required: true },
            { id: "requested_service", prompt: "Do you need a new return, an amendment, or a tax consultation only?", required: true },
            { id: "existing_practitioner", prompt: "Do you currently have another tax practitioner?", required: false },
            { id: "irp5_available", prompt: "Do you have IRP5/IT3(a) certificates or income summaries?", required: false },
            { id: "deductions", prompt: "Any medical, retirement, or donation certificates to claim?", required: false },
            { id: "sars_letter", prompt: "Has SARS sent you a letter or assessment?", required: false },
        ],
        documentChecklist: [
            { docKey: "irp5_it3a", label: "IRP5 / IT3(a) certificates", reason: "Employment income.", required: false },
            { docKey: "prior_tax_return", label: "Prior year tax return", reason: "Continuity.", required: false },
            { docKey: "income_summaries", label: "Self-employment income summaries", reason: "If not salaried.", required: false },
            { docKey: "deduction_certificates", label: "Medical / RA / donation certificates", reason: "Claims support.", required: false },
            { docKey: "sars_correspondence", label: "SARS correspondence", reason: "If in dispute or query.", required: false },
            { docKey: "id_copy", label: "ID copy (if firm requires for onboarding)", reason: "Secure upload only.", required: false },
        ],
    },
    cipc_registration: {
        serviceType: "cipc_registration",
        label: "New company registration",
        department: "corporate_compliance",
        categories: ["company_registration", "corporate_compliance"],
        intakeQuestions: [
            { id: "proposed_name", prompt: "Proposed company name?", required: true },
            { id: "alternative_names", prompt: "Alternative names (if any)?", required: false },
            { id: "company_type", prompt: "Company type (e.g. Pty Ltd)?", required: true },
            { id: "business_activity", prompt: "Main business activity / industry?", required: true },
            { id: "registered_address", prompt: "Proposed registered address?", required: true },
            { id: "director_count", prompt: "How many directors will be appointed?", required: true },
            { id: "ownership_structure", prompt: "Brief ownership / shareholder structure?", required: false },
            { id: "urgency", prompt: "When do you need the company registered?", required: false },
        ],
        documentChecklist: [
            { docKey: "director_id", label: "Director ID copies", reason: "CIPC filing.", required: true },
            { docKey: "proof_of_address", label: "Proof of registered address", reason: "If required for filing.", required: false },
            { docKey: "name_reservation", label: "Name reservation certificate (if already reserved)", reason: "Speeds registration.", required: false },
            { docKey: "supporting_forms", label: "Signed founding documents (if prepared)", required: false },
        ],
    },
    coida: {
        serviceType: "coida",
        label: "COIDA / Compensation Fund",
        department: "corporate_compliance",
        categories: ["corporate_compliance", "payroll"],
        intakeQuestions: [
            { id: "coida_scenario", prompt: "Is this a new COIDA registration, renewal, or an update?", required: true },
            { id: "business_name", prompt: "Registered business name?", required: true },
            { id: "cipc_number", prompt: "CIPC / registration number?", required: false },
            { id: "employee_count", prompt: "Number of employees?", required: true },
            { id: "annual_payroll", prompt: "Approximate annual payroll or earnings basis?", required: false },
            { id: "existing_coida", prompt: "Do you already have a Compensation Fund number?", required: true },
            { id: "renewal_period", prompt: "Renewal year or period (if applicable)?", required: false },
            { id: "deadline", prompt: "Known renewal deadline?", required: false },
        ],
        documentChecklist: [
            { docKey: "coida_registration", label: "Existing COIDA / CF registration letter", reason: "Renewal or update.", required: false },
            { docKey: "payroll_summary", label: "Payroll or earnings summary", reason: "Assessment basis.", required: true },
            { docKey: "company_registration_cert", label: "Company registration certificate", reason: "Entity verification.", required: false },
            { docKey: "prior_returns", label: "Prior COIDA returns (if any)", required: false },
        ],
    },
    cidb: {
        serviceType: "cidb",
        label: "CIDB registration or renewal",
        department: "corporate_compliance",
        categories: ["corporate_compliance"],
        intakeQuestions: [
            { id: "cidb_scenario", prompt: "New CIDB registration, renewal, or grading update?", required: true },
            { id: "business_name", prompt: "Registered business / contractor name?", required: true },
            { id: "cidb_number", prompt: "Existing CIDB registration number (if any)?", required: false },
            { id: "contractor_class", prompt: "Contractor class or work categories involved?", required: false },
            { id: "grading_target", prompt: "Target grading (if upgrading)?", required: false },
            { id: "company_active", prompt: "Is the business actively trading?", required: true },
            { id: "renewal_year", prompt: "Renewal year (if applicable)?", required: false },
            { id: "deadline", prompt: "Known CIDB deadline?", required: false },
        ],
        documentChecklist: [
            { docKey: "cidb_certificate", label: "Current CIDB certificate (if renewing)", reason: "Renewal baseline.", required: false },
            { docKey: "company_registration_cert", label: "Company registration certificate", reason: "Entity verification.", required: true },
            { docKey: "financial_statements", label: "Financial statements (if grading upgrade)", reason: "CIDB grading criteria.", required: false },
            { docKey: "track_record", label: "Contract / project track record", reason: "Grading support.", required: false },
        ],
    },
    income_tax_company: {
        serviceType: "income_tax_company",
        label: "Company income tax",
        department: "tax",
        categories: ["tax"],
        intakeQuestions: [
            { id: "business_name", prompt: "Registered company name?", required: true },
            { id: "tax_year", prompt: "Which tax year or financial period?", required: true },
            { id: "entity_type", prompt: "Entity type (e.g. Pty Ltd, NPC)?", required: true },
            { id: "requested_service", prompt: "New annual return, provisional planning, amendment, or consultation only?", required: true },
            { id: "records_current", prompt: "Are accounting records up to date for that period?", required: true },
            { id: "itr14_prior", prompt: "Was an ITR14 filed for the prior year?", required: false },
            { id: "sars_letter", prompt: "Any SARS assessments or queries outstanding?", required: false },
            { id: "deadline", prompt: "Known filing deadline?", required: false },
        ],
        documentChecklist: [
            { docKey: "annual_financials", label: "Annual financial statements / trial balance", reason: "ITR14 preparation.", required: true },
            { docKey: "prior_itr14", label: "Prior year ITR14", reason: "Continuity.", required: false },
            { docKey: "tax_computation", label: "Tax computation (if prepared)", required: false },
            { docKey: "sars_correspondence", label: "SARS correspondence", required: false },
        ],
    },
    provisional_tax: {
        serviceType: "provisional_tax",
        label: "Provisional tax",
        department: "tax",
        categories: ["tax"],
        intakeQuestions: [
            { id: "taxpayer_scope", prompt: "Is this for a company or an individual?", required: true },
            { id: "business_or_name", prompt: "Company or taxpayer legal name?", required: true },
            { id: "tax_year", prompt: "Which tax year?", required: true },
            { id: "provisional_period", prompt: "Which provisional payment (first, second, or third)?", required: true },
            { id: "estimated_taxable", prompt: "Estimated taxable income or turnover (if known)?", required: false },
            { id: "prior_payments", prompt: "Any provisional tax already paid this year?", required: false },
            { id: "deadline", prompt: "Known SARS payment deadline?", required: false },
        ],
        documentChecklist: [
            { docKey: "ytd_accounts", label: "Year-to-date accounts or management figures", reason: "Estimate basis.", required: true },
            { docKey: "prior_provisional", label: "Prior provisional tax calculations", required: false },
            { docKey: "sars_correspondence", label: "SARS correspondence", required: false },
        ],
    },
    tax_clearance: {
        serviceType: "tax_clearance",
        label: "Tax clearance certificate",
        department: "tax",
        categories: ["tax"],
        intakeQuestions: [
            { id: "entity_scope", prompt: "Certificate for a company or an individual?", required: true },
            { id: "legal_name", prompt: "Legal name of taxpayer?", required: true },
            { id: "tax_number", prompt: "Tax reference number (if available)?", required: false, hint: "Collect securely; do not repeat unnecessarily in chat." },
            { id: "certificate_purpose", prompt: "What is the certificate for (tender, contract, finance, other)?", required: true },
            { id: "urgency", prompt: "How urgent is the certificate?", required: true },
            { id: "compliance_status", prompt: "Are all tax returns and payments believed to be up to date?", required: false },
        ],
        documentChecklist: [
            { docKey: "company_registration_cert", label: "Company registration (if company)", required: false },
            { docKey: "authorisation_letter", label: "Authorisation letter (if third party requests)", required: false },
            { docKey: "sars_correspondence", label: "Outstanding SARS notices", reason: "Compliance blockers.", required: false },
        ],
    },
    sars_correspondence: {
        serviceType: "sars_correspondence",
        label: "SARS letter or query review",
        department: "tax",
        categories: ["tax"],
        intakeQuestions: [
            { id: "taxpayer_scope", prompt: "Is the letter for you personally or for a business?", required: true },
            { id: "legal_name", prompt: "Taxpayer or business name?", required: true },
            { id: "tax_type", prompt: "Which tax type is involved (VAT, PAYE, income tax, other)?", required: true },
            { id: "letter_received", prompt: "When did you receive the letter?", required: false },
            { id: "deadline", prompt: "Is there a response deadline on the letter?", required: false },
            { id: "matter_summary", prompt: "In your own words, what is SARS asking for?", required: true },
        ],
        documentChecklist: [
            { docKey: "sars_letter", label: "SARS letter / notice (upload securely)", reason: "Professional review.", required: true },
            { docKey: "supporting_records", label: "Supporting records mentioned in the letter", required: false },
            { docKey: "prior_returns", label: "Related prior returns", required: false },
        ],
    },
    beneficial_ownership: {
        serviceType: "beneficial_ownership",
        label: "Beneficial ownership filing",
        department: "corporate_compliance",
        categories: ["corporate_compliance"],
        intakeQuestions: [
            { id: "company_name", prompt: "Company name?", required: true },
            { id: "cipc_number", prompt: "CIPC registration number?", required: true },
            { id: "filing_type", prompt: "New BO filing, correction, or status enquiry?", required: true },
            { id: "bo_changes", prompt: "Have beneficial owners changed since the last filing?", required: false },
            { id: "deadline", prompt: "CIPC or compliance deadline (if known)?", required: false },
        ],
        documentChecklist: [
            { docKey: "director_id", label: "IDs of directors / natural persons", reason: "Sensitive — secure upload.", required: true },
            { docKey: "shareholder_register", label: "Shareholder / member register", required: true },
            { docKey: "ownership_structure", label: "Ownership structure diagram or summary", required: false },
            { docKey: "cipc_bo_form", label: "Completed BO forms (if already prepared)", required: false },
        ],
    },
    csd: {
        serviceType: "csd",
        label: "CSD supplier registration",
        department: "corporate_compliance",
        categories: ["corporate_compliance"],
        intakeQuestions: [
            { id: "csd_scenario", prompt: "New CSD registration, update, or status check?", required: true },
            { id: "business_name", prompt: "Supplier / company name?", required: true },
            { id: "cipc_number", prompt: "CIPC registration number?", required: false },
            { id: "tax_compliant", prompt: "Is tax believed to be up to date for CSD?", required: true },
            { id: "banking_ready", prompt: "Do you have banking details for supplier registration?", required: false },
            { id: "tender_context", prompt: "Is this for a specific tender (if so which)?", required: false },
        ],
        documentChecklist: [
            { docKey: "company_registration_cert", label: "Company registration certificate", required: true },
            { docKey: "tax_clearance", label: "Tax clearance (if available)", required: false },
            { docKey: "bank_confirmation", label: "Bank confirmation letter", required: false },
            { docKey: "director_id", label: "Director ID copies", required: true },
        ],
    },
    rma: {
        serviceType: "rma",
        label: "RMA registration or renewal",
        department: "corporate_compliance",
        categories: ["corporate_compliance"],
        intakeQuestions: [
            { id: "rma_scenario", prompt: "New RMA registration, renewal, or update?", required: true },
            { id: "business_name", prompt: "Registered business name?", required: true },
            { id: "industry_risk", prompt: "Industry or risk category (if known)?", required: false },
            { id: "existing_rma", prompt: "Existing RMA registration number?", required: false },
            { id: "renewal_period", prompt: "Renewal year or period?", required: false },
            { id: "deadline", prompt: "Known renewal deadline?", required: false },
        ],
        documentChecklist: [
            { docKey: "rma_certificate", label: "Current RMA certificate (if renewing)", required: false },
            { docKey: "company_registration_cert", label: "Company registration certificate", required: true },
            { docKey: "prior_returns", label: "Prior RMA returns", required: false },
        ],
    },
    management_accounts: {
        serviceType: "management_accounts",
        label: "Management accounts",
        department: "accounting",
        categories: ["bookkeeping"],
        intakeQuestions: [
            { id: "business_name", prompt: "Which business requires management accounts?", required: true },
            { id: "reporting_period", prompt: "Which reporting period?", required: true },
            { id: "report_frequency", prompt: "Monthly, quarterly, or special report?", required: true },
            { id: "records_current", prompt: "Are accounting records up to date?", required: true },
            { id: "business_question", prompt: "Is there a particular business question the report should address?", required: false },
            { id: "deadline", prompt: "Deadline for delivery?", required: false },
        ],
        documentChecklist: [
            { docKey: "bank_statements", label: "Bank statements for the period", required: true },
            { docKey: "sales_invoices", label: "Sales invoices / revenue detail", required: true },
            { docKey: "purchase_invoices", label: "Purchase and expense detail", required: true },
            { docKey: "prior_management_accounts", label: "Prior management accounts", required: false },
        ],
    },
    annual_financial_statements: {
        serviceType: "annual_financial_statements",
        label: "Annual financial statements (AFS)",
        department: "accounting",
        categories: ["financial_statement"],
        intakeQuestions: [
            { id: "business_name", prompt: "Business name?", required: true },
            { id: "financial_year_end", prompt: "Financial year-end date?", required: true },
            { id: "financial_period", prompt: "Financial year / period for the AFS?", required: true },
            { id: "entity_type", prompt: "Entity type?", required: true },
            { id: "records_available", prompt: "Are full accounting records available?", required: true },
            { id: "prior_afs", prompt: "Do you have previous annual financial statements?", required: false },
            { id: "completion_date", prompt: "Required completion date?", required: false },
            { id: "audit_or_review", prompt: "Is audit, independent review, or compilation required?", required: false },
        ],
        documentChecklist: [
            { docKey: "bank_statements", label: "Bank statements (full year)", required: true },
            { docKey: "trial_balance", label: "Trial balance", required: true },
            { docKey: "prior_afs", label: "Prior year AFS", required: false },
            { docKey: "fixed_asset_register", label: "Fixed asset register", required: false },
            { docKey: "loan_agreements", label: "Loan / liability agreements", required: false },
        ],
    },
    payroll_onboarding: {
        serviceType: "payroll_onboarding",
        label: "Payroll client onboarding",
        department: "payroll",
        categories: ["payroll"],
        intakeQuestions: [
            { id: "business_name", prompt: "Business name?", required: true },
            { id: "employee_count", prompt: "How many employees?", required: true },
            { id: "payroll_frequency", prompt: "Payroll frequency (weekly, monthly, etc.)?", required: true },
            { id: "payroll_software", prompt: "Current payroll software or process?", required: false },
            { id: "payroll_start", prompt: "Desired payroll start date?", required: true },
            { id: "paye_registered", prompt: "Is the business registered for PAYE?", required: true },
            { id: "uif_registered", prompt: "Is UIF registered?", required: true },
            { id: "sdl_applicable", prompt: "Does SDL apply to the business?", required: false },
            { id: "employee_records", prompt: "Are employee records available to upload?", required: true },
        ],
        documentChecklist: [
            { docKey: "employee_list", label: "Employee list with IDs and tax numbers", reason: "Sensitive — secure upload.", required: true },
            { docKey: "paye_registration", label: "PAYE registration letter", required: false },
            { docKey: "uif_registration", label: "UIF registration", required: false },
            { docKey: "sample_payslips", label: "Sample payslips (if switching from another provider)", required: false },
        ],
    },
});

/** Published pack order (Sarah / docs). */
export const SACH_WORKFLOW_PACK_ORDER = Object.freeze([
    "vat",
    "paye",
    "emp201",
    "emp501",
    "income_tax_personal",
    "income_tax_company",
    "provisional_tax",
    "tax_clearance",
    "sars_correspondence",
    "bookkeeping",
    "management_accounts",
    "annual_financial_statements",
    "payroll_onboarding",
    "payroll_monthly",
    "cipc_registration",
    "cipc_annual_return",
    "cipc_director_change",
    "beneficial_ownership",
    "coida",
    "cidb",
    "csd",
    "rma",
]);

export function listWorkflowPackSummaries() {
    return Object.values(SACH_WORKFLOW_PACKS).map((p) => ({
        serviceType: p.serviceType,
        label: p.label,
        department: p.department,
        categories: p.categories,
        questionCount: p.intakeQuestions.length,
        documentCount: p.documentChecklist.length,
    }));
}

/**
 * @param {string} serviceType
 * @returns {SachWorkflowPack | null}
 */
export function getWorkflowPack(serviceType) {
    const key = String(serviceType || "").trim().toLowerCase();
    return SACH_WORKFLOW_PACKS[key] || null;
}

/**
 * @param {SachWorkflowPack} pack
 * @param {Record<string, string>} intakeAnswers
 */
export function listIntakeGaps(pack, intakeAnswers = {}) {
    const gaps = [];
    for (const q of pack.intakeQuestions) {
        if (!q.required) continue;
        const val = String(intakeAnswers[q.id] || "").trim();
        if (!val) gaps.push(q);
    }
    return gaps;
}

/**
 * Initialise checklist rows for persistence on a service request.
 * @param {SachWorkflowPack} pack
 */
export function buildInitialDocumentChecklist(pack) {
    return pack.documentChecklist.map((row) => ({
        docKey: row.docKey,
        label: row.label,
        reason: row.reason || null,
        required: row.required !== false,
        status: "requested",
    }));
}

/**
 * @param {SachWorkflowPack} pack
 * @param {Record<string, string>} intakeAnswers
 */
export function suggestNextAction(pack, intakeAnswers = {}, checklist = []) {
    const gaps = listIntakeGaps(pack, intakeAnswers);
    if (gaps.length) {
        return `Collect: ${gaps[0].prompt}`;
    }
    const missingDocs = (checklist || []).filter(
        (d) => d.required && !["uploaded", "accepted", "under_review"].includes(d.status)
    );
    if (missingDocs.length) {
        return `Request documents: ${missingDocs.map((d) => d.label).join(", ")}`;
    }
    return "Ready for client review and submit";
}

/**
 * Guidance block for Sarah system context (compact).
 * @param {SachWorkflowPack} pack
 */
export function formatWorkflowGuidanceForSarah(pack) {
    const questions = pack.intakeQuestions
        .map((q, i) => `${i + 1}. [${q.id}] ${q.prompt}${q.required ? " (required)" : ""}`)
        .join("\n");
    const docs = pack.documentChecklist
        .map((d) => `• ${d.docKey}: ${d.label}${d.required ? " (required)" : ""}`)
        .join("\n");
    return [
        `WORKFLOW: ${pack.label} (${pack.serviceType})`,
        `Department: ${pack.department}`,
        `Ask one intake question at a time unless the client already answered it.`,
        `INTAKE FIELDS:\n${questions}`,
        `DOCUMENT CHECKLIST (explain why; use registerSachServiceDocument with matching docKey as documentType):\n${docs}`,
    ].join("\n\n");
}