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

    // ===== DEMO MODAL (Watch AI Live) =====
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
            avatar: 'S',
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

        chat.classList.add('is-transitioning');
        if (action) action.classList.remove('visible');

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

    const sarahReplies = [
        { keys: ['setup', 'long', 'minutes', 'install', 'onboard', 'start', 'launch'], reply: 'Most businesses go live in under 10 minutes. Create your account, pick your industry pack, connect WhatsApp, upload your knowledge base — and Sarah starts handling enquiries immediately. No developers needed.' },
        { keys: ['industr', 'school', 'legal', 'health', 'automotive', 'car', 'funeral', 'retail', 'church', 'dealer'], reply: 'We support 50+ industries with pre-built packs — automotive, schools, legal, healthcare, funeral, retail, church, and more. Each pack includes trained workflows, knowledge templates, and channel integrations ready to deploy.' },
        { keys: ['whatsapp', 'channel', 'facebook', 'instagram', 'telegram', 'social', 'web chat'], reply: 'Sarah works on WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS — all from one dashboard. Connect WhatsApp in onboarding with a QR scan. One AI, every channel, 24/7.' },
        { keys: ['trial', 'free', 'demo', 'try', 'test'], reply: 'Yes! Every plan includes a 14-day free trial with full access — no credit card required. Click "Start Free Trial" anywhere on the page, or I can walk you through what Sarah can do for your business right here.' },
        { keys: ['security', 'popia', 'gdpr', 'data', 'encrypt', 'safe', 'secure'], reply: 'Your data is encrypted in transit (TLS 1.3) and at rest (AES-256) on Google Firebase. Each company\'s knowledge is fully isolated with role-based access, audit logs, and POPIA/GDPR-ready consent tools.' },
        { keys: ['sarah', 'who', 'what', 'reception', 'employee', 'ai'], reply: 'I\'m Sarah — your Reception AI. I answer every WhatsApp and web enquiry, book appointments, capture leads, and send quotes — 24/7, in under 2 seconds. I never call in sick and I remember every customer detail.' },
        { keys: ['roi', 'save', 'revenue', 'lead', 'miss'], reply: 'Most businesses lose 30–40% of after-hours enquiries. With Sarah handling them instantly, customers like Central Motors saw a 42% increase in after-hours lead conversion. Scroll down to our ROI calculator to see your numbers.' },
    ];

    const sarahDefaultReply = pk?.getDefaultReply?.() || window.ZiricBillingPlans?.getDefaultPlatformReply?.() || 'Great question! ZiricAI deploys AI employees like me to handle customer enquiries 24/7 on WhatsApp, web, and social. Setup takes under 10 minutes, and you get a 14-day free trial. Try asking about pricing, setup time, industries, or WhatsApp integration — or click Start Free Trial to get going!';

    function getSarahReply(text) {
        if (pk?.matchPlatformQuestion) {
            const matched = pk.matchPlatformQuestion(text);
            if (matched) return matched;
            return pk.getDefaultReply?.() || sarahDefaultReply;
        }
        const lower = text.toLowerCase();
        for (const entry of sarahReplies) {
            if (entry.keys.some((k) => lower.includes(k))) return entry.reply;
        }
        return sarahDefaultReply;
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

        async function sendSarahMessage(text) {
            const trimmed = text.trim();
            if (!trimmed) return;

            appendMessage(trimmed, 'user');
            input.value = '';

            const typing = document.createElement('div');
            typing.className = 'sarah-msg typing';
            typing.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
            messages.appendChild(typing);
            messages.scrollTop = messages.scrollHeight;

            await delay(800 + Math.random() * 600);
            typing.remove();
            appendMessage(getSarahReply(trimmed), 'ai');
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
            title: 'Step 1 · Answer WhatsApp enquiry',
            desc: 'A customer asks about stock at 9pm. Sarah replies instantly with accurate inventory from your knowledge base.',
            action: '',
            messages: [
                { role: 'customer', text: 'Hi, do you have a 2024 Toyota Hilux in stock?' },
                { role: 'ai', text: 'Good evening! Yes — we have 3 Hilux models available:\n\n• 2.4 GD-6 Raider — R589,900\n• 2.8 GD-6 Legend — R724,500\n• 2.8 GD-6 GR-S — R798,900\n\nWould you like specs on any of these, or financing options?' },
                { role: 'customer', text: 'Tell me more about the Legend — what\'s included?' },
                { role: 'ai', text: 'The 2.8 GD-6 Legend includes leather seats, LED headlights, 12.3" touchscreen, reverse camera, and Toyota Safety Sense. It\'s our best-selling double cab.\n\nWould you like a brochure or to compare it with the Raider?' },
            ],
        },
        {
            title: 'Step 2 · Book appointment',
            desc: 'Sarah checks your calendar and confirms a test drive — no back-and-forth, no missed bookings.',
            action: '✓ Appointment synced to calendar',
            messages: [
                { role: 'customer', text: 'Can I book a test drive this Saturday?' },
                { role: 'ai', text: 'Absolutely! I have these slots available this Saturday:\n\n• 10:00 AM\n• 12:30 PM\n• 2:00 PM\n\nWhich works best for you?' },
                { role: 'customer', text: '10 AM please. It\'ll just be me.' },
                { role: 'ai', text: 'Done — test drive booked for Saturday 10:00 AM for the Hilux Legend. Confirmation sent to your WhatsApp with our dealership address and parking info.\n\nSee you then! 🚗' },
                { role: 'customer', text: 'Perfect, thanks!' },
                { role: 'ai', text: 'You\'re welcome, Thabo! I\'ve also saved your details so we can prepare the vehicle before you arrive. Reply anytime if you need to reschedule.' },
            ],
        },
        {
            title: 'Step 3 · Capture lead',
            desc: 'Every conversation becomes a CRM lead with contact details, intent, and deal value — automatically.',
            action: '✓ Lead created · R589,900 · Hot',
            messages: [
                { role: 'system', text: '📋 Lead captured in CRM' },
                { role: 'system', text: 'Name: Thabo M. · Intent: Hilux Legend purchase · Value: R724,500 · Status: Hot' },
                { role: 'ai', text: 'I\'ve saved your details, Thabo. Our sales team will follow up with a personalised financing quote within the hour.' },
                { role: 'customer', text: 'Great. Can you also check if you have the Legend in white?' },
                { role: 'ai', text: 'Yes — we have the Legend in Glacier White and Silver Metallic on the floor. Both are available for your Saturday test drive. I\'ve noted your colour preference on your profile.' },
            ],
        },
        {
            title: 'Step 4 · Generate quotation',
            desc: 'Sarah pulls pricing from your knowledge base and sends a professional quote — before the customer asks twice.',
            action: '✓ Quote #CM-2847 sent via WhatsApp',
            messages: [
                { role: 'customer', text: 'Can you send me a quote for the Legend with financing?' },
                { role: 'ai', text: 'Here\'s your personalised quote:\n\n2024 Hilux 2.8 GD-6 Legend — R724,500\nColour: Glacier White\nDeposit: R72,450 (10%)\n36-month finance: R18,200/mo\n48-month finance: R14,850/mo\n\nQuote valid 7 days. Reply ACCEPT to proceed.' },
                { role: 'customer', text: 'What if I put down 20% instead?' },
                { role: 'ai', text: 'With a 20% deposit (R144,900), your monthly payment over 36 months drops to R16,100/mo — saving you R2,100/month.\n\nI\'ve updated quote #CM-2847 and sent the revised PDF to your WhatsApp.' },
                { role: 'system', text: '📄 Quote #CM-2847 updated & sent' },
                { role: 'ai', text: 'Your test drive is still confirmed for Saturday 10 AM. Our finance manager can walk you through both options in person. Anything else I can help with?' },
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

        document.getElementById('watchDemoBtn')?.addEventListener('click', () => openDemo('sales'));
        document.getElementById('watchDemoBtn2')?.addEventListener('click', () => openDemo('sales'));
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
