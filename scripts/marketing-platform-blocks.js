/** Shared HTML blocks for Platform product pages. */

import { marketingDetail, marketingPricingSection } from './marketing-page-blocks.js';

export { marketingPricingSection };

const HERO_VISUALS = {
  os: `<div class="phm-stack">
      <div class="phm-layer"><i class="fa-solid fa-users-gear"></i><span>AI Employees</span></div>
      <div class="phm-layer"><i class="fa-solid fa-book"></i><span>Knowledge</span></div>
      <div class="phm-layer"><i class="fa-solid fa-bolt"></i><span>Automation</span></div>
      <div class="phm-layer phm-glow"><i class="fa-solid fa-satellite-dish"></i><span>Mission Control</span></div>
    </div>`,
  knowledge: `<div class="phm-docs">
      <div class="phm-doc"><i class="fa-solid fa-file-pdf"></i><span>Price List.pdf</span><em>Trained</em></div>
      <div class="phm-doc"><i class="fa-solid fa-globe"></i><span>yourwebsite.co.za</span><em>Indexed</em></div>
      <div class="phm-doc phm-doc-active"><i class="fa-solid fa-brain"></i><span>Embedding…</span><em>72%</em></div>
    </div>`,
  crm: `<div class="phm-crm">
      <div class="phm-crm-head"><i class="fa-solid fa-user"></i> Lead · WhatsApp</div>
      <div class="phm-crm-row"><span>Stage</span><strong>Qualified</strong></div>
      <div class="phm-crm-row"><span>Value</span><strong>R 45,000</strong></div>
      <div class="phm-crm-timeline"><span></span><span></span><span class="is-live"></span></div>
    </div>`,
  automation: `<div class="phm-flow-h">
      <span><i class="fa-solid fa-comment"></i></span><i class="fa-solid fa-arrow-right"></i>
      <span><i class="fa-solid fa-robot"></i></span><i class="fa-solid fa-arrow-right"></i>
      <span><i class="fa-solid fa-calendar-check"></i></span><i class="fa-solid fa-arrow-right"></i>
      <span><i class="fa-solid fa-bell"></i></span>
    </div>`,
  analytics: `<div class="phm-chart">
      <div class="phm-chart-bars"><span style="--h:55%"></span><span style="--h:78%"></span><span style="--h:42%"></span><span style="--h:90%"></span><span style="--h:65%"></span></div>
      <div class="phm-chart-meta"><strong>98.8%</strong> AI accuracy · <strong>143</strong> live chats</div>
    </div>`,
  'mission-control': `<div class="phm-mc">
      <div class="phm-mc-kpi"><strong>347</strong><span>AI online</span></div>
      <div class="phm-mc-kpi"><strong>143</strong><span>Live chats</span></div>
      <div class="phm-mc-kpi"><strong>R384K</strong><span>Today</span></div>
      <div class="phm-mc-pulse"><span class="pulse-dot"></span> Command center live</div>
    </div>`,
  integrations: `<div class="phm-hub">
      <div class="phm-hub-center"><i class="fa-solid fa-robot"></i></div>
      <span class="phm-orbit phm-o1"><i class="fa-brands fa-whatsapp"></i></span>
      <span class="phm-orbit phm-o2"><i class="fa-solid fa-address-book"></i></span>
      <span class="phm-orbit phm-o3"><i class="fa-solid fa-calendar"></i></span>
      <span class="phm-orbit phm-o4"><i class="fa-solid fa-credit-card"></i></span>
    </div>`,
  whatsapp: `<div class="phm-wa">
      <div class="phm-wa-header"><i class="fa-brands fa-whatsapp"></i> Sarah · online</div>
      <div class="phm-wa-bubble them">Hi, do you have stock on the Hilux Legend?</div>
      <div class="phm-wa-bubble us">Yes — 3 units available. Want to book a test drive?</div>
    </div>`,
  webchat: `<div class="phm-web">
      <div class="phm-web-widget">
        <div class="phm-web-top"><img src="__SARAH_AVATAR__" alt="" width="28" height="28"><span>Sarah</span></div>
        <div class="phm-web-msg">Hi 👋 How can I help you today?</div>
        <div class="phm-web-input">Ask anything…</div>
      </div>
    </div>`,
  'workforce-browse': `<div class="phm-wf-roster">
      <div class="phm-wf-person"><img src="__SARAH_AVATAR__" alt="" width="36" height="36"><div><strong>Sarah</strong><span>AI Receptionist</span></div><em>Hire</em></div>
      <div class="phm-wf-person phm-wf-muted"><span class="phm-wf-av">A</span><div><strong>Alex</strong><span>Sales Consultant</span></div><em>Hire</em></div>
      <div class="phm-wf-person phm-wf-muted"><span class="phm-wf-av">M</span><div><strong>Maya</strong><span>Customer Support</span></div><em>Hire</em></div>
    </div>`,
  'workforce-how': `<div class="phm-wf-steps">
      <span>Choose</span><i class="fa-solid fa-chevron-right"></i><span>Hire</span><i class="fa-solid fa-chevron-right"></i><span>Train</span><i class="fa-solid fa-chevron-right"></i><span>Deploy</span>
    </div>`,
  'workforce-dept': `<div class="phm-wf-dept">
      <div class="phm-wf-dept-icon"><i class="fa-solid fa-users-gear"></i></div>
      <p><strong>8 departments</strong> · <strong>30+ roles</strong> · Pre-trained</p>
    </div>`,
  solutions: `<div class="phm-solution-pills">
      <span>Customer Service</span><span>Sales</span><span>Operations</span><span>Enterprise</span>
    </div>`,
  industries: `<div class="phm-ind-grid">
      <span><i class="fa-solid fa-car"></i> Auto</span><span><i class="fa-solid fa-heart-pulse"></i> Health</span><span><i class="fa-solid fa-gavel"></i> Legal</span><span><i class="fa-solid fa-store"></i> Retail</span>
    </div>`,
  resources: `<div class="phm-docs">
      <div class="phm-doc"><i class="fa-solid fa-book"></i><span>Guides</span><em>12</em></div>
      <div class="phm-doc"><i class="fa-solid fa-shield-halved"></i><span>Security</span><em>Trust</em></div>
      <div class="phm-doc phm-doc-active"><i class="fa-solid fa-circle-question"></i><span>FAQ</span><em>Live</em></div>
    </div>`,
};

