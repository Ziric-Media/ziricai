/** Shared HTML blocks for Platform product pages. */

export function mktActions(html) {
  return html ? `<div class="hero-actions marketing-hero-actions">${html}</div>` : '';
}

export function mktFinalCta({ title, body, primaryHtml, secondaryHtml = '' }) {
  return `<section class="section section-alt marketing-final-cta">
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

export function platformNumberedSteps(steps) {
  return `<ol class="platform-numbered-steps">${steps
    .map(
      (s) => `<li>
            <span class="platform-step-num">${s.num}</span>
            <div><h4>${s.title}</h4>${s.body ? `<p>${s.body}</p>` : ''}${s.list ? `<ul>${s.list.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</div>
        </li>`
    )
    .join('')}</ol>`;
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
