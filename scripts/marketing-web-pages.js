/**
 * Marketing subpage body fragments (Gate 1 Wave 1).
 */

export function tourPhoneBlock({ title = 'Central Motors', idsPrefix = '' }) {
  const titleId = idsPrefix ? `${idsPrefix}PhoneTitle` : 'tourPhoneTitle';
  const chatId = idsPrefix ? `${idsPrefix}PhoneChat` : 'tourPhoneChat';
  const actionId = idsPrefix ? `${idsPrefix}PhoneAction` : 'tourPhoneAction';
  return `<div class="tour-phone-wrap">
                <div class="device-simulator device-iphone" aria-hidden="true">
                    <div class="device-frame">
                        <div class="device-btn device-btn-silent"></div>
                        <div class="device-btn device-btn-vol-up"></div>
                        <div class="device-btn device-btn-vol-down"></div>
                        <div class="device-btn device-btn-power"></div>
                        <div class="device-screen">
                            <div class="device-status-bar">
                                <span class="device-time">9:41</span>
                                <div class="device-dynamic-island"><span class="device-island-cam"></span></div>
                                <div class="device-status-icons">
                                    <i class="fa-solid fa-signal"></i>
                                    <i class="fa-solid fa-wifi"></i>
                                    <span class="device-battery"><span class="device-battery-level"></span></span>
                                </div>
                            </div>
                            <div class="tour-phone-app">
                                <div class="tour-phone-header">
                                    <span class="tour-phone-back"><i class="fa-solid fa-chevron-left"></i></span>
                                    <div class="tour-phone-avatar">S</div>
                                    <div class="tour-phone-contact">
                                        <span class="tour-phone-title" id="${titleId}">${title}</span>
                                        <span class="tour-phone-status"><span class="pulse-dot"></span> Sarah · online</span>
                                    </div>
                                    <div class="tour-phone-actions">
                                        <i class="fa-brands fa-whatsapp"></i>
                                        <i class="fa-solid fa-phone"></i>
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </div>
                                </div>
                                <div class="tour-phone-chat" id="${chatId}"></div>
                                <div class="tour-phone-action" id="${actionId}"></div>
                                <div class="tour-phone-input">
                                    <i class="fa-regular fa-face-smile"></i>
                                    <span class="tour-phone-input-field">Message</span>
                                    <i class="fa-solid fa-paperclip"></i>
                                    <span class="tour-phone-send"><i class="fa-solid fa-microphone"></i></span>
                                </div>
                            </div>
                            <div class="device-home-indicator"></div>
                        </div>
                    </div>
                    <div class="device-shadow"></div>
                </div>
            </div>`;
}