export function productHero({ eyebrow, title, lead, actions = '', theme = 'os', assetPrefix = '' }) {
  const visual = (HERO_VISUALS[theme] || HERO_VISUALS.os).replace(/__SARAH_AVATAR__/g, `${assetPrefix}assets/sarah-avatar.svg`);
  const visualHtml = visual;
  return `<section class="section marketing-page-hero marketing-page-block-hero platform-product-hero platform-hero-theme-${theme}">
    <div class="platform-hero-bg" aria-hidden="true"></div>
    <div class="container platform-hero-split">
        <div class="platform-hero-copy">
            <span class="section-eyebrow">${eyebrow}</span>
            <h1>${title}</h1>
            ${lead ? `<p class="intro-lead">${lead}</p>` : ''}
            ${actions ? `<div class="hero-actions marketing-hero-actions">${actions}</div>` : ''}
        </div>
        <div class="platform-hero-visual platform-hero-visual--${theme}" aria-hidden="true">
            <div class="platform-hero-visual-glow"></div>
            ${visualHtml}
        </div>
    </div>
</section>`;
}

export function platformSectionHeader({ eyebrow = '', title, subtitle = '' }) {
  return `<div class="section-header platform-section-header marketing-detail-header">
        ${eyebrow ? `<span class="section-eyebrow">${eyebrow}</span>` : ''}
        <h2>${title}</h2>
        ${subtitle ? `<p class="platform-section-sub">${subtitle}</p>` : ''}
    </div>`;
}

export function platformIntro({ title, body, icon = 'fa-lightbulb' }) {
  return `<section class="section platform-intro-section">
    <div class="container">
        <div class="platform-intro-card">
            <div class="platform-intro-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="platform-intro-body">
                ${title ? `<h2>${title}</h2>` : ''}
                <div class="platform-intro-text">${body}</div>
            </div>
        </div>
    </div>
</section>`;
}

