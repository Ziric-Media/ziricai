/**
 * Browser ES module — billing plans for static deploys (app/admin/marketing).
 * Synced from services/platform/billingPlans.js by prepare-sites. Node/API uses services/ path.
 * Do not import from services/ in client bundles.
 */

export const BILLING_PLANS = {

    trial: {

        id: "trial",

        label: "Trial",

        price: 0,

        currency: "ZAR",

        billingCycle: "monthly",

        trialDays: 14,

        tagline: "14-day free trial",

        features: ["1 AI Employee", "100 conversations", "1 team member", "500 MB storage"],

        limits: {

            aiEmployees: 1,

            conversations: 100,

            messages: 500,

            tokens: 50000,

            users: 1,

            storageMb: 512,

            workflows: 2,

            knowledgeDocs: 10,

            workflowRuns: 50,

            apiCalls: 1000,

            knowledgeSizeMb: 50,

        },

    },

    starter: {

        id: "starter",

        label: "Starter",

        price: 999.99,

        currency: "ZAR",

        billingCycle: "monthly",

        tagline: "For small teams getting started",

        features: ["1 AI Employee", "1,500 conversations", "2 users", "2 GB storage"],

        limits: {

            aiEmployees: 1,

            conversations: 1500,

            messages: 1000,

            tokens: 100000,

            users: 2,

            storageMb: 2048,

            workflows: 5,

            knowledgeDocs: 25,

            workflowRuns: 200,

            apiCalls: 5000,

            knowledgeSizeMb: 200,

        },

    },

    professional: {

        id: "professional",

        label: "Professional",

        price: 2999,

        currency: "ZAR",

        billingCycle: "monthly",

        tagline: "Grow with more AI capacity",

        featured: true,

        features: ["5 AI Employees", "5,000 conversations", "10 users", "5 GB storage"],

        limits: {

            aiEmployees: 5,

            conversations: 5000,

            messages: 3000,

            tokens: 250000,

            users: 10,

            storageMb: 5120,

            workflows: 20,

            knowledgeDocs: 100,

            workflowRuns: 1000,

            apiCalls: 25000,

            knowledgeSizeMb: 500,

        },

    },

    business: {

        id: "business",

        label: "Business",

        price: 4999,

        currency: "ZAR",

        billingCycle: "monthly",

        tagline: "Scale with workflows & knowledge",

        features: ["10 AI Employees", "Unlimited workflows", "50 users", "Unlimited knowledge"],

        limits: {

            aiEmployees: 10,

            conversations: 5000,

            messages: 5000,

            tokens: 500000,

            users: 50,

            storageMb: 10240,

            workflows: null,

            knowledgeDocs: null,

            workflowRuns: null,

            apiCalls: 50000,

            knowledgeSizeMb: null,

        },

    },

    enterprise: {

        id: "enterprise",

        label: "Enterprise",

        price: null,

        currency: "ZAR",

        billingCycle: "monthly",

        contactSales: true,

        tagline: "Unlimited everything + SLA",

        features: ["Unlimited AI", "Unlimited users", "Dedicated support", "Custom SLA"],

        limits: {

            aiEmployees: null,

            conversations: null,

            messages: null,

            tokens: null,

            users: null,

            storageMb: null,

            workflows: null,

            knowledgeDocs: null,

            workflowRuns: null,

            apiCalls: null,

            knowledgeSizeMb: null,

        },

    },

};



export function getPlan(planId) {

    return BILLING_PLANS[planId] || BILLING_PLANS.trial;

}



export function getAllPlans() {

    return Object.values(BILLING_PLANS);

}



/** Alias for API clarity. */

export const getPlans = getAllPlans;



/** Alias for API clarity. */

export const getPlanById = getPlan;



/** Paid tiers shown on marketing and plan pickers (excludes trial). */

export const PUBLIC_PLAN_IDS = ["starter", "professional", "business", "enterprise"];



export function getPublicPlans() {

    return PUBLIC_PLAN_IDS.map((id) => getPlan(id));

}



/** Plan id marked featured on marketing cards (e.g. "Most Popular" badge). */

export function getFeaturedPlanId() {

    const featured = getPublicPlans().find((plan) => plan.featured);

    return featured?.id || "professional";

}



/**

 * @param {number|null} amount

 * @param {string} [currency='ZAR']

 * @param {{ suffix?: string, compact?: boolean }} [opts]

 */

