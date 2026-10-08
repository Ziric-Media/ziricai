/**
 * Placeholder marketing pages (hero → intro → detail → pricing) for nav IA leaves.
 */

import {
  marketingHero,
  marketingIntro,
  marketingDetail,
  marketingPricingSection,
} from './marketing-page-blocks.js';
import { outPathFromHref, depthFromOutPath, normalizeNavPath } from './marketing-nav.js';

export function buildStubPageConfig({ href, title, description, eyebrow, headline, lead, introTitle, introBody, detailHtml }) {
  const outPath = outPathFromHref(normalizeNavPath(href));
  if (outPath === 'index.html') return null;

  const detail =
    detailHtml ||
    `<div class="section-header marketing-detail-header">
            <h2>More coming soon</h2>
            <p>We are expanding this section with full product detail. Sarah already covers the basics on WhatsApp — explore pricing below or <a href="/">return home</a>.</p>
        </div>
        <p class="marketing-detail-cta"><a href="/" class="btn btn-outline"><i class="fa-solid fa-house"></i> Back to Home</a></p>`;

  return {
    outPath,
    title: `${title} · ZiricAI`,
    description,
    depth: depthFromOutPath(outPath),
    activePath: normalizeNavPath(href),
    includePricing: true,
    includeLanding: false,
    bodyHtml: `${marketingHero({ eyebrow, title: headline, lead })}
${marketingIntro({ title: introTitle, body: introBody })}
${marketingDetail(detail, { alt: true })}
${marketingPricingSection()}`,
  };
}