export function platformDetail(innerHtml, { alt = false } = {}) {
  return marketingDetail(`<div class="platform-detail-shell">${innerHtml}</div>`, { alt });
}

export function mktActions(html) {
  return html ? `<div class="hero-actions marketing-hero-actions">${html}</div>` : '';
}

export function mktFinalCta({ title, body, primaryHtml, secondaryHtml = '' }) {
  return `<section class="section marketing-final-cta platform-final-cta">
    <div class="container marketing-final-cta-inner">
        <h2>${title}</h2>
        ${body ? `<p>${body}</p>` : ''}
        <div class="hero-actions marketing-hero-actions">
            ${primaryHtml}
            ${secondaryHtml}
        </div>
    </div>
</section>`;
}

export function platformStack(steps) {
  const rows = steps
    .map(
      (s, i) => `<div class="platform-stack-step">
            <div class="platform-stack-icon"><i class="fa-solid ${s.icon}"></i></div>
            <div class="platform-stack-text"><strong>${s.title}</strong><span>${s.sub}</span></div>
        </div>${i < steps.length - 1 ? '<div class="platform-stack-arrow" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></div>' : ''}`
    )
    .join('\n        ');
  return `<div class="platform-stack platform-stack-vertical">${rows}</div>`;
}

export function platformCardGrid(cards) {
  return `<div class="platform-product-grid">${cards
    .map(
      (c) => `<article class="platform-product-card">
            <div class="platform-product-card-icon"><i class="fa-solid ${c.icon}"></i></div>
            <h3>${c.title}</h3>
            <p>${c.body}</p>
            ${c.href ? `<a href="${c.href}" class="platform-product-card-link">Learn more <i class="fa-solid fa-arrow-right"></i></a>` : ''}
        </article>`
    )
    .join('\n        ')}</div>`;
}

export function platformFlow(steps, { title = '' } = {}) {
  const rows = steps
    .map(
      (s, i) => `<div class="platform-flow-step">
            <span class="platform-flow-label">${s.label}</span>
            <p>${s.text}</p>
        </div>${i < steps.length - 1 ? '<div class="platform-flow-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></div>' : ''}`
    )
    .join('\n        ');
  return `${title ? `<h3 class="platform-flow-title">${title}</h3>` : ''}<div class="platform-flow platform-flow-vertical">${rows}</div>`;
}

export function platformBulletGrid(items) {
  return `<ul class="platform-feature-list">${items
    .map((t) => `<li><i class="fa-solid fa-check"></i> ${t}</li>`)
    .join('')}</ul>`;
}

const PROCESS_STEP_ICONS = {
  Upload: 'fa-cloud-arrow-up',
  Connect: 'fa-link',
  Organize: 'fa-folder-tree',
  Deploy: 'fa-rocket',
};

export function platformNumberedSteps(steps) {
  return `<div class="platform-process-grid">${steps
    .map((s) => {
      const icon = s.icon || PROCESS_STEP_ICONS[s.title] || 'fa-circle-check';
      const bodyHtml = s.list
        ? `<ul class="platform-process-tags">${s.list.map((x) => `<li>${x}</li>`).join('')}</ul>`
        : s.body
          ? `<p class="platform-process-desc">${s.body}</p>`
          : '';
      return `<article class="platform-process-card">
            <div class="platform-process-card-top">
                <span class="platform-process-num">${s.num}</span>
                <div class="platform-process-icon"><i class="fa-solid ${icon}"></i></div>
            </div>
            <h4>${s.title}</h4>
            ${bodyHtml}
        </article>`;
    })
    .join('\n        ')}</div>`;
}

export function platformCategoryGrid(categories) {
  return `<div class="platform-category-grid">${categories
    .map(
      (c) => `<div class="platform-category-card">
            <h4>${c.title}</h4>
            <ul>${c.items.map((i) => `<li>${i}</li>`).join('')}</ul>
        </div>`
    )
    .join('')}</div>`;
}

export function btnPrimary(label, onclick = 'launchWizard()') {
  return `<button class="btn btn-glow" type="button" onclick="${onclick}"><i class="fa-solid fa-rocket"></i> ${label}</button>`;
}

export function btnOutlineLink(href, label) {
  return `<a href="${href}" class="btn btn-outline">${label}</a>`;
}