export function formatPrice(amount, currency = "ZAR", opts = {}) {

    const { suffix = "" } = opts;

    if (amount == null) return "Custom";

    if (Number(amount) === 0) return "Free";



    const prefix = currency === "ZAR" ? "R" : `${currency} `;

    const num = Number(amount);

    let formatted;

    if (Number.isInteger(num)) {

        formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    } else {

        const [intPart, decPart] = num.toFixed(2).split(".");

        formatted = `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decPart}`;

    }

    return suffix ? `${prefix}${formatted}${suffix}` : `${prefix}${formatted}`;

}



export function getMinimumPlanPrice() {

    return getPlan("starter").price;

}



function formatPlanPriceLine(plan) {

    if (plan.price == null || plan.contactSales) {

        return `${plan.label} Custom pricing`;

    }

    return `${plan.label} ${formatPrice(plan.price)}/month`;

}



/** Marketing / FAQ copy derived from canonical plan definitions. */

export function getPricingSummaryText() {

    const planLines = getPublicPlans().map((plan) => `${formatPlanPriceLine(plan)} (${plan.features[0]})`);

    return (

        `Plans: ${planLines.join(", ")}. ` +

        "All plans include a 14-day free trial, WhatsApp + web channels, CRM, analytics, and Sarah as your operating assistant. " +

        "Most businesses recover the cost from after-hours leads in the first week."

    );

}



export function getDefaultPlatformReply() {

    return (

        "ZiricAI deploys AI Employees to handle customer enquiries 24/7 on WhatsApp, web, and social. " +

        `Setup takes under 10 minutes, plans start at ${formatPrice(getMinimumPlanPrice())}/month, ` +

        "and you get a 14-day free trial. Ask about pricing, setup, industries, WhatsApp, CRM, automation, or the Knowledge Base — or say what you'd like to set up."

    );

}



export function getPlanLimits(planId) {

    return getPlan(planId).limits;

}



/**

 * @param {string} planId

 * @param {string} resource - aiEmployees | conversations | messages | users | etc.

 * @param {number} currentUsage

 * @param {number} [increment=1]

 */

export function checkPlanLimit(planId, resource, currentUsage, increment = 1) {

    const limits = getPlanLimits(planId);

    const limit = limits[resource];



    if (limit == null) {

        return { allowed: true, unlimited: true, limit: null, usage: currentUsage };

    }



    const next = currentUsage + increment;

    return {

        allowed: next <= limit,

        unlimited: false,

        limit,

        usage: currentUsage,

        remaining: Math.max(0, limit - currentUsage),

        planId,

        resource,

        message:

            next <= limit

                ? null

                : `${getPlan(planId).label} plan allows up to ${limit} ${resource.replace(/([A-Z])/g, " $1").toLowerCase()}. Upgrade to continue.`,

    };

}



/** Build usage snapshot with limits for portal meters. */

export function buildUsageFromPlan(planId, seed = 0) {

    const plan = getPlan(planId);

    const limits = plan.limits;

    const factor = 0.15 + (Math.abs(seed) % 35) / 100;



    const pct = (max) => (max ? Math.max(1, Math.round(max * factor)) : 0);



    const trialEnds = new Date();

    if (planId === "trial") {

        trialEnds.setDate(trialEnds.getDate() + plan.trialDays);

    }



    return {

        plan: plan.id,

        planLabel: plan.label,

        amount: plan.price,

        currency: plan.currency,

        billingCycle: plan.billingCycle,

        trialDays: plan.trialDays || null,

        trialEndsAt: planId === "trial" ? trialEnds.toISOString().slice(0, 10) : null,

        renewalDate: trialEnds.toISOString().slice(0, 10),

        messagesUsed: pct(limits.messages),

        messagesLimit: limits.messages,

        tokensUsed: pct(limits.tokens),

        tokensLimit: limits.tokens,

        storageUsedMb: pct(limits.storageMb),

        storageLimitMb: limits.storageMb,

        conversationsUsed: pct(limits.conversations),

        conversationsLimit: limits.conversations,

        aiEmployeesUsed: planId === "trial" ? 1 : Math.min(pct(limits.aiEmployees) || 1, limits.aiEmployees || 99),

        aiEmployeesLimit: limits.aiEmployees,

        usersUsed: 1,

        usersLimit: limits.users,

        knowledgeDocsUsed: pct(limits.knowledgeDocs),

        knowledgeDocsLimit: limits.knowledgeDocs,

        knowledgeSizeMbUsed: pct(limits.knowledgeSizeMb),

        knowledgeSizeMbLimit: limits.knowledgeSizeMb,

        workflowRunsUsed: pct(limits.workflowRuns),

        workflowRunsLimit: limits.workflowRuns,

        apiCallsUsed: pct(limits.apiCalls),

        apiCallsLimit: limits.apiCalls,

    };

}


