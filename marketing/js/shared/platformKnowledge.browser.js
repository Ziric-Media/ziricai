/**
 * Browser build of platform FAQ — mirrors js/shared/platformKnowledge.js for landing Sarah.
 * Pricing copy is resolved from ZiricBillingPlans (services/platform/billingPlans.js).
 */
(function (global) {
    'use strict';

    function getPricingAnswer() {
        return global.ZiricBillingPlans?.getPricingSummaryText?.() ||
            'Our plans start at Starter R999.99/month (1 AI Employee), Professional R2,999/month (5 AI Employees), Business R4,999/month (10 AI Employees), and Enterprise with custom pricing. All plans include a 14-day free trial.';
    }

    function getDefaultReply() {
        return global.ZiricBillingPlans?.getDefaultPlatformReply?.() ||
            'ZiricAI deploys AI Employees to handle customer enquiries 24/7 on WhatsApp, web, and social. Setup takes under 10 minutes, plans start at R999.99/month, and you get a 14-day free trial. Ask about pricing, setup, industries, WhatsApp, CRM, automation, or the Knowledge Base — or click Start Free Trial to get going!';
    }

    const PLATFORM_UNCLEAR_REPLY =
        'I want to make sure I help you properly — could you rephrase that? I can answer questions about what ZiricAI is, pricing, setup, industries (including restaurants), WhatsApp integration, security, the free trial, and more. Or click "Start Free Trial" to explore the platform yourself.';

    const FOLLOW_UP_PATTERNS = [
        'tell me more',
        'more info',
        'more detail',
        'go on',
        'what else',
        'and what about',
        'can you elaborate',
        'explain more',
        'anything else about',
        'keep going',
    ];

    const PLATFORM_FAQ = {
        overview: {
            keywords: [
                'what is ziricai',
                'what does ziricai do',
                'tell me about ziricai',
                'explain ziricai',
                'how does ziricai work',
                'what is this',
                'about ziricai',
                'ziricai platform',
            ],
            answer:
                'ZiricAI is a platform that gives your business AI employees — like a receptionist, sales agent, or support rep — that answer customers on WhatsApp, web chat, and social media, 24/7. You upload your FAQs and policies, connect your channels, and the AI handles enquiries instantly using only your content. Most businesses are live in under 10 minutes.',
        },
        pricing: {
            keywords: [
                'how much',
                'how much does it cost',
                'how much does ziricai cost',
                'price',
                'pricing',
                'cost',
                'subscription',
                'monthly fee',
                'pay',
                'afford',
                'r999',
                'r999.99',
                'r2999',
                'r4999',
                'plans',
                'tier',
            ],
            answer: null,
        },
        trial: {
            keywords: [
                'free trial',
                '14 day',
                '14-day',
                'try free',
                'try it',
                'no credit card',
                'demo account',
                'can i try',
                'test it out',
            ],
            answer:
                'Yes — every plan includes a 14-day free trial with full access, and no credit card is required. Click "Start Free Trial" anywhere on this page, pick your industry pack, and you\'ll have an AI employee answering enquiries within minutes.',
        },
        setup: {
            keywords: [
                'setup',
                'set up',
                'onboard',
                'onboarding',
                'install',
                'get started',
                'how long',
                'how fast',
                'launch',
                'go live',
                'minutes to setup',
            ],
            answer:
                'Most businesses go live in under 10 minutes. Create your account, choose an industry pack from the Marketplace, connect WhatsApp with a quick QR scan, upload your FAQs and policies, and activate your AI employee — no developers needed. Sarah can walk you through each step inside the Company Portal once you\'re signed up.',
        },
        whatsapp: {
            keywords: [
                'whatsapp',
                'does it work with whatsapp',
                'whatsapp integration',
                'meta business',
                'business api',
                'qr code',
                'qr scan',
            ],
            answer:
                'Yes — WhatsApp is one of our core channels. Connect via Meta Business API during onboarding or in Settings → Integrations (QR scan or Phone Number ID). Incoming messages route to your AI employee, which replies using your Knowledge Base, and responses go back through your WhatsApp number automatically.',
        },
        restaurant: {
            keywords: [
                'restaurant',
                'my restaurant',
                'cafe',
                'café',
                'food business',
                'dining',
                'menu questions',
                'table booking',
                'table reservation',
                'hospitality',
                'hotel',
                'bar',
                'takeaway',
            ],
            answer:
                'Absolutely — ZiricAI works great for restaurants and hospitality businesses. Our Restaurant AI pack handles table reservations, menu questions, dietary requests, and general guest enquiries on WhatsApp and web chat. Install it from the Marketplace, add your menu and booking policies, and you can be live in minutes.',
        },
        marketplace: {
            keywords: [
                'marketplace',
                'industry pack',
                'industry packs',
                'which industries',
                'what industries',
                'automotive',
                'school',
                'legal',
                'healthcare',
                'funeral',
                'retail',
                'church',
                'car dealer',
                'dealership',
            ],
            answer:
                'We offer 50+ industry packs in the Marketplace — automotive, schools, legal, healthcare, funeral, retail, church, restaurants, and more. Each pack installs a pre-trained AI employee with knowledge templates, workflows, and CRM stages tailored to that industry. Installation takes about 4 minutes; you can customize branding and add your own documents afterward.',
        },
        aiEmployee: {
            keywords: [
                'ai employee',
                'ai employees',
                'ai agent',
                'ai agents',
                'reception ai',
                'what is an ai employee',
                'virtual employee',
                'digital employee',
            ],
            answer:
                'An AI Employee is a dedicated AI agent with its own name, role (Reception, Sales, Support, and more), and linked Knowledge Base. It answers on your assigned channels using only your uploaded content — so pricing and policies stay accurate. You can run multiple AI employees for different departments at the same time.',
        },
        integrations: {
            keywords: [
                'integration',
                'integrations',
                'facebook',
                'instagram',
                'telegram',
                'email channel',
                'sms',
                'google calendar',
                'microsoft 365',
                'stripe',
                'paystack',
                'social media',
                'web chat',
                'live chat',
                'channels',
            ],
            answer:
                'ZiricAI connects to WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS — all in one unified inbox. For appointments and payments, we integrate with Google Calendar, Microsoft 365, Stripe, and Paystack. Sarah can start channel connection wizards from inside the portal.',
        },
        crm: {
            keywords: [
                'crm',
                'customer management',
                'lead capture',
                'lead scoring',
                'contact management',
                'sales pipeline',
                'customer profile',
            ],
            answer:
                'Every conversation is captured in a built-in CRM with customer profiles, timelines, notes, tasks, and lead scores. AI automatically tags intent and sentiment, and WhatsApp enquiries create or update profiles automatically — so no lead slips through the cracks.',
        },
        automation: {
            keywords: [
                'automation',
                'workflow',
                'workflows',
                'trigger',
                'automate',
                'auto reply',
            ],
            answer:
                'The Automation Builder lets you create workflows — for example, a new WhatsApp message triggers a condition, then an AI action, a CRM update, and a team notification. Industry packs include starter workflows, and Sarah can create simple automations or open the builder for you.',
        },
        knowledge: {
            keywords: [
                'knowledge base',
                'knowledge',
                'upload documents',
                'upload faq',
                'train ai',
                'train the ai',
                'rag',
                'pdf upload',
                'document upload',
            ],
            answer:
                'The Knowledge Base stores your FAQs, policies, product sheets, and manuals (PDF, TXT, DOCX). Each AI Employee links to a Knowledge Base, so answers come from your content only — not generic AI guesses. Upload via the Knowledge module or ask Sarah to add content. Marketplace packs seed starter documents on install.',
        },
        sarah: {
            keywords: [
                'who is sarah',
                'what is sarah',
                'tell me about sarah',
                'sarah assistant',
                'sarah ai',
            ],
            answer:
                "I'm Sarah — a Reception AI built on ZiricAI. Right here on the landing page I answer your questions about the platform. Once you sign up, I also help you inside the Company Portal — setting up AI employees, connecting WhatsApp, uploading knowledge, and running your business. Your customer-facing AI employees answer enquiries 24/7, book appointments, capture leads, and send quotes in under 2 seconds.",
        },
        security: {
            keywords: [
                'security',
                'secure',
                'safe',
                'data protection',
                'popia',
                'gdpr',
                'encrypted',
                'encryption',
                'privacy',
                'data privacy',
                'is my data safe',
            ],
            answer:
                'Your data is protected with TLS 1.3 encryption in transit and AES-256 encryption at rest on Google Firebase. Each company\'s data is fully isolated with role-based access, audit logs, and POPIA/GDPR-ready consent tools. Knowledge and conversations never leak across companies.',
        },
        support: {
            keywords: [
                'support',
                'contact',
                'speak to someone',
                'talk to a human',
                'help desk',
                'customer service',
                'get in touch',
                'contact team',
                'email support',
            ],
            answer:
                'Happy to help! The fastest way to explore ZiricAI is the 14-day free trial — no credit card required. If you\'d like to speak with our team, use the contact options on this page or start a trial and ask Sarah inside the portal — she can guide you through setup, integrations, and day-to-day questions.',
        },
        roi: {
            keywords: [
                'roi',
                'return on investment',
                'save money',
                'revenue',
                'after hours',
                'missed leads',
                'missed enquiries',
                'worth it',
                'business value',
            ],
            answer:
                'Most businesses lose 30–40% of after-hours enquiries because nobody is available to reply. With an AI employee handling them instantly, customers like Central Motors saw a 42% increase in after-hours lead conversion. Scroll down to our ROI calculator on this page to estimate your numbers.',
        },
    };

    function normalizeQuestionText(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[^\w\s?]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function scoreKeywordMatch(normalized, keyword) {
        const kw = String(keyword || '').toLowerCase().trim();
        if (!kw || !normalized) return 0;

        if (normalized === kw) return 120 + kw.length * 2;

        if (normalized.includes(kw)) {
            let score = 55 + kw.length * 2;
            if (kw.includes(' ')) return score + 15;

            const wordRe = new RegExp(`\\b${escapeRegExp(kw)}\\b`);
            if (wordRe.test(normalized)) return score + 12;

            if (kw.length <= 3) return score * 0.35;
            return score;
        }

        return 0;
    }

    function resolveFaqAnswer(id, entry) {
        if (id === 'pricing') return getPricingAnswer();
        return entry.answer;
    }

    function conversationalPricingAnswer(summary) {
        if (!summary) return getPricingAnswer();
        return summary.replace(/^Plans:\s*/, 'We offer ');
    }

    function formatReplyForQuestion(id, answer, question) {
        const normalized = normalizeQuestionText(question);
        if (!answer) return getDefaultReply();

        if (id === 'pricing') {
            const body = conversationalPricingAnswer(answer);
            if (/how much|cost|price|pricing|pay|afford|expensive|cheap/.test(normalized)) {
                return `Great question! ${body}`;
            }
            return body;
        }

        if (id === 'restaurant' && /can it work|will it work|good for|suitable|my restaurant/.test(normalized)) {
            return answer;
        }

        if (id === 'trial' && /free|trial|try|demo|credit card/.test(normalized)) {
            return answer;
        }

        if (id === 'whatsapp' && /work with|support|integrate|connect/.test(normalized)) {
            return answer.startsWith('Yes') ? answer : `Yes — ${answer.charAt(0).toLowerCase()}${answer.slice(1)}`;
        }

        return answer;
    }

    function isFollowUpQuestion(normalized) {
        return FOLLOW_UP_PATTERNS.some((p) => normalized.includes(p));
    }

    function isLikelyGibberish(normalized) {
        if (!normalized) return true;
        if (normalized.length <= 2) return true;
        const words = normalized.split(' ').filter(Boolean);
        if (words.length === 1 && words[0].length <= 3) return true;
        if (!/[aeiouy]/.test(normalized) && normalized.length < 12) return true;
        const keyboardMash = /^(asdf|qwer|zxcv|hjkl|asdfgh|qwerty|test123|xxx+|lol+|haha+)$/i;
        if (keyboardMash.test(normalized.replace(/\s/g, ''))) return true;
        if (words.length === 1 && words[0].length >= 5) {
            const w = words[0];
            if (/^[asdfghjkl]+$|^[qwertyuiop]+$|^[zxcvbnm]+$/i.test(w)) return true;
            const vowelRatio = (w.match(/[aeiouy]/gi) || []).length / w.length;
            if (vowelRatio < 0.12) return true;
        }
        return false;
    }

    function matchPlatformQuestion(text, context) {
        context = context || {};
        const normalized = normalizeQuestionText(text);
        if (!normalized) return null;

        if (context.lastTopicId && isFollowUpQuestion(normalized)) {
            const entry = PLATFORM_FAQ[context.lastTopicId];
            if (entry) {
                const answer = resolveFaqAnswer(context.lastTopicId, entry);
                return {
                    id: context.lastTopicId,
                    answer: formatReplyForQuestion(context.lastTopicId, answer, text),
                    title: entry.title || context.lastTopicId,
                };
            }
        }

        let best = null;
        let bestScore = 0;

        for (const [id, entry] of Object.entries(PLATFORM_FAQ)) {
            let topicScore = 0;
            for (const kw of entry.keywords) {
                topicScore = Math.max(topicScore, scoreKeywordMatch(normalized, kw));
            }
            if (topicScore > bestScore) {
                bestScore = topicScore;
                best = { id, entry };
            }
        }

        const MIN_SCORE = 18;
        if (best && bestScore >= MIN_SCORE) {
            const answer = resolveFaqAnswer(best.id, best.entry);
            return {
                id: best.id,
                answer: formatReplyForQuestion(best.id, answer, text),
                title: best.entry.title || best.id,
            };
        }

        if (isLikelyGibberish(normalized)) {
            return { id: 'unclear', answer: PLATFORM_UNCLEAR_REPLY, title: 'Help' };
        }

        return null;
    }

    global.ZiricPlatformKnowledge = {
        matchPlatformQuestion,
        getDefaultReply,
        formatReplyForQuestion,
        normalizeQuestionText,
        PLATFORM_FAQ,
        PLATFORM_UNCLEAR_REPLY,
    };
})(typeof window !== 'undefined' ? window : globalThis);
