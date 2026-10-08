/**
 * Shared HTML shell for multi-page marketing site (Website Evolution Gate 1).
 * Used by prepare-sites.js — not loaded in browser.
 */

export function marketingRootPrefix(depth = 0) {
  if (!depth) return './';
  return '../'.repeat(depth);
}

export function renderMarketingHead({ title, description, depth = 0 }) {
  const root = marketingRootPrefix(depth);
  const desc = description || 'ZiricAI — Your AI workforce, working everywhere your customers are.';
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${desc.replace(/"/g, '&quot;')}">
    <link rel="icon" href="${root}assets/favicon.png" type="image/png">
    <link rel="apple-touch-icon" href="${root}assets/favicon.png">
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="${root}css/onboarding.css">
    <link rel="stylesheet" href="${root}css/ziricai-landing.css">
    <link rel="stylesheet" href="${root}css/admin-dashboard.css">
    <script type="importmap">
    {
      "imports": {
        "firebase/app": "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js",
        "firebase/auth": "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js",
        "firebase/firestore": "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js",
        "firebase/storage": "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js"
      }
    }
    </script>
</head>
<body>`;
}

const NAV_ITEMS = [
  { id: 'platforms', label: 'Platforms', href: (r) => `${r}platforms/whatsapp/` },
  { id: 'ai-employees', label: 'AI Employees', href: (r) => `${r}#ai-employees` },
  { id: 'solutions', label: 'Solutions', href: (r) => `${r}solutions/automotive/` },
  { id: 'pricing', label: 'Pricing', href: (r) => `${r}pricing/` },
];

export function renderMarketingHeader({ depth = 0, active = '', homeHref = null }) {
  const root = marketingRootPrefix(depth);
  const home = homeHref ?? `${root}`;
  const links = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href(root)}" class="${active === item.id ? 'nav-active' : ''}">${item.label}</a>`
  ).join('\n                ');

  return `<header class="landing-header site-header-v2">
    <div class="container header-inner">
        <a href="${home}" class="logo"><img src="${root}assets/ZIRICAI LOGO.png" alt="ZiricAI" class="logo-img"></a>
        <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Menu"><i class="fa-solid fa-bars"></i></button>
        <div class="header-nav-panel" id="headerNavPanel">
            <nav class="nav-links" id="navLinks">
                ${links}
                <a href="${root}#faq">FAQ</a>
            </nav>
            <div class="nav-ctas">
                <a href="${root}login.html" class="btn btn-sm">Log in</a>
                <button type="button" class="btn btn-sm" onclick="launchWizard()">Start Free Trial</button>
            </div>
        </div>
    </div>
</header>`;
}

export function renderMarketingFooter({ depth = 0 }) {
  const root = marketingRootPrefix(depth);
  return `<footer class="site-footer">
    <div class="container">
        <div class="footer-grid">
            <div class="footer-brand">
                <a href="${root}" class="logo"><img src="${root}assets/ZIRICAI LOGO.png" alt="ZiricAI" class="logo-img"></a>
                <p>Your AI workforce, working everywhere your customers are. Sarah on every channel — CRM, knowledge, and automation behind the conversations.</p>
            </div>
            <div class="footer-col">
                <h5>Platforms</h5>
                <a href="${root}platforms/whatsapp/">WhatsApp</a>
                <a href="${root}platforms/webchat/">Webchat</a>
                <a href="${root}#integrations">All channels</a>
            </div>
            <div class="footer-col">
                <h5>Product</h5>
                <a href="${root}#ai-employees">AI Employees</a>
                <a href="${root}#automation">Automation</a>
                <a href="${root}#knowledge">Knowledge</a>
                <a href="${root}pricing/">Pricing</a>
            </div>
            <div class="footer-col">
                <h5>Solutions</h5>
                <a href="${root}solutions/automotive/">Automotive</a>
                <a href="${root}#industries">Industries</a>
                <a href="mailto:hello@ziric.ai">Contact</a>
            </div>
            <div class="footer-col">
                <h5>Platform</h5>
                <a href="#" data-site-link="app">Company Portal</a>
                <a href="#" data-site-link="admin">Mission Control</a>
                <a href="${root}login.html">Sign in</a>
            </div>
        </div>
        <div class="footer-bottom">
            <span>&copy; 2026 ZiricAI — built by Ziric Media</span>
            <div class="footer-bottom-links">
                <a href="${root}privacy.html">Privacy Policy</a>
                <a href="${root}login.html">Sign in</a>
            </div>
        </div>
    </div>
</footer>`;
}

