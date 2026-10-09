/**
 * Marketing subpage body fragments (Gate 1 Wave 1).
 * Structure: hero → intro → detail → pricing (pricing page: hero → intro → detail grid only).
 */

import { renderFaqSection } from './marketing-faq-section.js';
import {
  marketingHero,
  marketingIntro,
  marketingDetail,
  marketingPricingSection,
} from './marketing-page-blocks.js';
import { collectMarketingNavPaths, pathFromOutPath, normalizeNavPath } from './marketing-nav.js';
import { buildMarketingStubPages } from './marketing-stub-pages.js';
import { PLATFORM_PRODUCT_PAGES } from './marketing-platform-pages.js';

const MARKETING_CORE_PAGES = [
  ...PLATFORM_PRODUCT_PAGES,
  {
    outPath: 'solutions/index.html',
    title: 'Solutions · ZiricAI',
    description: 'Industry packs and solutions — automotive, and more AI workforce templates.',
    depth: 1,
    activePath: '/solutions/',
    includePricing: true,
    includeLanding: false,
    bodyHtml: `${marketingHero({
      eyebrow: 'Solutions',
      title: 'Built for your industry',
      lead: 'Pre-configured AI Employees, workflows, and knowledge templates — go live in minutes.',
    })}
${marketingIntro({
  title: 'Industry packs, not generic chatbots',
  body: 'Each pack ships with Sarah tuned for your vertical — inventory, booking flows, and compliance-aware replies out of the box.',
})}
${marketingDetail(`
        <div class="section-header marketing-detail-header">
            <span class="section-eyebrow">Packs</span>
            <h2>Start with a template</h2>
        </div>
        <div class="platform-channel-grid marketing-channel-grid">
            <a class="platform-channel-card" href="/solutions/automotive/"><i class="fa-solid fa-car"></i><h4>Automotive</h4><p>Dealers, stock, and test drives.</p><span class="platform-channel-link">Car Dealer Pack <i class="fa-solid fa-arrow-right"></i></span></a>
            <a class="platform-channel-card" href="/solutions/construction/"><i class="fa-solid fa-hard-hat"></i><h4>Construction</h4><p>Site enquiries and quotes.</p><span class="platform-channel-link">Explore <i class="fa-solid fa-arrow-right"></i></span></a>
            <a class="platform-channel-card" href="/solutions/healthcare/"><i class="fa-solid fa-heart-pulse"></i><h4>Healthcare</h4><p>Appointments and patient FAQs.</p><span class="platform-channel-link">Explore <i class="fa-solid fa-arrow-right"></i></span></a>
            <a class="platform-channel-card" href="/solutions/education/"><i class="fa-solid fa-graduation-cap"></i><h4>Education</h4><p>Admissions and parent comms.</p><span class="platform-channel-link">Explore <i class="fa-solid fa-arrow-right"></i></span></a>
            <a class="platform-channel-card platform-channel-card-muted" href="/ai-employees/industries/"><i class="fa-solid fa-building"></i><h4>All industries</h4><p>50+ templates on the marketplace.</p><span class="platform-channel-link">Browse <i class="fa-solid fa-arrow-right"></i></span></a>
        </div>`, { alt: true })}
${marketingPricingSection()}`,
  },
  {
    outPath: 'resources/faq/index.html',
    title: 'FAQ · ZiricAI',
    description: 'Frequently asked questions about setup, channels, security, billing, and trials.',
    depth: 2,
    activePath: '/resources/faq/',
    includePricing: true,
    includeLanding: true,
    bodyHtml: `${marketingHero({
      eyebrow: 'FAQ',
      title: "Got questions? We've got answers.",
      lead: 'Everything you need to know about setup, channels, security, and pricing — or ask Sarah anytime.',
    })}
${marketingIntro({
  title: 'Browse by topic',
  body: 'Filter common questions below. For anything specific to your business, open the Sarah chat — no signup required.',
})}
${renderFaqSection('../../')}
${marketingPricingSection()}`,
  },
  {
    outPath: 'pricing/index.html',
    title: 'Pricing · ZiricAI',
    description: 'Simple, scalable pricing for your AI workforce — 14-day free trial, canonical plans from ZiricAI billing.',
    depth: 1,
    activePath: '/pricing/',
    includePricing: true,
    includeLanding: false,
    bodyHtml: `${marketingHero({
      eyebrow: 'Pricing',
      title: 'Simple, scalable pricing',
      lead: 'Every plan includes setup, AI training, and access to future platform updates.',
    })}
${marketingIntro({
  title: 'Channels first, workforce when you are ready',
  body: 'Every tier includes Sarah, CRM, knowledge, and automation. Upgrade when you need more customer channels, workspaces, or AI Employees — not before.',
})}
<section class="section section-alt marketing-page-block-detail marketing-pricing-detail" id="pricing">
    <div class="container">
        <div class="pricing-grid marketing-pricing-grid" aria-live="polite" aria-busy="true"></div>
        <p class="pricing-note">14-day free trial on all plans. No credit card required.</p>
        <p class="marketing-page-back"><a href="/"><i class="fa-solid fa-arrow-left"></i> Back to home</a></p>
    </div>
</section>`,
  },
  {
    outPath: 'solutions/automotive/index.html',
    title: 'Automotive · ZiricAI Solutions',
    description: 'AI for car dealers — stock enquiries, financing, test drives, and trade-ins on WhatsApp and webchat.',
    depth: 2,
    activePath: '/solutions/automotive/',
    includePricing: true,
    includeLanding: false,
    bodyHtml: `${marketingHero({
      eyebrow: 'Car Dealer Pack',
      title: 'AI for automotive dealers',
      lead: 'Close deals at midnight. Answer stock enquiries instantly. Book test drives while your sales team sleeps.',
      actions: `<button class="btn btn-glow btn-lg" type="button" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Start Free Trial</button>
            <a href="/platform/whatsapp/" class="btn btn-ghost btn-lg"><i class="fa-brands fa-whatsapp"></i> Sarah on WhatsApp</a>`,
    })}
${marketingIntro({
  title: 'Dealer workflows out of the box',
  body: 'Inventory queries, financing quotes, test drive booking, and trade-in valuations — automated and logged to your portal.',
})}
${marketingDetail(`
        <div class="section-header marketing-detail-header">
            <h2>Built for car dealers</h2>
            <p>Pre-trained flows your front desk and BDC teams can trust from day one.</p>
        </div>
        <div class="industry-features-grid">
            <div class="agent-card"><div class="agent-avatar">🚗</div><h4>Stock enquiries</h4><p>Instant answers from your live inventory</p></div>
            <div class="agent-card"><div class="agent-avatar">💰</div><h4>Financing quotes</h4><p>Send quotes before they ask twice</p></div>
            <div class="agent-card"><div class="agent-avatar">📅</div><h4>Test drive booking</h4><p>Calendar sync, confirmations, reminders</p></div>
            <div class="agent-card"><div class="agent-avatar">🔄</div><h4>Trade-in valuations</h4><p>Capture details and route to appraisers</p></div>
        </div>
        <p class="marketing-detail-cta"><a href="/#case-studies" class="btn">See Central Motors case study</a></p>`, { alt: true })}
${marketingPricingSection()}`,
  },
];

const CUSTOM_PAGE_PATHS = new Set(
  MARKETING_CORE_PAGES.map((p) => pathFromOutPath(p.outPath))
);

export const MARKETING_WEB_PAGES = [
  ...MARKETING_CORE_PAGES,
  ...buildMarketingStubPages(collectMarketingNavPaths(), CUSTOM_PAGE_PATHS),
];
