/**
 * Marketing subpage registry — platform, workforce, solutions, industries, resources.
 */

import {
  marketingHero,
  marketingIntro,
  marketingPricingSection,
} from './marketing-page-blocks.js';
import { collectMarketingNavPaths, pathFromOutPath, normalizeNavPath } from './marketing-nav.js';
import { buildMarketingStubPages } from './marketing-stub-pages.js';
import { PLATFORM_PRODUCT_PAGES } from './marketing-platform-pages.js';
import { AI_EMPLOYEE_PAGES } from './marketing-ai-employees-pages.js';
import { SOLUTION_PAGES } from './marketing-solutions-pages.js';
import { INDUSTRY_PAGES } from './marketing-industries-pages.js';
import { RESOURCE_PAGES } from './marketing-resources-pages.js';

const MARKETING_CORE_PAGES = [
  ...PLATFORM_PRODUCT_PAGES,
  ...AI_EMPLOYEE_PAGES,
  ...SOLUTION_PAGES,
  ...INDUSTRY_PAGES,
  ...RESOURCE_PAGES,
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
];

const CUSTOM_PAGE_PATHS = new Set(
  MARKETING_CORE_PAGES.map((p) => pathFromOutPath(p.outPath))
);

export const MARKETING_WEB_PAGES = [
  ...MARKETING_CORE_PAGES,
  ...buildMarketingStubPages(collectMarketingNavPaths(), CUSTOM_PAGE_PATHS),
];