export function renderMarketingWizardSarah({ depth = 0 }) {
  const root = marketingRootPrefix(depth);
  return `
<div id="wizardView" class="wizard-view hidden onboarding-body">
    <div class="onboarding-bg"></div>
    <header class="onboarding-header">
        <a href="${root}" class="onboarding-brand" id="wizardBackHome">
            <img src="${root}assets/ZIRICAI LOGO.png" alt="ZiricAI" class="logo-img">
        </a>
        <div class="onboarding-header-meta">
            <span class="trial-pill"><i class="fa-solid fa-gift"></i> 14-day free trial</span>
            <a href="${root}login.html" class="link-muted">Sign in</a>
        </div>
    </header>
    <main class="onboarding-main">
        <aside class="onboarding-progress-panel">
            <h2>Launch in minutes</h2>
            <p class="progress-sub">Set up your AI workforce — no credit card required.</p>
            <ol class="step-list" id="stepList"></ol>
            <div class="progress-bar-wrap">
                <div class="progress-bar"><div class="progress-fill" id="overallProgress"></div></div>
                <span id="progressLabel">Step 1 of 7</span>
            </div>
        </aside>
        <section class="onboarding-card" id="wizardCard">
            <div id="stepContent"></div>
            <div class="wizard-actions" id="wizardActions"></div>
            <p class="wizard-status" id="wizardStatus"></p>
        </section>
    </main>
    <footer class="onboarding-footer">
        <span>&copy; ZiricAI &middot; POPIA-ready &middot; <a href="#" data-site-link="admin">Mission Control</a></span>
    </footer>
</div>

<div class="sarah-widget" id="sarahWidget">
    <div class="sarah-panel" id="sarahPanel" aria-hidden="true">
        <div class="sarah-panel-header">
            <div class="sarah-panel-avatar"><img src="${root}assets/sarah-avatar.svg" alt="" width="40" height="40"></div>
            <div>
                <strong>Sarah</strong>
                <span>ZiricAI assistant · Online</span>
            </div>
            <button class="sarah-panel-close" id="sarahPanelClose" aria-label="Close chat">&times;</button>
        </div>
        <div class="sarah-panel-messages" id="sarahMessages">
            <div class="sarah-msg ai">Hi 👋 I'm Sarah. Ask me about platforms, AI Employees, pricing, or how to get started.</div>
        </div>
        <div class="sarah-panel-suggestions" id="sarahSuggestions">
            <button type="button" data-q="How much does ZiricAI cost?">Pricing</button>
            <button type="button" data-q="Does Sarah work on WhatsApp?">WhatsApp</button>
            <button type="button" data-q="What is an AI Employee?">AI Employees</button>
        </div>
        <form class="sarah-panel-input" id="sarahForm">
            <input type="text" id="sarahInput" placeholder="Ask Sarah anything…" autocomplete="off" maxlength="500">
            <button type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
    </div>
    <button class="sarah-bubble" id="sarahBubble" aria-label="Chat with Sarah">
        <span class="sarah-bubble-avatar"><img src="${root}assets/sarah-avatar.svg" alt="" width="44" height="44"></span>
        <span class="sarah-bubble-text">Chat with Sarah</span>
        <span class="sarah-bubble-icon"><i class="fa-solid fa-comment-dots"></i></span>
    </button>
</div>

<div class="toast-container" id="toastContainer"></div>`;
}

export function renderMarketingScripts({ depth = 0, includePricing = false, includeLanding = true, extraScript = '' }) {
  const root = marketingRootPrefix(depth);
  const pricingScripts = includePricing
    ? `<script src="${root}js/shared/billingPlans.browser.js"></script>
<script src="${root}js/landing/pricing-landing.browser.js"></script>`
    : '';
  const landingScript = includeLanding
    ? `<script src="${root}js/shared/platformKnowledge.browser.js"></script>
<script src="${root}js/shared/marketplacePacks.browser.js"></script>
<script src="${root}js/shared/aiEmployeesCatalog.browser.js"></script>
<script src="${root}js/shared/industryTemplates.browser.js"></script>
<script src="${root}js/ziricai-landing.js"></script>`
    : `<script src="${root}js/ziricai-landing.js"></script>`;

  return `${pricingScripts}
${landingScript}
${extraScript}
<script>
    function launchWizard() {
        const landing = document.getElementById('landingView');
        const wizard = document.getElementById('wizardView');
        if (!landing || !wizard) {
            window.location.href = ${JSON.stringify(`${root}#start`)};
            return;
        }
        landing.classList.add('hidden');
        wizard.classList.remove('hidden');
        document.body.classList.add('wizard-active');
        history.replaceState(null, '', '#start');
        window.scrollTo(0, 0);
        window.dispatchEvent(new CustomEvent('ziric:wizard-open'));
        window.initOnboarding?.();
    }
    window.launchWizard = launchWizard;
    document.getElementById('wizardBackHome')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = ${JSON.stringify(root)};
    });
    if (location.hash === '#start' || location.hash === '#wizard') launchWizard();
    window.addEventListener('hashchange', () => {
        if (location.hash === '#start' || location.hash === '#wizard') launchWizard();
    });
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('headerNavPanel')?.classList.toggle('open');
    });
</script>
<script type="module" src="${root}js/onboarding/main.js"></script>`;
}

export function wrapMarketingPage({
  title,
  description,
  depth = 0,
  activeNav = '',
  bodyHtml,
  includePricing = false,
  includeLanding = false,
  extraScript = '',
}) {
  return `${renderMarketingHead({ title, description, depth })}
<div id="landingView" class="landing-view marketing-subpage">
${renderMarketingHeader({ depth, active: activeNav })}
<main class="marketing-page-main">
${bodyHtml}
</main>
${renderMarketingFooter({ depth })}
</div>
${renderMarketingWizardSarah({ depth })}
${renderMarketingScripts({ depth, includePricing, includeLanding, extraScript })}
</body>
</html>`;
}