/** Stub configs keyed by href — override defaults per section. */
const STUB_COPY = {
  '/platform/email/': {
    title: 'Email',
    eyebrow: 'Platform',
    headline: 'Sarah on email',
    lead: 'Triage, reply, and route customer email with the same CRM and knowledge as WhatsApp.',
    introTitle: 'Inbox without the chaos',
    introBody: 'Professional and Business plans include email alongside messaging channels.',
  },
  '/platform/messenger/': {
    title: 'Messenger',
    eyebrow: 'Platform',
    headline: 'Facebook Messenger',
    lead: 'Meet customers on Messenger with Sarah — unified with WhatsApp in one portal.',
    introTitle: 'Social enquiries, one workforce',
    introBody: 'Available from Professional upward alongside WhatsApp and email.',
  },
  '/platform/instagram/': {
    title: 'Instagram',
    eyebrow: 'Platform',
    headline: 'Instagram DMs',
    lead: 'Answer Instagram enquiries and DMs without a separate bot.',
    introTitle: 'Business channel',
    introBody: 'Included on Business plans with WhatsApp, Messenger, email, and webchat.',
  },
  '/ai-employees/how-it-works/': {
    title: 'How AI Employees Work',
    eyebrow: 'AI Employees',
    headline: 'How AI Employees work',
    lead: 'Start with Sarah. Add specialised AI Employees when you are ready — same portal, same knowledge.',
    introTitle: 'One face, many roles',
    introBody: 'Sarah is your front door; additional employees handle sales, support, HR, and more behind the scenes.',
    detailHtml: `<div class="section-header marketing-detail-header"><h2>See it on the homepage</h2><p>Watch the workforce journey and catalog on <a href="/#workforce-journey">Home → AI Employees</a>.</p></div>
        <p class="marketing-detail-cta"><a href="/#ai-employees" class="btn">Meet Sarah on Home</a></p>`,
  },
  '/ai-employees/marketplace/': {
    title: 'AI Employee Marketplace',
    eyebrow: 'AI Employees',
    headline: 'AI Employee Marketplace',
    lead: 'Browse roles by department — hire pre-trained AI Employees for your industry.',
    introTitle: 'Marketplace packs',
    introBody: 'Install packs from the Company Portal or start with Sarah and expand over time.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/#ai-employees-catalog" class="btn">Browse catalog on Home</a></p>`,
  },
  '/ai-employees/industries/': {
    title: 'Industries',
    eyebrow: 'AI Employees',
    headline: 'AI Employees by industry',
    lead: '50+ industry templates — automotive, retail, healthcare, education, and more.',
    introTitle: 'Templates that ship ready',
    introBody: 'Each industry pack includes workflows, knowledge starters, and Sarah tuned for your vertical.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/#industries" class="btn">See industries on Home</a> <a href="/solutions/" class="btn btn-outline">Solution packs</a></p>`,
  },
  '/products/crm/': {
    title: 'CRM',
    eyebrow: 'Products',
    headline: 'CRM built for conversations',
    lead: 'Every WhatsApp, email, and webchat thread syncs to contacts, deals, and history automatically.',
    introTitle: 'No duplicate data entry',
    introBody: 'Sarah updates CRM fields as she qualifies leads and books appointments.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/#product-tour" class="btn">See CRM in the tour</a></p>`,
  },
  '/products/automation/': {
    title: 'Automation',
    eyebrow: 'Products',
    headline: 'Automation',
    lead: 'Triggers, workflows, and handoffs when Sarah completes a step.',
    introTitle: 'From reply to action',
    introBody: 'Connect notifications, bookings, and internal alerts without code.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/#automation" class="btn">Automation on Home</a></p>`,
  },
  '/products/knowledge/': {
    title: 'Knowledge',
    eyebrow: 'Products',
    headline: 'Knowledge Base',
    lead: 'Stock, policies, FAQs, and docs — Sarah answers from live knowledge, not guesses.',
    introTitle: 'Always current',
    introBody: 'Upload once; Sarah and every AI Employee pull from the same source of truth.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/#knowledge" class="btn">Knowledge on Home</a></p>`,
  },
  '/products/analytics/': {
    title: 'Analytics',
    eyebrow: 'Products',
    headline: 'Analytics',
    lead: 'Conversation volume, channel mix, and outcomes — from Starter analytics to Business advanced.',
    introTitle: 'Measure what matters',
    introBody: 'See which channels drive bookings and where Sarah hands off to your team.',
  },
  '/products/dashboards/': {
    title: 'Dashboards',
    eyebrow: 'Products',
    headline: 'Dashboards',
    lead: 'Operator dashboards in the Company Portal; Mission Control for enterprise-wide visibility.',
    introTitle: 'One pane of glass',
    introBody: 'Dashboards tie conversations, CRM, and automation into actionable views.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/#mission-control" class="btn">Mission Control preview</a></p>`,
  },
  '/solutions/construction/': {
    title: 'Construction',
    eyebrow: 'Solutions',
    headline: 'AI for construction',
    lead: 'Quotes, site enquiries, and subcontractor coordination on WhatsApp.',
    introTitle: 'Construction pack',
    introBody: 'Industry workflows and knowledge templates — details expanding in this hub.',
  },
  '/solutions/mining/': {
    title: 'Mining',
    eyebrow: 'Solutions',
    headline: 'AI for mining & resources',
    lead: 'Safety, logistics, and supplier enquiries handled 24/7.',
    introTitle: 'Mining pack',
    introBody: 'Built for high-compliance, high-volume messaging environments.',
  },
  '/solutions/retail/': {
    title: 'Retail',
    eyebrow: 'Solutions',
    headline: 'AI for retail',
    lead: 'Stock checks, orders, and store hours across WhatsApp and webchat.',
    introTitle: 'Retail pack',
    introBody: 'Connect catalog knowledge and promotions to every customer message.',
  },
  '/solutions/professional-services/': {
    title: 'Professional Services',
    eyebrow: 'Solutions',
    headline: 'AI for professional services',
    lead: 'Intake, scheduling, and client FAQs without adding headcount.',
    introTitle: 'Professional services pack',
    introBody: 'Ideal for firms that live in email and WhatsApp.',
  },
  '/solutions/healthcare/': {
    title: 'Healthcare',
    eyebrow: 'Solutions',
    headline: 'AI for healthcare',
    lead: 'Appointments, reminders, and patient FAQs with POPIA-aware consent flows.',
    introTitle: 'Healthcare pack',
    introBody: 'See also industry pages on Home for clinics and practices.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/industry-healthcare.html" class="btn btn-outline">Healthcare industry page</a></p>`,
  },
  '/solutions/education/': {
    title: 'Education',
    eyebrow: 'Solutions',
    headline: 'AI for education',
    lead: 'Admissions, timetables, and parent enquiries on messaging channels.',
    introTitle: 'Education pack',
    introBody: 'Schools and training providers — templates aligned to term cycles.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/industry-schools.html" class="btn btn-outline">Schools industry page</a></p>`,
  },
  '/resources/guides/': {
    title: 'Guides',
    eyebrow: 'Resources',
    headline: 'Guides',
    lead: 'Setup, channels, and getting the most from Sarah — guides publishing here.',
    introTitle: 'Learn ZiricAI',
    introBody: 'Start with the FAQ and product tour while we expand written guides.',
    detailHtml: `<p class="marketing-detail-cta"><a href="/resources/faq/" class="btn">Read FAQ</a></p>`,
  },
  '/resources/ai-resources/': {
    title: 'AI Resources',
    eyebrow: 'Resources',
    headline: 'AI Resources',
    lead: 'Articles, prompts, and best practices for running an AI workforce.',
    introTitle: 'For operators and owners',
    introBody: 'Curated resources for teams adopting Sarah and additional AI Employees.',
  },
};

export function buildMarketingStubPages(hrefs, skipHrefs = new Set()) {
  return hrefs
    .filter((h) => h !== '/' && !skipHrefs.has(normalizeNavPath(h)))
    .map((href) => {
      const key = normalizeNavPath(href);
      const copy = STUB_COPY[key] || {};
      const label = copy.title || key.split('/').filter(Boolean).pop().replace(/-/g, ' ');
      const title = copy.title || label.replace(/\b\w/g, (c) => c.toUpperCase());
      return buildStubPageConfig({
        href: key,
        title,
        description: copy.lead || `${title} — ZiricAI marketing.`,
        eyebrow: copy.eyebrow || 'ZiricAI',
        headline: copy.headline || title,
        lead: copy.lead || `Learn how ZiricAI helps with ${title.toLowerCase()}.`,
        introTitle: copy.introTitle || 'Overview',
        introBody: copy.introBody || 'Full page content is on the roadmap — pricing and Sarah chat are live today.',
        detailHtml: copy.detailHtml,
      });
    })
    .filter(Boolean);
}
