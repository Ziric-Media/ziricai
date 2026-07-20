/**
 * Pre-built workflow templates — one-click install per industry.
 */

function node(id, type, stepType, label, icon, config = {}, branch = null) {
    return { id, type, stepType, label, icon, config, ...(branch ? { branch } : {}) };
}

export const WORKFLOW_TEMPLATES = [
    /* ── Automotive ── */
    {
        id: 'tpl-automotive-finance-enquiry',
        name: 'Finance Enquiry',
        industry: 'Automotive',
        category: 'automotive',
        description: 'Qualify finance leads via WhatsApp, generate AI proposal, create CRM task, and assign sales with 24h follow-up.',
        icon: 'fa-solid fa-hand-holding-dollar',
        companyHint: 'Central Motors',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Contains "finance"', 'fa-solid fa-filter', { keyword: 'finance', matchMode: 'any' }),
            node('n3', 'ai_action', 'generate_proposal', 'AI Generate Proposal', 'fa-solid fa-wand-magic-sparkles', { template: 'vehicle_finance', includeTradeIn: true }),
            node('n4', 'action', 'create_task', 'Create CRM Task', 'fa-solid fa-list-check', { title: 'Finance enquiry follow-up', priority: 'high' }),
            node('n5', 'action', 'assign_human', 'Assign Sales', 'fa-solid fa-user-tie', { department: 'Sales', roundRobin: true }),
            node('n6', 'action', 'delay', 'Follow up 24h', 'fa-solid fa-clock', { hours: 24, action: 'send_reminder' }),
        ],
    },
    {
        id: 'tpl-automotive-test-drive',
        name: 'Test Drive Booking',
        industry: 'Automotive',
        category: 'automotive',
        description: 'Capture test drive requests, check business hours, book slot, and confirm via WhatsApp.',
        icon: 'fa-solid fa-car',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Contains "test drive"', 'fa-solid fa-filter', { keyword: 'test drive', matchMode: 'any' }),
            node('n3', 'condition', 'business_hours', 'Business Hours', 'fa-solid fa-clock', { timezone: 'Africa/Johannesburg', start: '08:00', end: '17:00' }),
            node('n4', 'ai_action', 'extract_entities', 'Extract Vehicle & Date', 'fa-solid fa-tags', { entities: ['vehicle', 'date', 'time'] }),
            node('n5', 'action', 'reply', 'Send Booking Confirmation', 'fa-solid fa-reply', { template: 'test_drive_confirmation' }),
            node('n6', 'action', 'update_crm', 'Update CRM Lead', 'fa-solid fa-address-book', { stage: 'test_drive_scheduled' }),
        ],
    },
    {
        id: 'tpl-automotive-service-reminder',
        name: 'Service Reminder',
        industry: 'Automotive',
        category: 'automotive',
        description: 'Scheduled reminder for upcoming service appointments with WhatsApp nudge.',
        icon: 'fa-solid fa-wrench',
        nodes: [
            node('n1', 'trigger', 'scheduled', 'Scheduled Trigger', 'fa-solid fa-calendar-days', { cron: '0 9 * * 1', label: 'Every Monday 9am' }),
            node('n2', 'condition', 'lead_score', 'Due for Service', 'fa-solid fa-gauge-high', { field: 'daysSinceService', operator: 'gte', value: 180 }),
            node('n3', 'action', 'reply', 'WhatsApp Reminder', 'fa-solid fa-reply', { template: 'service_reminder' }),
            node('n4', 'action', 'create_task', 'Create Service Task', 'fa-solid fa-list-check', { title: 'Service booking outreach', priority: 'normal' }),
        ],
    },
    /* ── Schools ── */
    {
        id: 'tpl-schools-admission',
        name: 'Admission Enquiry',
        industry: 'Schools',
        category: 'schools',
        description: 'Handle admission questions, classify intent, and route to admissions team.',
        icon: 'fa-solid fa-graduation-cap',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Admission keywords', 'fa-solid fa-filter', { keyword: 'admission, enrol, register', matchMode: 'any' }),
            node('n3', 'ai_action', 'classify', 'Classify Enquiry Type', 'fa-solid fa-shapes', { categories: ['primary', 'high_school', 'fees', 'general'] }),
            node('n4', 'action', 'assign_human', 'Assign Admissions', 'fa-solid fa-user-tie', { department: 'Admissions' }),
            node('n5', 'action', 'reply', 'Send Info Pack', 'fa-solid fa-reply', { template: 'admission_info_pack' }),
        ],
    },
    {
        id: 'tpl-schools-fee-reminder',
        name: 'Fee Reminder',
        industry: 'Schools',
        category: 'schools',
        description: 'Payment received trigger with overdue fee follow-up workflow.',
        icon: 'fa-solid fa-money-bill-wave',
        nodes: [
            node('n1', 'trigger', 'payment_received', 'Payment Received', 'fa-solid fa-credit-card', {}),
            node('n2', 'action', 'reply', 'Thank You Message', 'fa-solid fa-reply', { template: 'payment_thank_you' }),
            node('n3', 'trigger', 'scheduled', 'Monthly Fee Check', 'fa-solid fa-calendar-days', { cron: '0 8 1 * *' }),
            node('n4', 'condition', 'lead_score', 'Overdue Balance', 'fa-solid fa-gauge-high', { field: 'balanceOverdue', operator: 'gt', value: 0 }),
            node('n5', 'action', 'send_email', 'Email Fee Statement', 'fa-solid fa-envelope', { template: 'fee_statement' }),
        ],
    },
    /* ── Funeral ── */
    {
        id: 'tpl-funeral-booking',
        name: 'Funeral Booking',
        industry: 'Funeral',
        category: 'funeral',
        description: 'Sensitive intake for funeral arrangements with human escalation.',
        icon: 'fa-solid fa-heart',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'ai_action', 'classify', 'Detect Urgency', 'fa-solid fa-shapes', { categories: ['immediate', 'planning', 'general'] }),
            node('n3', 'condition', 'sentiment', 'Sentiment Check', 'fa-solid fa-face-sad-tear', { threshold: 'distressed', escalateBelow: 0.3 }),
            node('n4', 'action', 'assign_human', 'Assign Consultant', 'fa-solid fa-user-tie', { department: 'Arrangements', priority: 'urgent' }),
            node('n5', 'action', 'reply', 'Compassionate Acknowledgment', 'fa-solid fa-reply', { template: 'funeral_acknowledgment', tone: 'empathetic' }),
        ],
    },
    {
        id: 'tpl-funeral-claims',
        name: 'Claims Assistance',
        industry: 'Funeral',
        category: 'funeral',
        description: 'Guide families through insurance and policy claims documentation.',
        icon: 'fa-solid fa-file-contract',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Contains "claim"', 'fa-solid fa-filter', { keyword: 'claim, policy, insurance', matchMode: 'any' }),
            node('n3', 'ai_action', 'summarize', 'Summarize Claim Details', 'fa-solid fa-file-lines', {}),
            node('n4', 'action', 'create_task', 'Claims Documentation Task', 'fa-solid fa-list-check', { title: 'Prepare claims pack', priority: 'high' }),
            node('n5', 'action', 'notify_manager', 'Notify Claims Manager', 'fa-solid fa-bell', { channel: 'email' }),
        ],
    },
    /* ── Law ── */
    {
        id: 'tpl-law-consultation',
        name: 'Consultation Booking',
        industry: 'Law',
        category: 'law',
        description: 'Book legal consultations and capture matter type.',
        icon: 'fa-solid fa-scale-balanced',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Consultation request', 'fa-solid fa-filter', { keyword: 'consultation, appointment, lawyer', matchMode: 'any' }),
            node('n3', 'ai_action', 'extract_entities', 'Extract Matter Type', 'fa-solid fa-tags', { entities: ['practice_area', 'urgency'] }),
            node('n4', 'action', 'update_crm', 'Create Matter Record', 'fa-solid fa-address-book', { stage: 'consultation_requested' }),
            node('n5', 'action', 'reply', 'Send Booking Link', 'fa-solid fa-reply', { template: 'consultation_booking' }),
        ],
    },
    {
        id: 'tpl-law-case-intake',
        name: 'Case Intake',
        industry: 'Law',
        category: 'law',
        description: 'Structured case intake with AI confidence gate before human review.',
        icon: 'fa-solid fa-folder-open',
        nodes: [
            node('n1', 'trigger', 'email_received', 'Email Received', 'fa-solid fa-envelope', {}),
            node('n2', 'ai_action', 'classify', 'Classify Case Type', 'fa-solid fa-shapes', { categories: ['litigation', 'corporate', 'family', 'criminal'] }),
            node('n3', 'condition', 'ai_confidence', 'Confidence Gate', 'fa-solid fa-brain', { minConfidence: 0.75 }),
            node('n4', 'action', 'create_task', 'Attorney Review Task', 'fa-solid fa-list-check', { title: 'Review intake', priority: 'high' }),
            node('n5', 'action', 'notify_manager', 'Notify Partner', 'fa-solid fa-bell', {}),
        ],
    },
    /* ── Churches ── */
    {
        id: 'tpl-churches-prayer',
        name: 'Prayer Requests',
        industry: 'Churches',
        category: 'churches',
        description: 'Collect prayer requests with pastoral team notification.',
        icon: 'fa-solid fa-hands-praying',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Prayer keywords', 'fa-solid fa-filter', { keyword: 'pray, prayer, intercede', matchMode: 'any' }),
            node('n3', 'ai_action', 'summarize', 'Summarize Request', 'fa-solid fa-file-lines', { redactPII: false }),
            node('n4', 'action', 'notify_manager', 'Notify Pastoral Team', 'fa-solid fa-bell', { channel: 'whatsapp' }),
            node('n5', 'action', 'reply', 'Acknowledge & Pray', 'fa-solid fa-reply', { template: 'prayer_acknowledgment' }),
        ],
    },
    {
        id: 'tpl-churches-donations',
        name: 'Donations',
        industry: 'Churches',
        category: 'churches',
        description: 'Handle donation enquiries and send payment links.',
        icon: 'fa-solid fa-hand-holding-heart',
        nodes: [
            node('n1', 'trigger', 'whatsapp_message', 'WhatsApp Message', 'fa-brands fa-whatsapp', {}),
            node('n2', 'condition', 'contains_keyword', 'Donation keywords', 'fa-solid fa-filter', { keyword: 'donate, tithe, offering, give', matchMode: 'any' }),
            node('n3', 'action', 'reply', 'Send Payment Link', 'fa-solid fa-reply', { template: 'donation_link' }),
            node('n4', 'trigger', 'payment_received', 'Payment Received', 'fa-solid fa-credit-card', {}),
            node('n5', 'action', 'reply', 'Thank You Receipt', 'fa-solid fa-reply', { template: 'donation_thank_you' }),
        ],
    },
];

export function getTemplateById(id) {
    return WORKFLOW_TEMPLATES.find((t) => t.id === id) || null;
}

export function cloneTemplateNodes(templateNodes) {
    return templateNodes.map((n) => ({
        ...n,
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        config: { ...n.config },
        branch: n.branch
            ? {
                  yes: n.branch.yes ? cloneTemplateNodes(n.branch.yes) : [],
                  no: n.branch.no ? cloneTemplateNodes(n.branch.no) : [],
              }
            : undefined,
    }));
}
