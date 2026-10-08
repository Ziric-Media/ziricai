/** Reusable marketing subpage sections (hero → intro → detail → pricing). */

export function marketingPricingSection() {
  return `<section class="section section-alt marketing-page-pricing" id="page-pricing">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">Pricing</span>
            <h2>Simple, scalable pricing</h2>
            <p>Every plan includes setup, AI training, and access to future platform updates.</p>
        </div>
        <div class="pricing-grid marketing-pricing-grid" aria-live="polite" aria-busy="true"></div>
        <p class="pricing-note">14-day free trial on all plans. No credit card required.</p>
    </div>
</section>`;
}

export function marketingHero({ eyebrow, title, lead, actions = '' }) {
  return `<section class="section marketing-page-hero marketing-page-block-hero">
    <div class="container">
        <span class="section-eyebrow">${eyebrow}</span>
        <h1>${title}</h1>
        ${lead ? `<p class="intro-lead">${lead}</p>` : ''}
        ${actions ? `<div class="hero-actions marketing-hero-actions">${actions}</div>` : ''}
    </div>
</section>`;
}

export function marketingIntro({ title, body }) {
  return `<section class="section section-alt marketing-page-block-intro">
    <div class="container marketing-page-intro-inner">
        ${title ? `<h2>${title}</h2>` : ''}
        ${body ? `<p>${body}</p>` : ''}
    </div>
</section>`;
}

export function marketingDetail(innerHtml, { alt = false } = {}) {
  const altClass = alt ? ' section-alt' : '';
  return `<section class="section marketing-page-block-detail${altClass}">
    <div class="container">
${innerHtml}
    </div>
</section>`;
}
