/** FAQ section HTML for /faq/ (asset paths use depth prefix e.g. ../). */
export function renderFaqSection(assetRoot = '../') {
  const a = assetRoot;
  return `<section class="section section-alt marketing-page-hero" id="faq">
    <div class="container">
        <div class="split-panel-layout faq-layout">
            <aside class="split-panel-left faq-sidebar">
                <span class="section-eyebrow">FAQ</span>
                <h1 class="faq-sidebar-title">Got questions? We've got answers.</h1>
                <p class="faq-sidebar-intro">Everything you need to know about setup, channels, security, and pricing — or ask Sarah anytime.</p>
                <nav class="faq-categories" id="faqCategories" aria-label="FAQ categories">
                    <button type="button" class="faq-cat-btn active" data-faq-cat="all"><i class="fa-solid fa-grid-2"></i> All questions</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="getting-started"><i class="fa-solid fa-rocket"></i> Getting started</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="product"><i class="fa-solid fa-plug"></i> Product &amp; channels</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="security"><i class="fa-solid fa-shield-halved"></i> Security &amp; privacy</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="billing"><i class="fa-solid fa-credit-card"></i> Billing &amp; trial</button>
                </nav>
                <div class="faq-sarah-prompt">
                    <div class="faq-sarah-avatar"><img src="${a}assets/sarah-avatar.svg" alt="" width="44" height="44"></div>
                    <div>
                        <strong>Still unsure?</strong>
                        <p>Ask Sarah — she knows pricing, setup, and every industry pack.</p>
                        <button type="button" class="btn btn-outline btn-sm" id="faqAskSarahBtn"><i class="fa-solid fa-comment-dots"></i> Chat with Sarah</button>
                    </div>
                </div>
            </aside>
            <div class="split-panel-right faq-content">
                <div class="faq-list" id="faqList">
                    <div class="faq-item" data-faq-cat="getting-started">
                        <button class="faq-question" type="button">How long does setup take? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Most businesses go live in under 10 minutes. Create your account, choose your industry pack, connect WhatsApp, upload knowledge, and your AI employee is ready.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="getting-started">
                        <button class="faq-question" type="button">Do I need coding skills? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>No. ZiricAI is designed for business owners and teams. Everything is point-and-click — from onboarding to workflow automation.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="product">
                        <button class="faq-question" type="button">Which channels are supported? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS. More channels are added regularly.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="security">
                        <button class="faq-question" type="button">Is my data secure? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Yes. All data is encrypted at rest and in transit. Each company's knowledge base is fully isolated. ZiricAI is POPIA-ready with role-based access and audit logs.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="billing">
                        <button class="faq-question" type="button">Can I try before I pay? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Absolutely. Every plan includes a 14-day free trial with full access. No credit card required to start.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="billing">
                        <button class="faq-question" type="button">What happens after the trial? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Choose a plan that fits your business. Your AI employees, knowledge base, and conversation history carry over seamlessly.</p></div>
                    </div>
                </div>
            </div>
        </div>
        <p class="marketing-page-back"><a href="/"><i class="fa-solid fa-arrow-left"></i> Back to home</a> · <a href="/pricing/">Pricing</a></p>
    </div>
</section>`;
}
