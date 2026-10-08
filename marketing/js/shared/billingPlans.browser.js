/**

 * Browser build of billing plans — mirrors services/platform/billingPlans.js for static pages.

 * Loads live plans from /api/billing/plans when available; falls back to embedded canonical data.

 */

(function (global) {

    'use strict';



    const FALLBACK_PLANS = [

        {

            id: 'trial',

            label: 'Trial',

            price: 0,

            currency: 'ZAR',

            billingCycle: 'monthly',

            trialDays: 14,

            tagline: '14-day free trial',

            features: ['1 AI Employee', '100 conversations', '1 team member', '500 MB storage'],

        },

        {

            id: 'starter',

            label: 'Starter',

            price: 999.99,

            currency: 'ZAR',

            billingCycle: 'monthly',

            tagline: 'For small teams getting started',

            features: ['1 AI Employee', '1,500 conversations', '2 users', '2 GB storage'],

        },

        {

            id: 'professional',

            label: 'Professional',

            price: 2999,

            currency: 'ZAR',

            billingCycle: 'monthly',

            tagline: 'Grow with more AI capacity',

            featured: true,

            features: ['5 AI Employees', '5,000 conversations', '10 users', '5 GB storage'],

        },

        {

            id: 'business',

            label: 'Business',

            price: 4999,

            currency: 'ZAR',

            billingCycle: 'monthly',

            tagline: 'Scale with workflows & knowledge',

            features: ['10 AI Employees', 'Unlimited workflows', '50 users', 'Unlimited knowledge'],

        },

        {

            id: 'enterprise',

            label: 'Enterprise',

            price: null,

            currency: 'ZAR',

            billingCycle: 'monthly',

            contactSales: true,

            tagline: 'Unlimited everything + SLA',

            features: ['Unlimited AI', 'Unlimited users', 'Dedicated support', 'Custom SLA'],

        },

    ];



    const PUBLIC_PLAN_IDS = ['starter', 'professional', 'business', 'enterprise'];

    let plans = FALLBACK_PLANS.slice();



    function getPlan(planId) {

        return plans.find((p) => p.id === planId) || plans.find((p) => p.id === 'trial') || FALLBACK_PLANS[0];

    }



    function getAllPlans() {

        return plans.slice();

    }



    function getPublicPlans() {

        return PUBLIC_PLAN_IDS.map((id) => getPlan(id));

    }



    function formatPrice(amount, currency, opts) {

        const suffix = (opts && opts.suffix) || '';

        if (amount == null) return 'Custom';

        if (Number(amount) === 0) return 'Free';

        const prefix = (currency || 'ZAR') === 'ZAR' ? 'R' : `${currency} `;

        const num = Number(amount);

        let formatted;

        if (Number.isInteger(num)) {

            formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        } else {

            const parts = num.toFixed(2).split('.');

            formatted = `${parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${parts[1]}`;

        }

        return `${prefix}${formatted}${suffix}`;

    }



    function getMinimumPlanPrice() {

        return getPlan('starter').price;

    }



    function formatPlanPriceLine(plan) {

        if (plan.price == null || plan.contactSales) {

            return `${plan.label} Custom pricing`;

        }

        return `${plan.label} ${formatPrice(plan.price)}/month`;

    }



    function getPricingSummaryText() {

        const planLines = getPublicPlans().map((plan) => `${formatPlanPriceLine(plan)} (${plan.features[0]})`);

        return (

            `Plans: ${planLines.join(', ')}. ` +

            'All plans include a 14-day free trial, WhatsApp + web channels, CRM, analytics, and Sarah as your operating assistant. ' +

            'Most businesses recover the cost from after-hours leads in the first week.'

        );

    }



    function getDefaultPlatformReply() {

        return (

            'ZiricAI deploys AI Employees to handle customer enquiries 24/7 on WhatsApp, web, and social. ' +

            `Setup takes under 10 minutes, plans start at ${formatPrice(getMinimumPlanPrice())}/month, ` +

            'and you get a 14-day free trial. Ask about pricing, setup, industries, WhatsApp, CRM, automation, or the Knowledge Base — or click Start Free Trial to get going!'

        );

    }



    function setPlans(nextPlans) {

        if (Array.isArray(nextPlans) && nextPlans.length) {

            plans = nextPlans;

        }

    }



    async function refreshFromApi() {

        try {

            const res = await fetch('/api/billing/plans', { headers: { Accept: 'application/json' } });

            if (!res.ok) return false;

            const data = await res.json();

            if (Array.isArray(data.plans) && data.plans.length) {

                setPlans(data.plans);

                return true;

            }

        } catch {

            /* static hosting or offline — keep fallback */

        }

        return false;

    }



    global.ZiricBillingPlans = {

        getPlan,

        getAllPlans,

        getPublicPlans,

        formatPrice,

        getMinimumPlanPrice,

        getPricingSummaryText,

        getDefaultPlatformReply,

        refreshFromApi,

        PUBLIC_PLAN_IDS,

    };



    refreshFromApi();

})(typeof window !== 'undefined' ? window : globalThis);


