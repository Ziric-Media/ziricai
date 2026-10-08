/**
 * ZiricAI Landing — animations, ROI calculator, demo interactions
 */
(function () {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ===== ANIMATED COUNTERS =====
    function formatCounterValue(value, format) {
        if (format === 'currency') {
            return 'R' + Math.round(value).toLocaleString('en-ZA');
        }
        if (format === 'currency-short') {
            const k = Math.round(value / 1000);
            return 'R' + k + 'K';
        }
        if (format === 'percent') {
            return value.toFixed(1) + '%';
        }
        if (format === 'decimal') {
            return value.toFixed(1);
        }
        return Math.round(value).toLocaleString('en-ZA');
    }

    function animateCounter(el, target, duration, format) {
        if (prefersReducedMotion) {
            el.textContent = formatCounterValue(target, format);
            return;
        }
        const start = performance.now();
        const from = 0;
        function tick(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = from + (target - from) * eased;
            el.textContent = formatCounterValue(current, format);
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function initCounters() {
        const counters = document.querySelectorAll('[data-counter]');
        if (!counters.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    if (el.dataset.counted) return;
                    el.dataset.counted = 'true';
                    const target = parseFloat(el.dataset.counter);
                    const format = el.dataset.format || 'number';
                    animateCounter(el, target, 1800, format);
                    observer.unobserve(el);
                });
            },
            { threshold: 0.3, rootMargin: '0px 0px -40px 0px' }
        );
        counters.forEach((el) => observer.observe(el));
    }

    // ===== LIVE KPI PULSE =====
    function initLiveKpis() {
        if (prefersReducedMotion) return;

        const liveEls = document.querySelectorAll('[data-live-kpi]');
        liveEls.forEach((el) => {
            const startLive = () => {
                if (el.dataset.liveStarted) return;
                el.dataset.liveStarted = 'true';
                const base = parseFloat(el.dataset.liveKpi);
                const format = el.dataset.format || 'number';
                let current = base;

                setInterval(() => {
                    const delta = Math.floor(Math.random() * 3) - 1;
                    if (format === 'currency-short') {
                        current = base + delta * 1000;
                    } else if (format === 'percent') {
                        current = Math.min(99.9, Math.max(98.0, base + delta * 0.1));
                    } else {
                        current = Math.max(0, base + delta);
                    }
                    el.textContent = formatCounterValue(current, format);
                    el.classList.add('kpi-pulse');
                    setTimeout(() => el.classList.remove('kpi-pulse'), 600);
                }, 4000 + Math.random() * 3000);
            };

            if (el.hasAttribute('data-counter')) {
                const observer = new MutationObserver(() => {
                    if (el.dataset.counted === 'true') {
                        startLive();
                        observer.disconnect();
                    }
                });
                observer.observe(el, { attributes: true, attributeFilter: ['data-counted'] });
                if (el.dataset.counted === 'true') startLive();
            } else {
                startLive();
            }
        });
    }

    // ===== ROI CALCULATOR =====
    function initRoiCalculator() {
        const form = document.getElementById('roiForm');
        if (!form) return;

        const resultEl = document.getElementById('roiResult');
        const amountEl = document.getElementById('roiAmount');
        const previewEl = document.getElementById('roiPreviewAmount');
        const ctaEl = document.getElementById('roiCta');

        function calculate() {
            const missed = parseFloat(document.getElementById('roiMissed')?.value) || 0;
            const dealValue = parseFloat(document.getElementById('roiDealValue')?.value) || 0;
            const hoursSaved = parseFloat(document.getElementById('roiHours')?.value) || 0;
            const hourlyRate = 150;

            const recoveredLeads = missed * 0.35 * dealValue * 30;
            const laborSavings = hoursSaved * hourlyRate * 4;
            const total = Math.round(recoveredLeads + laborSavings);
            const formatted = 'R ' + total.toLocaleString('en-ZA');

            amountEl.textContent = formatted;
            if (previewEl) {
                previewEl.textContent = formatted;
                previewEl.classList.remove('roi-pulse');
                void previewEl.offsetWidth;
                previewEl.classList.add('roi-pulse');
            }
            resultEl.classList.add('visible');
            ctaEl.classList.add('visible');
        }

        if (resultEl) resultEl.classList.add('visible');
        if (ctaEl) ctaEl.classList.add('visible');

        form.addEventListener('input', calculate);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            calculate();
        });
        calculate();
    }

    // ===== SHARED PHONE CHAT UTILITIES =====
    const phoneTimestamps = ['21:04', '21:05', '21:06', '21:07', '21:08', '21:09', '21:10', '21:11', '21:12', '21:13', '21:14', '21:15'];

    function createPhoneBubble(msg, timeIndex) {
        if (msg.role === 'system') {
            const bubble = document.createElement('div');
            bubble.className = 'tour-bubble system';
            bubble.textContent = msg.text;
            return bubble;
        }

        const wrap = document.createElement('div');
        wrap.className = `tour-msg tour-msg-${msg.role}`;

        const bubble = document.createElement('div');
        bubble.className = `tour-bubble ${msg.role}`;

        const text = document.createElement('span');
        text.className = 'tour-bubble-text';
        text.textContent = msg.text;
        bubble.appendChild(text);

        const meta = document.createElement('span');
        meta.className = 'tour-bubble-meta';

        const time = document.createElement('span');
        time.className = 'tour-bubble-time';
        time.textContent = phoneTimestamps[timeIndex % phoneTimestamps.length];
        meta.appendChild(time);

        if (msg.role === 'ai') {
            const receipt = document.createElement('span');
            receipt.className = 'tour-bubble-receipt';
            receipt.innerHTML = '<i class="fa-solid fa-check-double"></i>';
            meta.appendChild(receipt);
        }

        bubble.appendChild(meta);
        wrap.appendChild(bubble);
        return wrap;
    }

    function showPhoneTyping(chat) {
        const typing = document.createElement('div');
        typing.className = 'tour-typing';
        typing.innerHTML = '<span></span><span></span><span></span>';
        chat.appendChild(typing);
        scrollPhoneChat(chat);
        return typing;
    }

    function scrollPhoneChat(chat) {
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    function renderPhoneMessages(chat, messages, shouldContinue, onMessage) {
        let delay = 0;
        let timeIndex = 0;
        const active = () => (typeof shouldContinue === 'function' ? shouldContinue() : true);

        messages.forEach((msg) => {
            if (msg.role === 'ai') {
                setTimeout(() => {
                    if (!active()) return;
                    const typing = showPhoneTyping(chat);
                    scrollPhoneChat(chat);
                    setTimeout(() => {
                        if (!active()) return;
                        typing.remove();
                        chat.appendChild(createPhoneBubble(msg, timeIndex));
                        scrollPhoneChat(chat);
                        onMessage?.(msg, timeIndex);
                    }, 900);
                }, delay);
                delay += 500 + 900;
            } else {
                setTimeout(() => {
                    if (!active()) return;
                    chat.appendChild(createPhoneBubble(msg, timeIndex));
                    scrollPhoneChat(chat);
                    onMessage?.(msg, timeIndex);
                }, delay);
                delay += msg.role === 'system' ? 350 : 450;
            }
            timeIndex++;
        });

        return delay;
    }

    // ===== DEMO MODAL (scripted WhatsApp sample) =====
    const demoScenarios = {
        sales: {
            title: 'Central Motors — Sales AI',
            contact: 'Central Motors',
            agent: 'Sales AI',
            avatar: '<i class="fa-solid fa-car"></i>',
            desc: 'Watch Sales AI handle a full Hilux enquiry — pricing, trade-in, financing, and test drive booking.',
            action: '✓ Test drive booked · Quote #CM-2847 sent',
            messages: [
                { role: 'customer', text: 'Hi, I\'m looking for a Toyota Hilux. Do you have any in stock?' },
                { role: 'ai', text: 'Good evening! Yes — we have 3 Hilux models available:\n\n• 2.4 GD-6 Raider — R589,900\n• 2.8 GD-6 Legend — R724,500\n• 2.8 GD-6 GR-S — R798,900\n\nWhich variant interests you?' },
                { role: 'customer', text: 'What\'s the price on the Legend, and do you have financing?' },
                { role: 'ai', text: 'The 2024 Hilux 2.8 GD-6 Legend is R724,500. Flexible financing starts from R18,200/month with a 10% deposit over 36 months. Would you like the full breakdown?' },
                { role: 'customer', text: 'Yes please. Also — do you accept trade-ins?' },
                { role: 'ai', text: 'Absolutely! We accept trade-ins on all models. Share your current vehicle year, make, and mileage and I\'ll estimate your trade-in value.\n\nLegend financing preview:\nDeposit: R72,450 (10%)\n36 months: R18,200/mo\n48 months: R14,850/mo' },
                { role: 'customer', text: 'I have a 2019 Ford Ranger with about 85,000 km on it.' },
                { role: 'ai', text: 'Thanks! Based on current market data, your 2019 Ford Ranger (~85,000 km) could trade for R285,000–R310,000 depending on condition. A sales consultant can confirm after a quick inspection.\n\nShall I book a test drive this Saturday?' },
                { role: 'customer', text: 'Saturday morning works for me.' },
                { role: 'ai', text: 'Perfect — test drive booked for Saturday at 10:00 AM. Confirmation sent to your WhatsApp.\n\nQuote #CM-2847 and your trade-in estimate are attached. See you then! 🚗' },
                { role: 'system', text: '📋 Lead captured · R724,500 · Hot · Test drive confirmed' },
            ],
        },
        sarah: {
            title: 'Greenfield Academy — Sarah Reception',
            contact: 'Greenfield Academy',
            agent: 'Sarah · Reception AI',
            avatar: '<img src="assets/sarah-avatar.svg" alt="Sarah" width="36" height="36">',
            desc: 'Sarah handles a parent enquiry — fees, documents, and a principal meeting — all in one conversation.',
            action: '✓ Parent meeting booked · Fee guide sent',
            messages: [
                { role: 'customer', text: 'Good afternoon. I\'d like information about Grade 8 admission for next year.' },
                { role: 'ai', text: 'Good afternoon! I\'d be happy to help with Grade 8 admissions for 2027.\n\nApplications open 1 March. Required documents:\n• Latest report card\n• Birth certificate\n• Proof of residence\n\nWould you like the fee structure or to book a campus tour?' },
                { role: 'customer', text: 'Both please. What are the fees?' },
                { role: 'ai', text: 'Here\'s our 2026 fee structure for Grade 8:\n\n• Registration: R2,500 (once-off)\n• Tuition: R8,400/month\n• Activity levy: R650/month\n\nSibling discount: 10% on tuition. I\'ve sent the full PDF to your WhatsApp.' },
                { role: 'customer', text: 'We have two children — would both qualify for the sibling discount?' },
                { role: 'ai', text: 'Yes! When both children are enrolled, the younger sibling receives 10% off tuition. For two Grade 8 placements that saves approximately R16,800/year.\n\nWould you like to schedule a meeting with the principal?' },
                { role: 'customer', text: 'Yes, sometime next week in the afternoon.' },
                { role: 'ai', text: 'I have these slots available next week:\n\n• Tuesday 3:30 PM\n• Wednesday 4:00 PM\n• Thursday 2:30 PM\n\nWhich works best for you?' },
                { role: 'customer', text: 'Wednesday at 4 PM please.' },
                { role: 'ai', text: 'Done — parent meeting booked for Wednesday at 4:00 PM with Principal Khumalo. Confirmation and campus directions sent to your WhatsApp.\n\nLooking forward to welcoming your family! 🎓' },
                { role: 'system', text: '📋 Admission lead captured · 2 learners · Meeting confirmed' },
            ],
        },
    };

    let demoRunning = false;
    let demoScenario = 'sales';
    let demoRenderToken = 0;

    function pushDemoFeed(text, type = 'default') {
        const feed = document.getElementById('demoLiveFeed');
        if (!feed) return;
        const line = document.createElement('div');
        line.className = `demo-feed-line feed-${type}`;
        line.innerHTML = `<span class="dot"></span> ${text}`;
        feed.appendChild(line);
        while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    }

    function resetDemoFeed() {
        const feed = document.getElementById('demoLiveFeed');
        if (!feed) return;
        feed.innerHTML = '<div class="demo-feed-line"><span class="dot"></span> Conversation starting…</div>';
    }

    function updateDemoPhoneMeta(config) {
        const titleEl = document.getElementById('demoPhoneTitle');
        const agentEl = document.getElementById('demoPhoneAgent');
        const avatarEl = document.getElementById('demoPhoneAvatar');
        if (titleEl) titleEl.textContent = config.contact;
        if (agentEl) agentEl.textContent = config.agent;
        if (avatarEl) {
            if (config.avatar.startsWith('<')) {
                avatarEl.innerHTML = config.avatar;
            } else {
                avatarEl.textContent = config.avatar;
            }
        }
    }

    function playDemoConversation(scenario) {
        demoRenderToken++;
        const token = demoRenderToken;

        const config = demoScenarios[scenario] || demoScenarios.sales;
        const chat = document.getElementById('demoPhoneChat');
        const action = document.getElementById('demoPhoneAction');
        const descEl = document.getElementById('demoScenarioDesc');
        const header = document.getElementById('demoModalTitle');

        if (!chat) return;

        if (header) header.innerHTML = `<i class="fa-brands fa-whatsapp"></i> ${config.title}`;
        if (descEl) descEl.textContent = config.desc;
        updateDemoPhoneMeta(config);
        resetDemoFeed();

        chat.innerHTML = '';
        chat.classList.add('is-transitioning');
        if (action) {
            action.textContent = '';
            action.classList.remove('visible');
        }

        setTimeout(() => {
            if (token !== demoRenderToken) return;
            chat.innerHTML = '';
            chat.classList.remove('is-transitioning');

            const totalDelay = renderPhoneMessages(
                chat,
                config.messages,
                () => token === demoRenderToken && demoRunning,
                (msg) => {
                    if (msg.role === 'customer') {
                        pushDemoFeed(`Customer: ${msg.text.slice(0, 72)}${msg.text.length > 72 ? '…' : ''}`, 'customer');
                    } else if (msg.role === 'ai') {
                        pushDemoFeed(`${config.agent} replied`, 'ai');
                    } else if (msg.role === 'system') {
                        pushDemoFeed(msg.text, 'ai');
                    }
                }
            );

            if (action && config.action) {
                setTimeout(() => {
                    if (token !== demoRenderToken) return;
                    action.textContent = config.action;
                    action.classList.add('visible');
                    pushDemoFeed(config.action.replace(/^✓\s*/, ''), 'ai');
                }, totalDelay + 300);
            }
        }, 220);
    }

    window.openDemo = function (scenario = 'sales') {
        demoScenario = scenario;
        const overlay = document.getElementById('demoOverlay');
        document.querySelectorAll('.demo-scenario-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.scenario === scenario);
        });
        overlay?.classList.add('active');
        document.body.classList.add('demo-active');
        demoRunning = true;
        playDemoConversation(scenario);
    };

    window.closeDemo = function () {
        document.getElementById('demoOverlay')?.classList.remove('active');
        document.body.classList.remove('demo-active');
        demoRunning = false;
        demoRenderToken++;
    };

    function initWatchAiLive() {
        document.querySelectorAll('.demo-scenario-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                const scenario = tab.dataset.scenario;
                if (!scenario || scenario === demoScenario) return;
                demoScenario = scenario;
                document.querySelectorAll('.demo-scenario-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                playDemoConversation(scenario);
            });
        });
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ===== VOICE DEMO PLACEHOLDER =====
    window.playVoiceDemo = function () {
        const btn = document.getElementById('listenVoiceBtn');
        if (!btn) return;

        btn.classList.add('voice-playing');
        btn.innerHTML = '<span class="voice-wave"><span></span><span></span><span></span><span></span></span> Playing voice sample…';

        if (typeof showToast === 'function') {
            showToast('Sarah\'s voice demo — natural, warm, professional reception tone', 'info');
        }

        setTimeout(() => {
            btn.classList.remove('voice-playing');
            btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Listen to Voice';
        }, 3500);
    };

    // ===== PRICING COPY (from ZiricBillingPlans / billingPlans.js) =====
    function initPricingCopy() {
        const bp = window.ZiricBillingPlans;
        if (!bp) return;
        const fromPrice = `From ${bp.formatPrice(bp.getMinimumPlanPrice())}/mo`;
        document.getElementById('comparisonFromPrice')?.replaceChildren(document.createTextNode(fromPrice));
        const cardPrice = document.getElementById('comparisonCardFromPrice');
        if (cardPrice) cardPrice.textContent = fromPrice;
    }

    const pk = window.ZiricPlatformKnowledge;
    let sarahSessionId = null;
    let sarahLastTopicId = null;

    const sarahDefaultReply = pk?.getDefaultReply?.() || window.ZiricBillingPlans?.getDefaultPlatformReply?.() ||
        'Great question! ZiricAI deploys AI employees to handle customer enquiries 24/7 on WhatsApp, web, and social. Setup takes under 10 minutes, and every plan includes a 14-day free trial. Ask about pricing, setup, industries, WhatsApp, or security — or click Start Free Trial to get going!';

    const SARAH_DEGRADED_INTRO =
        "I'm having trouble connecting to my full ZiricAI systems right now, but I can still answer some basic questions about ZiricAI.";

    /** Same-origin /api proxy on Netlify when apiBase is "" (matches js/auth.js). */
    function getSarahApiBase() {
        if (typeof window === 'undefined') return 'https://ziricai-production.up.railway.app';
        const cfg = window.__ZIRICAI_CONFIG__;
        if (cfg?.apiBase !== undefined && cfg.apiBase !== null) return cfg.apiBase;
        if (cfg?.sites?.api) return cfg.sites.api;
        const host = location.hostname || '';
        if (host === 'localhost' || host === '127.0.0.1') return '';
        if (/\.ziricai\.com$/i.test(host) && host !== 'api.ziricai.com') return '';
        return 'https://ziricai-production.up.railway.app';
    }

    function getSarahChatUrl() {
        const base = getSarahApiBase();
        const path = '/api/sarah/chat';
        if (base === '' || base == null) return path;
        return `${String(base).replace(/\/$/, '')}${path}`;
    }

    function getLandingSarahCompanyId() {
        return window.__ZIRICAI_CONFIG__?.landingSarahCompanyId || 'ziricai';
    }

    function isGenericSarahReply(reply) {
        if (!reply) return true;
        const defaults = [sarahDefaultReply, pk?.getDefaultReply?.(), pk?.PLATFORM_UNCLEAR_REPLY].filter(Boolean);
        return defaults.some((d) => reply === d);
    }

    function getSarahReplyLocal(text) {
        const context = { lastTopicId: sarahLastTopicId };
        if (pk?.matchPlatformQuestion) {
            const matched = pk.matchPlatformQuestion(text, context);
            if (matched) {
                if (typeof matched === 'string') return matched;
                if (matched.id && matched.id !== 'unclear') sarahLastTopicId = matched.id;
                const answer = matched.answer || matched;
                if (answer && !isGenericSarahReply(answer)) return answer;
            }
            if (pk.searchKnowledge) {
                const results = pk.searchKnowledge(text, { limit: 1, minScore: 12 });
                if (results.length && results[0].a) {
                    if (results[0].id) sarahLastTopicId = results[0].id;
                    return results[0].a;
                }
            }
            const normalized = pk.normalizeQuestionText?.(text) || String(text || '').toLowerCase();
            if (/\b(price|pricing|cost|how much|plan|plans|r999|r2999|r4999)\b/.test(normalized)) {
                const pricing = window.ZiricBillingPlans?.getPricingSummaryText?.();
                if (pricing) return pricing;
            }
            const hasClearIntent = /\b(support|help|contact|pricing|price|cost|setup|set up|whatsapp|restaurant|security|trial|ziricai)\b/.test(normalized);
            if (hasClearIntent) {
                return pk.PLATFORM_UNCLEAR_REPLY || sarahDefaultReply;
            }
            return pk.getDefaultReply?.() || sarahDefaultReply;
        }
        return sarahDefaultReply;
    }

    let sarahDegradedAnnounced = false;

    function withDegradedIntro(reply) {
        if (!reply || sarahDegradedAnnounced) return reply;
        sarahDegradedAnnounced = true;
        return `${SARAH_DEGRADED_INTRO} ${reply}`;
    }

    async function fetchSarahReplyFromApi(text) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 28000);
            const res = await fetch(getSarahChatUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    message: text,
                    sessionId: sarahSessionId,
                    surface: 'landing',
                    companyId: getLandingSarahCompanyId(),
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) {
                return { ok: false, reply: null, degraded: false };
            }
            const data = await res.json();
            if (data.sessionId) sarahSessionId = data.sessionId;
            const reply = data.reply?.trim() || null;
            return { ok: true, reply, degraded: Boolean(data.degraded) };
        } catch {
            return { ok: false, reply: null, degraded: false };
        }
    }

    async function getSarahReply(text) {
        const api = await fetchSarahReplyFromApi(text);
        if (api.ok && api.reply && api.reply.length > 12) {
            if (api.degraded) return withDegradedIntro(api.reply);
            return api.reply;
        }

        const localReply = getSarahReplyLocal(text);
        if (!isGenericSarahReply(localReply)) {
            return api.ok ? localReply : withDegradedIntro(localReply);
        }
        return api.reply || localReply || sarahDefaultReply;
    }

    function initSarahChat() {
        const widget = document.getElementById('sarahWidget');
        const bubble = document.getElementById('sarahBubble');
        const panel = document.getElementById('sarahPanel');
        const closeBtn = document.getElementById('sarahPanelClose');
        const form = document.getElementById('sarahForm');
        const input = document.getElementById('sarahInput');
        const messages = document.getElementById('sarahMessages');
        const suggestions = document.getElementById('sarahSuggestions');

        if (!widget || !bubble) return;

        function openPanel() {
            widget.classList.add('open');
            panel?.setAttribute('aria-hidden', 'false');
            setTimeout(() => input?.focus(), 300);
        }

        function closePanel() {
            widget.classList.remove('open');
            panel?.setAttribute('aria-hidden', 'true');
        }

        window.openSarahChat = openPanel;
        window.closeSarahChat = closePanel;

        bubble.addEventListener('click', openPanel);
        closeBtn?.addEventListener('click', closePanel);

        function appendMessage(text, role) {
            const el = document.createElement('div');
            el.className = `sarah-msg ${role}`;
            el.textContent = text;
            messages.appendChild(el);
            messages.scrollTop = messages.scrollHeight;
            return el;
        }

        let sarahSendInFlight = false;

        async function sendSarahMessage(text) {
            const trimmed = text.trim();
            if (!trimmed || sarahSendInFlight) return;

            sarahSendInFlight = true;
            form?.querySelector('button[type="submit"]')?.setAttribute('disabled', 'true');

            appendMessage(trimmed, 'user');
            input.value = '';

            const typing = document.createElement('div');
            typing.className = 'sarah-msg typing';
            typing.setAttribute('aria-live', 'polite');
            typing.setAttribute('aria-label', 'Sarah is typing');
            typing.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
            messages.appendChild(typing);
            messages.scrollTop = messages.scrollHeight;

            let reply = sarahDefaultReply;
            try {
                const minTypingMs = 450;
                const [apiReply] = await Promise.all([
                    getSarahReply(trimmed),
                    delay(minTypingMs),
                ]);
                reply = apiReply;
            } catch (err) {
                console.warn('[Sarah landing]', err);
            } finally {
                typing.remove();
                sarahSendInFlight = false;
                form?.querySelector('button[type="submit"]')?.removeAttribute('disabled');
            }

            appendMessage(reply, 'ai');
            messages.scrollTop = messages.scrollHeight;
        }

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            sendSarahMessage(input.value);
        });

        suggestions?.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                sendSarahMessage(btn.dataset.q || btn.textContent);
            });
        });
    }

    // ===== FAQ ACCORDION + CATEGORIES =====
    function initFaq() {
        const list = document.getElementById('faqList');
        const catBtns = document.querySelectorAll('.faq-cat-btn');

        list?.querySelectorAll('.faq-question').forEach((btn) => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.faq-item');
                if (!item || item.classList.contains('faq-hidden')) return;
                const wasOpen = item.classList.contains('open');
                list.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'));
                if (!wasOpen) item.classList.add('open');
            });
        });

        catBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.faqCat;
                catBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                list?.querySelectorAll('.faq-item').forEach((item) => {
                    const match = cat === 'all' || item.dataset.faqCat === cat;
                    item.classList.toggle('faq-hidden', !match);
                    if (!match) item.classList.remove('open');
                });
            });
        });
    }

    // ===== PRODUCT TOUR =====
    const tourSteps = [
        {
            title: 'Step 1 · Customer asks a question',
            desc: 'A customer sends a WhatsApp message after business hours.',
            action: '',
            messages: [
                { role: 'customer', text: 'Hi — are you open? I need help with a Hilux Legend test drive.' },
                { role: 'ai', text: 'Good evening! Yes — I\'m Sarah from Central Motors. We\'re closed on the floor, but I can help you right now. Would you like available Legend stock or to book a test drive?' },
            ],
        },
        {
            title: 'Step 2 · Sarah understands',
            desc: 'Sarah uses your business knowledge to provide an accurate answer.',
            action: '',
            messages: [
                { role: 'customer', text: 'What\'s included on the Legend and do you have white?' },
                { role: 'ai', text: 'The 2.8 GD-6 Legend includes leather seats, LED headlights, touchscreen, reverse camera, and Toyota Safety Sense — from R724,500.\n\nWe have Glacier White and Silver Metallic available. Both are on our price list and knowledge base for accurate quoting.' },
            ],
        },
        {
            title: 'Step 3 · Sarah takes action',
            desc: 'She captures the customer\'s information and creates or updates the relevant CRM record.',
            action: '✓ CRM record created · Intent: test drive',
            messages: [
                { role: 'customer', text: 'Book Saturday 10am for a white Legend please.' },
                { role: 'ai', text: 'Done — I\'ve saved your details and created a CRM lead for a Hilux Legend test drive (Glacier White).' },
                { role: 'system', text: '📋 Lead captured · Test drive · Saturday 10:00' },
            ],
        },
        {
            title: 'Step 4 · The workflow continues',
            desc: 'Sarah books an appointment, sends information, and notifies your team.',
            action: '✓ Appointment booked · Team notified',
            messages: [
                { role: 'ai', text: 'Test drive confirmed for Saturday 10:00 AM. Confirmation and directions sent to your WhatsApp. Our sales team has been notified to prepare the vehicle.' },
                { role: 'system', text: '🔔 Sales team notified · Calendar updated' },
            ],
        },
    ];

    let tourIndex = 0;
    let tourRenderToken = 0;

    function renderTourStep(index) {
        const chat = document.getElementById('tourPhoneChat');
        const action = document.getElementById('tourPhoneAction');
        const titleEl = document.getElementById('tourStepTitle');
        const descEl = document.getElementById('tourStepDesc');
        const prevBtn = document.getElementById('tourPrevBtn');
        const nextBtn = document.getElementById('tourNextBtn');
        const ctaBtn = document.getElementById('tourCtaBtn');
        const dots = document.querySelectorAll('.tour-dot');

        if (!chat) return;

        const step = tourSteps[index];
        titleEl.textContent = step.title;
        descEl.textContent = step.desc;

        tourRenderToken++;
        const token = tourRenderToken;

        chat.classList.add('is-transitioning');
        if (action) action.classList.remove('visible');

        setTimeout(() => {
            if (token !== tourRenderToken) return;
            chat.innerHTML = '';
            chat.classList.remove('is-transitioning');

            const totalDelay = renderPhoneMessages(
                chat,
                step.messages,
                () => token === tourRenderToken
            );

            if (action) {
                setTimeout(() => {
                    if (token !== tourRenderToken) return;
                    action.textContent = step.action || '';
                    action.classList.toggle('visible', !!step.action);
                }, totalDelay + 200);
            }
        }, 220);

        dots.forEach((d, i) => d.classList.toggle('active', i === index));
        prevBtn.disabled = index === 0;
        nextBtn.classList.toggle('hidden', index === tourSteps.length - 1);
        ctaBtn?.classList.toggle('hidden', index !== tourSteps.length - 1);
    }

    function initProductTour() {
        const prevBtn = document.getElementById('tourPrevBtn');
        const nextBtn = document.getElementById('tourNextBtn');
        const dots = document.querySelectorAll('.tour-dot');

        if (!document.getElementById('tourPhoneChat')) return;

        renderTourStep(0);

        prevBtn?.addEventListener('click', () => {
            if (tourIndex > 0) {
                tourIndex--;
                renderTourStep(tourIndex);
            }
        });

        nextBtn?.addEventListener('click', () => {
            if (tourIndex < tourSteps.length - 1) {
                tourIndex++;
                renderTourStep(tourIndex);
            }
        });

        dots.forEach((dot) => {
            dot.addEventListener('click', () => {
                tourIndex = parseInt(dot.dataset.step, 10);
                renderTourStep(tourIndex);
            });
        });
    }

    // ===== DASHBOARD PREVIEW TABS =====
    function initDashboardPreview() {
        const tabs = document.querySelectorAll('.dash-tab');
        const panels = document.querySelectorAll('.dash-panel');

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                tabs.forEach((t) => t.classList.remove('active'));
                panels.forEach((p) => p.classList.remove('active'));
                tab.classList.add('active');
                document.querySelector(`.dash-panel[data-panel="${target}"]`)?.classList.add('active');
            });
        });
    }

    // ===== WORKFORCE JOURNEY =====
    function initWorkforceJourney() {
        const track = document.getElementById('journeyTrack');
        if (!track) return;

        const journey = globalThis.ZiricAiEmployees?.WORKFORCE_JOURNEY || [];
        if (!journey.length) return;

        track.innerHTML = journey
            .map(
                (step, i) => `
            <div class="journey-step">
                <div class="journey-step-num">Step ${i + 1}</div>
                <div class="journey-step-icon"><i class="fa-solid ${step.icon}"></i></div>
                <h4>${escapeHtml(step.step)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>`
            )
            .join('');
    }

    // ===== HIRE AI EMPLOYEES =====
    let activeHireDept = 'all';

    function renderHireEmployeeCard(emp) {
        const price = globalThis.ZiricAiEmployees?.formatEmployeePrice?.(emp.monthlyPrice) || 'Included in plan';
        const skillsTags = (emp.skills || []).slice(0, 4).map((s) => `<span class="hire-tag">${escapeHtml(s)}</span>`).join('');
        const respTags = (emp.responsibilities || []).slice(0, 3).map((r) => `<span class="hire-tag">${escapeHtml(r)}</span>`).join('');
        const langTags = (emp.languages || []).slice(0, 4).map((l) => `<span class="hire-tag">${escapeHtml(l)}</span>`).join('');
        const intTags = (emp.integrations || []).slice(0, 4).map((i) => `<span class="hire-tag">${escapeHtml(i)}</span>`).join('');
        const indCount = (emp.industries || []).length;

        return `
            <div class="hire-employee-card" data-employee-id="${escapeHtml(emp.id)}">
                <div class="hire-card-header">
                    <div class="hire-card-icon">${emp.icon || '🤖'}</div>
                    <div class="hire-card-title-wrap">
                        <h4>${escapeHtml(emp.title)}</h4>
                        <span class="hire-card-dept">${escapeHtml(emp.departmentLabel || emp.department)}</span>
                    </div>
                </div>
                <p class="hire-card-desc">${escapeHtml(emp.shortDescription)}</p>
                <div class="hire-card-meta">
                    <div class="hire-meta-row">
                        <span class="hire-meta-label">Skills</span>
                        <div class="hire-meta-tags">${skillsTags}</div>
                    </div>
                    <div class="hire-meta-row">
                        <span class="hire-meta-label">Responsibilities</span>
                        <div class="hire-meta-tags">${respTags}</div>
                    </div>
                    <div class="hire-meta-row">
                        <span class="hire-meta-label">Languages</span>
                        <div class="hire-meta-tags">${langTags}</div>
                    </div>
                    <div class="hire-meta-row">
                        <span class="hire-meta-label">Integrations</span>
                        <div class="hire-meta-tags">${intTags}</div>
                    </div>
                    <div class="hire-meta-row">
                        <span class="hire-meta-label">Experience</span>
                        <div class="hire-meta-tags"><span class="hire-tag level">${escapeHtml(emp.experienceLevel || 'Mid')}</span></div>
                    </div>
                    <div class="hire-meta-row">
                        <span class="hire-meta-label">Industries</span>
                        <div class="hire-meta-tags"><span class="hire-tag">${indCount}+ sectors</span></div>
                    </div>
                </div>
                <div class="hire-card-footer">
                    <div class="hire-card-price"><strong>Monthly</strong>${escapeHtml(price)}</div>
                    <button class="btn btn-hire" data-hire-id="${escapeHtml(emp.id)}"><i class="fa-solid fa-user-plus"></i> Hire Now</button>
                </div>
            </div>`;
    }

    function renderHireEmployees(deptId) {
        const grid = document.getElementById('hireEmployeesGrid');
        if (!grid) return;

        const catalog = globalThis.ZiricAiEmployees?.getAiEmployeesCatalog?.() || [];
        const filtered = deptId === 'all' ? catalog : catalog.filter((e) => e.department === deptId);

        grid.innerHTML = filtered.map(renderHireEmployeeCard).join('');

        grid.querySelectorAll('[data-hire-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.hireId;
                const emp = catalog.find((c) => c.id === id);
                if (typeof launchWizard === 'function') {
                    launchWizard();
                } else if (typeof showToast === 'function') {
                    showToast(`Hiring ${emp?.title || 'AI Employee'} — start your free trial to onboard`, 'info');
                }
            });
        });
    }

    function initHireEmployees() {
        const tabsEl = document.getElementById('hireDeptTabs');
        if (!tabsEl) return;

        const deptRoles = globalThis.ZiricAiEmployees?.getDepartmentRoles?.() || [];
        const departments = globalThis.ZiricAiEmployees?.DEPARTMENTS || {};

        const tabs = [{ id: 'all', label: 'All Departments', icon: '🏢' }];
        deptRoles.forEach((group) => {
            const dept = departments[group.department];
            if (dept) tabs.push({ id: dept.id, label: dept.label, icon: dept.icon });
        });

        tabsEl.innerHTML = tabs
            .map(
                (tab) =>
                    `<button type="button" class="hire-dept-tab${tab.id === activeHireDept ? ' active' : ''}" role="tab" data-dept="${tab.id}" aria-selected="${tab.id === activeHireDept}">${tab.icon} ${escapeHtml(tab.label)}</button>`
            )
            .join('');

        tabsEl.querySelectorAll('.hire-dept-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                activeHireDept = tab.dataset.dept;
                tabsEl.querySelectorAll('.hire-dept-tab').forEach((t) => {
                    t.classList.toggle('active', t.dataset.dept === activeHireDept);
                    t.setAttribute('aria-selected', t.dataset.dept === activeHireDept);
                });
                renderHireEmployees(activeHireDept);
            });
        });

        renderHireEmployees(activeHireDept);
    }

    // ===== AI EMPLOYEES CATALOG =====
    function initCatalog() {
        const grid = document.getElementById('catalogGrid');
        if (!grid) return;

        const catalog = globalThis.ZiricAiEmployees?.getAiEmployeesCatalog?.() || [];
        if (!catalog.length) return;

        grid.innerHTML = catalog
            .map(
                (emp) => `
            <div class="catalog-card" data-employee-id="${escapeHtml(emp.id)}">
                <div class="catalog-card-icon">${emp.icon || '🤖'}</div>
                <span class="catalog-card-dept">${escapeHtml(emp.departmentLabel || emp.department)}</span>
                <h4>${escapeHtml(emp.title)}</h4>
                <p>${escapeHtml(emp.shortDescription)}</p>
                <button class="btn btn-sm btn-hire" data-hire-id="${escapeHtml(emp.id)}"><i class="fa-solid fa-user-plus"></i> Hire Now</button>
            </div>`
            )
            .join('');

        grid.querySelectorAll('[data-hire-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.hireId;
                const emp = catalog.find((c) => c.id === id);
                if (typeof launchWizard === 'function') {
                    launchWizard();
                } else if (typeof showToast === 'function') {
                    showToast(`Hiring ${emp?.title || 'AI Employee'} — start your free trial`, 'info');
                }
            });
        });

        grid.querySelectorAll('.catalog-card').forEach((card) => {
            card.addEventListener('click', () => {
                const btn = card.querySelector('[data-hire-id]');
                btn?.click();
            });
        });
    }

    // ===== INDUSTRIES GRID =====
    function initIndustries() {
        const grid = document.getElementById('industriesGrid');
        if (!grid) return;

        const industries = globalThis.ZiricIndustryTemplates?.getIndustryTemplates?.() || [];
        if (!industries.length) return;

        grid.innerHTML = industries
            .map((ind) => {
                const hasPage = ind.hasPage && ind.page;
                const tag = hasPage ? 'a' : 'div';
                const href = hasPage ? ` href="${escapeHtml(ind.page)}"` : '';
                const pageClass = hasPage ? ' has-page' : '';
                const linkIcon = hasPage ? '<i class="fa-solid fa-arrow-up-right-from-square industry-link-icon"></i>' : '';
                return `<${tag} class="industry-chip${pageClass}"${href}><span>${ind.icon}</span> ${escapeHtml(ind.name)}${linkIcon}</${tag}>`;
            })
            .join('');
    }

    // ===== MARKETPLACE GRID (legacy fallback) =====
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function initMarketplace() {
        const grid = document.getElementById('marketplaceGrid');
        if (!grid) return;

        const packs = globalThis.ZiricMarketplacePacks?.getLandingMarketplacePacks?.() || [];
        if (!packs.length) return;

        grid.innerHTML = packs
            .map(
                (pack) => `
            <div class="marketplace-card">
                <div class="marketplace-icon">${pack.icon}</div>
                <span class="marketplace-category">${escapeHtml(pack.categoryLabel)}</span>
                <h4>${escapeHtml(pack.name)}</h4>
                <p>${escapeHtml(pack.description)}</p>
                <span class="marketplace-tag"><i class="fa-solid fa-bolt"></i> Installs in minutes</span>
            </div>`
            )
            .join('');
    }

    // ===== HOME MODERN (scroll reveals, mini chat, carousels) =====
    const homeMiniChatScript = [
        { role: 'customer', text: 'Hi — do you have a Hilux Legend in stock?' },
        { role: 'ai', text: 'Good evening! Yes — we have the 2.8 GD-6 Legend from R724,500. Want financing or a test drive?' },
        { role: 'customer', text: 'Test drive Saturday morning?' },
        { role: 'ai', text: 'Booked for Saturday 10:00. Confirmation sent — see you then!' },
    ];

    function initHomeReveal() {
        const els = document.querySelectorAll('.home-modern .home-reveal');
        if (!els.length) return;
        if (prefersReducedMotion) {
            els.forEach((el) => el.classList.add('is-visible'));
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
        );
        els.forEach((el) => observer.observe(el));
    }

    function appendMiniChatBubble(body, msg) {
        const bubble = document.createElement('div');
        bubble.className = `home-mini-bubble ${msg.role}`;
        bubble.textContent = msg.text;
        body.appendChild(bubble);
        body.scrollTop = body.scrollHeight;
        return bubble;
    }

    function initHomeMiniChat() {
        const root = document.getElementById('homeMiniChat');
        const body = document.getElementById('homeMiniChatBody');
        const typing = document.getElementById('homeMiniChatTyping');
        if (!root || !body) return;

        let running = false;
        let token = 0;

        function runLoop() {
            token++;
            const myToken = token;
            running = true;
            body.innerHTML = '';

            let delay = 800;
            homeMiniChatScript.forEach((msg) => {
                if (msg.role === 'ai') {
                    setTimeout(() => {
                        if (myToken !== token) return;
                        typing?.classList.remove('hidden');
                        body.scrollTop = body.scrollHeight;
                    }, delay);
                    delay += 900;
                    setTimeout(() => {
                        if (myToken !== token) return;
                        typing?.classList.add('hidden');
                        appendMiniChatBubble(body, msg);
                    }, delay);
                    delay += 1200;
                } else {
                    setTimeout(() => {
                        if (myToken !== token) return;
                        appendMiniChatBubble(body, msg);
                    }, delay);
                    delay += 1400;
                }
            });

            setTimeout(() => {
                if (myToken !== token) return;
                runLoop();
            }, delay + 2400);
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !running) runLoop();
                    if (!entry.isIntersecting) {
                        token++;
                        running = false;
                        typing?.classList.add('hidden');
                    }
                });
            },
            { threshold: 0.35 }
        );
        observer.observe(root);
    }

    function initMissionActivityTicker() {
        const feed = document.getElementById('missionActivityTicker');
        if (!feed || prefersReducedMotion) return;
        const lines = [...feed.querySelectorAll('.activity-line')];
        if (lines.length < 2) return;

        let index = 0;
        lines.forEach((line, i) => line.classList.toggle('is-active', i === 0));

        setInterval(() => {
            lines[index].classList.remove('is-active');
            index = (index + 1) % lines.length;
            lines[index].classList.add('is-active');
        }, 3200);
    }

    function initHomeTestimonials() {
        const grid = document.getElementById('homeTestimonials');
        if (!grid || prefersReducedMotion) return;
        const cards = [...grid.querySelectorAll('.testimonial-card')];
        if (cards.length < 2) return;

        let index = 0;
        setInterval(() => {
            cards[index].classList.remove('is-active');
            index = (index + 1) % cards.length;
            cards[index].classList.add('is-active');
        }, 5500);
    }

    function initListTicker(listId, intervalMs = 2800) {
        const list = document.getElementById(listId);
        if (!list || prefersReducedMotion) return;
        const nodes = list.classList.contains('home-viz-ticker')
            ? [...list.querySelectorAll('span')]
            : list.querySelector('.activity-line')
              ? [...list.querySelectorAll('.activity-line')]
              : [...list.querySelectorAll('li')];
        if (nodes.length < 2) return;
        let i = 0;
        nodes.forEach((n, idx) => n.classList.toggle('is-active', idx === 0));
        setInterval(() => {
            nodes[i].classList.remove('is-active');
            i = (i + 1) % nodes.length;
            nodes[i].classList.add('is-active');
        }, intervalMs);
    }

    function initHomePossible() {
        const stage = document.getElementById('homePossibleStage');
        const dots = document.getElementById('homePossibleDots');
        if (!stage || prefersReducedMotion) return;
        const slides = [...stage.querySelectorAll('.home-possible-slide')];
        const dotBtns = dots ? [...dots.querySelectorAll('button')] : [];
        let index = 0;

        function show(idx) {
            index = idx;
            slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
            dotBtns.forEach((d, i) => d.classList.toggle('is-active', i === idx));
        }

        dotBtns.forEach((btn) => {
            btn.addEventListener('click', () => show(parseInt(btn.dataset.slide, 10) || 0));
        });

        setInterval(() => show((index + 1) % slides.length), 5000);
    }

    function initHomeSocialFeed() {
        const feed = document.getElementById('homeSocialFeed');
        if (!feed || prefersReducedMotion) return;
        const posts = [...feed.querySelectorAll('.home-social-post')];
        if (posts.length < 2) return;
        let i = 0;
        posts.forEach((p, idx) => p.classList.toggle('is-active', idx === 0));
        setInterval(() => {
            posts[i].classList.remove('is-active');
            i = (i + 1) % posts.length;
            posts[i].classList.add('is-active');
        }, 3500);
    }

    function initWorkflowLiveStep() {
        const board = document.querySelector('.home-workflow-board');
        if (!board || prefersReducedMotion) return;
        const steps = [...board.querySelectorAll('.workflow-step')];
        let i = 0;
        setInterval(() => {
            steps.forEach((s) => s.classList.remove('is-live'));
            steps[i].classList.add('is-live');
            i = (i + 1) % steps.length;
        }, 2200);
    }

    function initKbProgressAnim() {
        const bar = document.getElementById('homeKbProgress');
        if (!bar || prefersReducedMotion) return;
        setInterval(() => {
            const w = 55 + Math.random() * 40;
            bar.style.width = `${w}%`;
        }, 3200);
    }

    function initHomeModern() {
        if (!document.getElementById('landingView')?.classList.contains('home-modern')) return;
        initHomeReveal();
        initHomeMiniChat();
        initMissionActivityTicker();
        initHomeTestimonials();
        initListTicker('sarahActivityFeed');
        initListTicker('aiEmployeeWorkTicker');
        initListTicker('missionActivityFeed');
        initHomePossible();
        initHomeSocialFeed();
        initWorkflowLiveStep();
        initKbProgressAnim();

        document.getElementById('homeChannelsDemoBtn')?.addEventListener('click', () => {
            document.getElementById('product-tour')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // ===== INIT =====
    function init() {
        initCounters();

        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                initLiveKpis();
            }, { timeout: 2000 });
        } else {
            setTimeout(initLiveKpis, 1500);
        }

        initRoiCalculator();
        initPricingCopy();
        initSarahChat();
        initFaq();
        initWatchAiLive();
        initProductTour();
        initDashboardPreview();
        initWorkforceJourney();
        initHireEmployees();
        initCatalog();
        initIndustries();
        initMarketplace();
        initHomeModern();

        document.getElementById('watchDemoBtn')?.addEventListener('click', () => {
            document.getElementById('mission-control')?.scrollIntoView({ behavior: 'smooth' })
                || document.getElementById('product-tour')?.scrollIntoView({ behavior: 'smooth' });
        });
        document.getElementById('talkToSarahBtn')?.addEventListener('click', () => {
            if (typeof openSarahChat === 'function') openSarahChat();
            else openDemo('sarah');
        });
        document.getElementById('watchSarahBtn')?.addEventListener('click', () => {
            document.getElementById('product-tour')?.scrollIntoView({ behavior: 'smooth' });
        });
        document.getElementById('listenVoiceBtn')?.addEventListener('click', playVoiceDemo);
        document.getElementById('demoClose')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeDemo();
        });
        document.getElementById('demoOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'demoOverlay') closeDemo();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('demoOverlay')?.classList.contains('active')) {
                closeDemo();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