export const MARKETING_WEB_PAGES = [
  {
    outPath: 'pricing/index.html',
    title: 'Pricing · ZiricAI',
    description: 'Simple, scalable pricing for your AI workforce — 14-day free trial, canonical plans from ZiricAI billing.',
    depth: 1,
    activeNav: 'pricing',
    includePricing: true,
    includeLanding: false,
    bodyHtml: `<section class="section marketing-page-hero" id="pricing">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">Pricing</span>
            <h1>Simple, scalable pricing</h1>
            <p>Every plan includes setup, AI training, and access to future platform updates. Same plans as on the homepage — always in sync.</p>
        </div>
        <div class="pricing-grid" aria-live="polite" aria-busy="true"></div>
        <p class="pricing-note">14-day free trial on all plans. No credit card required.</p>
        <p class="marketing-page-back"><a href="../"><i class="fa-solid fa-arrow-left"></i> Back to home</a></p>
    </div>
</section>`,
  },
  {
    outPath: 'platforms/whatsapp/index.html',
    title: 'WhatsApp · ZiricAI Platforms',
    description: 'Sarah on WhatsApp — inventory, bookings, and sales conversations with CRM and automation behind every reply.',
    depth: 2,
    activeNav: 'platforms',
    includePricing: false,
    includeLanding: true,
    bodyHtml: `<section class="section marketing-page-hero platform-page-hero">
    <div class="container">
        <span class="section-eyebrow"><i class="fa-brands fa-whatsapp"></i> Platform</span>
        <h1>WhatsApp — where your customers already are</h1>
        <p class="intro-lead">One AI Employee on WhatsApp: instant replies, your knowledge base, CRM updates, and automations — without another inbox to babysit.</p>
        <div class="hero-actions">
            <button class="btn btn-glow" type="button" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Connect WhatsApp</button>
            <a class="btn btn-ghost" href="../../#product-tour"><i class="fa-solid fa-play"></i> Tour on home</a>
        </div>
    </div>
</section>
<section class="section section-alt" id="product-tour">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">Live Demo</span>
            <h2>Watch Sarah on WhatsApp</h2>
            <p>Same product tour as the homepage — a real customer journey in four steps.</p>
        </div>
        <div class="tour-layout">
            ${tourPhoneBlock({ title: 'Central Motors' })}
            <div class="tour-controls">
                <div class="tour-step-indicator">
                    <span class="tour-dot active" data-step="0"></span>
                    <span class="tour-dot" data-step="1"></span>
                    <span class="tour-dot" data-step="2"></span>
                    <span class="tour-dot" data-step="3"></span>
                </div>
                <h3 id="tourStepTitle">Step 1 · Answer WhatsApp enquiry</h3>
                <p id="tourStepDesc">A customer asks about stock at 9pm. Sarah replies instantly with accurate inventory from your knowledge base.</p>
                <div class="tour-nav">
                    <button class="btn btn-outline" id="tourPrevBtn" disabled type="button"><i class="fa-solid fa-arrow-left"></i> Back</button>
                    <button class="btn" id="tourNextBtn" type="button">Next <i class="fa-solid fa-arrow-right"></i></button>
                </div>
                <button class="btn btn-glow tour-cta hidden" id="tourCtaBtn" type="button" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Start Free Trial</button>
            </div>
        </div>
    </div>
</section>
<section class="section">
    <div class="container platform-cap-grid">
        <div class="platform-cap-card"><i class="fa-solid fa-book"></i><h3>Knowledge-backed replies</h3><p>Stock, policies, and FAQs from your live knowledge base — not generic chatbot fluff.</p></div>
        <div class="platform-cap-card"><i class="fa-solid fa-address-book"></i><h3>CRM on every message</h3><p>Leads and conversation history sync to your portal automatically.</p></div>
        <div class="platform-cap-card"><i class="fa-solid fa-bolt"></i><h3>Automations</h3><p>Bookings, handoffs, and notifications fire when Sarah completes a step.</p></div>
    </div>
</section>`,
  },
  {
    outPath: 'platforms/webchat/index.html',
    title: 'Webchat · ZiricAI Platforms',
    description: 'Embed Sarah on your website — live chat with the same AI workforce, knowledge, and automations as WhatsApp.',
    depth: 2,
    activeNav: 'platforms',
    includePricing: false,
    includeLanding: false,
    bodyHtml: `<section class="section marketing-page-hero platform-page-hero">
    <div class="container">
        <span class="section-eyebrow"><i class="fa-solid fa-comment-dots"></i> Platform</span>
        <h1>Webchat — Sarah on your site</h1>
        <p class="intro-lead">The same Sarah you see in the corner of every marketing page — trained on your business, connected to your portal, ready for visitors 24/7.</p>
        <div class="hero-actions">
            <button class="btn btn-glow" type="button" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Add webchat</button>
            <button class="btn btn-ghost" type="button" onclick="document.getElementById('sarahBubble')?.click()"><i class="fa-solid fa-comment-dots"></i> Try Sarah now</button>
        </div>
    </div>
</section>
<section class="section section-alt">
    <div class="container webchat-explainer">
        <div class="webchat-explainer-copy">
            <h2>One workforce, every channel</h2>
            <p>Webchat is not a separate bot — it is Sarah, your lead AI Employee, with the same catalog, pricing knowledge, and escalation paths as WhatsApp.</p>
            <ul class="webchat-checklist">
                <li><i class="fa-solid fa-check"></i> Widget matches your brand</li>
                <li><i class="fa-solid fa-check"></i> Suggested prompts for common questions</li>
                <li><i class="fa-solid fa-check"></i> Hand off to humans in the Company Portal</li>
                <li><i class="fa-solid fa-check"></i> POPIA-ready consent and logging</li>
            </ul>
            <p class="webchat-hint"><i class="fa-solid fa-hand-pointer"></i> Use the <strong>Chat with Sarah</strong> bubble on this page to experience webchat firsthand.</p>
        </div>
        <div class="webchat-widget-preview" aria-hidden="true">
            <div class="webchat-preview-card">
                <div class="webchat-preview-header"><img src="../../assets/sarah-avatar.svg" alt="" width="36" height="36"><span>Sarah · Online</span></div>
                <div class="webchat-preview-msg ai">Hi 👋 Ask me about platforms, pricing, or getting started.</div>
                <div class="webchat-preview-msg user">Do you support WhatsApp too?</div>
                <div class="webchat-preview-msg ai">Yes — Sarah runs on WhatsApp, webchat, and more from one portal.</div>
            </div>
        </div>
    </div>
</section>`,
  },
  {
    outPath: 'solutions/automotive/index.html',
    title: 'Automotive · ZiricAI Solutions',
    description: 'AI for car dealers — stock enquiries, financing, test drives, and trade-ins on WhatsApp and webchat.',
    depth: 2,
    activeNav: 'solutions',
    includePricing: false,
    includeLanding: false,
    bodyHtml: `<section class="industry-hero marketing-industry-hero">
    <div class="container">
        <span class="hero-badge"><span class="pulse-dot"></span> Car Dealer Pack</span>
        <h1>AI for automotive dealers</h1>
        <p>Close deals at midnight. Answer stock enquiries instantly. Book test drives while your sales team sleeps.</p>
        <div class="industry-hero-actions">
            <button class="btn btn-glow btn-lg" type="button" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Start Free Trial</button>
            <a href="../../platforms/whatsapp/" class="btn btn-ghost btn-lg"><i class="fa-brands fa-whatsapp"></i> Sarah on WhatsApp</a>
        </div>
    </div>
</section>
<section class="industry-features">
    <div class="container">
        <div class="section-header">
            <h2>Built for car dealers</h2>
            <p>Inventory queries, financing quotes, test drive booking, and trade-in valuations — automated.</p>
        </div>
        <div class="industry-features-grid">
            <div class="agent-card"><div class="agent-avatar">🚗</div><h4>Stock enquiries</h4><p>Instant answers from your live inventory</p></div>
            <div class="agent-card"><div class="agent-avatar">💰</div><h4>Financing quotes</h4><p>Send quotes before they ask twice</p></div>
            <div class="agent-card"><div class="agent-avatar">📅</div><h4>Test drive booking</h4><p>Calendar sync, confirmations, reminders</p></div>
            <div class="agent-card"><div class="agent-avatar">🔄</div><h4>Trade-in valuations</h4><p>Capture details and route to appraisers</p></div>
        </div>
        <p style="text-align:center;margin-top:32px;"><a href="../../#case-studies" class="btn">See Central Motors case study</a></p>
    </div>
</section>`,
  },
];
