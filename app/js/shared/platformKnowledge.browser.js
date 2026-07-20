/**

 * Browser build of platform FAQ — mirrors js/shared/platformKnowledge.js for landing Sarah.

 * Pricing copy is resolved from ZiricBillingPlans (services/platform/billingPlans.js).

 */

(function (global) {

    'use strict';



    function getPricingAnswer() {

        return global.ZiricBillingPlans?.getPricingSummaryText?.() ||

            'Plans: Starter R999.99/month (1 AI Employee), Professional R2,999/month (5 AI Employees), Business R4,999/month (10 AI Employees), Enterprise Custom pricing (Unlimited AI). All plans include a 14-day free trial.';

    }



    function getDefaultReply() {

        return global.ZiricBillingPlans?.getDefaultPlatformReply?.() ||

            'ZiricAI deploys AI Employees to handle customer enquiries 24/7 on WhatsApp, web, and social. Setup takes under 10 minutes, plans start at R999.99/month, and you get a 14-day free trial. Ask about pricing, setup, industries, WhatsApp, CRM, automation, or the Knowledge Base — or click Start Free Trial to get going!';

    }



    const PLATFORM_FAQ = {

        overview: {

            keywords: ['how does ziricai work', 'what is ziricai', 'how it works', 'platform', 'explain'],

            answer:

                'ZiricAI is an AI operating platform for businesses. You deploy AI Employees (like Reception, Sales, or Support) that answer customers on WhatsApp, web chat, and social — 24/7. Sarah is your in-portal AI assistant who helps you set up employees, upload knowledge, connect channels, and run the business. Typical flow: create account → pick an industry pack → connect WhatsApp → upload FAQs/policies → AI handles enquiries instantly.',

        },

        aiEmployee: {

            keywords: ['ai employee', 'ai agent', 'reception ai', 'what is an ai', 'employee'],

            answer:

                'An AI Employee is a dedicated AI agent with its own name, role (Sales, Reception, Support, etc.), system prompt, and linked Knowledge Base. Each employee answers on assigned channels using only your uploaded content — no hallucinated pricing or policies. You can run multiple employees for different departments.',

        },

        pricing: {

            keywords: ['price', 'pricing', 'cost', 'plan', 'subscription', 'r999', 'r999.99', 'r2999', 'r4999', 'custom', 'how much', 'trial'],

            answer: null,

        },

        setup: {

            keywords: ['setup', 'onboard', 'onboarding', 'install', 'start', 'launch', 'minutes', 'get started'],

            answer:

                'Go live in under 10 minutes: (1) Create your company account, (2) Choose an industry pack from the Marketplace, (3) Connect WhatsApp via Settings → Channels (QR scan), (4) Upload FAQs, policies, and product docs to Knowledge Base, (5) Activate your default AI Employee. Sarah can walk you through each step inside the portal.',

        },

        whatsapp: {

            keywords: ['whatsapp', 'meta', 'business api', 'qr', 'channel'],

            answer:

                'WhatsApp connects via Meta Business API. In onboarding or Settings → Integrations, scan the QR or paste Phone Number ID + token. Inbound messages route to your default AI Employee, which replies using its Knowledge Base. Outbound replies are sent back through the same WhatsApp number.',

        },

        marketplace: {

            keywords: ['marketplace', 'industry', 'pack', 'automotive', 'school', 'legal', 'healthcare', 'funeral', 'retail', 'church'],

            answer:

                'The Marketplace offers 50+ industry packs — automotive, schools, legal, healthcare, funeral, retail, church, and more. Each pack installs a pre-trained AI Employee, knowledge templates, workflows, and CRM stages. Install takes about 4 minutes; customize branding and add your own documents afterward.',

        },

        integrations: {

            keywords: ['integration', 'facebook', 'instagram', 'telegram', 'email', 'sms', 'calendar'],

            answer:

                'Channels: WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS — unified in one inbox. Connectors include Google Calendar, Microsoft 365, Stripe, and Paystack for appointments and payments.',

        },

        crm: {

            keywords: ['crm', 'customer', 'lead', 'contact', 'pipeline'],

            answer:

                'Built-in CRM captures every conversation as a customer profile with timeline, notes, tasks, and lead scores. AI automatically tags intent and sentiment. WhatsApp enquiries create or update profiles automatically.',

        },

        automation: {

            keywords: ['automation', 'workflow', 'trigger', 'auto'],

            answer:

                'Automation Builder lets you create workflows: triggers (new message, keyword, lead score) → conditions → AI actions → CRM updates → notifications. Industry packs include starter workflows.',

        },

        knowledge: {

            keywords: ['knowledge', 'faq', 'document', 'upload', 'train', 'pdf'],

            answer:

                'Knowledge Base stores FAQs, policies, product sheets, and manuals (PDF, TXT, DOCX). Each AI Employee links to a KB — answers come from your content only. Upload via Knowledge module or tell Sarah to add content.',

        },

        sarah: {

            keywords: ['sarah', 'assistant', 'operating', 'help me', 'who', 'what', 'reception'],

            answer:

                "I'm Sarah — your AI Operating Assistant. I answer customer enquiries 24/7 on WhatsApp and web, book appointments, capture leads, and send quotes. Inside the portal I also help you create AI employees, upload knowledge, and connect channels.",

        },

        security: {

            keywords: ['security', 'popia', 'gdpr', 'encrypt', 'data', 'safe', 'secure', 'privacy'],

            answer:

                "Your data is encrypted in transit (TLS 1.3) and at rest (AES-256) on Google Firebase. Each company's knowledge is fully isolated with role-based access, audit logs, and POPIA/GDPR-ready consent tools.",

        },

    };



    function resolveFaqAnswer(id, entry) {

        if (id === 'pricing') return getPricingAnswer();

        return entry.answer;

    }



    function matchPlatformQuestion(text) {

        const lower = String(text || '').toLowerCase().trim();

        if (!lower) return null;

        for (const [id, entry] of Object.entries(PLATFORM_FAQ)) {

            if (entry.keywords.some((k) => lower.includes(k))) {

                return resolveFaqAnswer(id, entry);

            }

        }

        return null;

    }



    global.ZiricPlatformKnowledge = {

        matchPlatformQuestion,

        getDefaultReply,

        PLATFORM_FAQ,

    };

})(typeof window !== 'undefined' ? window : globalThis);

