/**
 * Resources — guides, FAQ, documentation, security.
 */

import { renderFaqSection } from './marketing-faq-section.js';
import {
  wfPage,
  productHero,
  platformIntro,
  platformDetail,
  platformSectionHeader,
  mktFinalCta,
  btnPrimary,
  marketingPricingSection,
  wfGuideGrid,
  wfDocNav,
  resourcesSarahCta,
  platformBulletGrid,
} from './marketing-workforce-blocks.js';

const P = '../../';

export const RESOURCE_PAGES = [
  wfPage({
    outPath: 'resources/guides/index.html',
    title: 'Guides',
    description: 'Practical guides for adopting AI Employees, automation and AI-powered operations.',
    depth: 2,
    activePath: '/resources/guides/',
    includeLanding: true,
    bodyHtml: `${productHero({
      eyebrow: 'ZIRICAI GUIDES',
      title: 'Learn how to build your AI workforce.',
      lead: 'Practical guides for businesses adopting AI Employees, automation and AI-powered operations.',
      theme: 'resources',
      assetPrefix: P,
    })}
${platformDetail(`
        ${platformSectionHeader({ eyebrow: 'Featured', title: 'Start here' })}
        ${wfGuideGrid([
          { title: 'What Is an AI Employee?', body: 'Understand how AI Employees differ from traditional conversational tools and what a digital workforce means for your business.' },
          { title: 'How to Hire Your First AI Employee', body: 'A practical guide to choosing the right role and getting started.' },
          { title: 'AI Employees vs Chatbots', body: 'Understand the difference between conversational AI and a digital workforce.' },
          { title: 'How to Train an AI Employee', body: "Learn how business knowledge, documents and processes become part of an AI Employee's capabilities." },
          { title: 'How to Automate Customer Service', body: 'Discover which customer service workflows can be automated.' },
          { title: 'How to Build an AI Sales Team', body: 'Learn how AI can qualify leads, answer questions and support sales teams.' },
        ])}`, { alt: true })}
${resourcesSarahCta()}
${marketingPricingSection()}`,
  }),

  wfPage({
    outPath: 'resources/faq/index.html',
    title: 'FAQ',
    description: 'Frequently asked questions about AI Employees, setup, integrations, security, billing and getting started.',
    depth: 2,
    activePath: '/resources/faq/',
    includeLanding: true,
    bodyHtml: `${productHero({
      eyebrow: 'FREQUENTLY ASKED QUESTIONS',
      title: 'Questions about ZiricAI? Start here.',
      lead: 'Everything you need to know about AI Employees, setup, integrations, security, pricing and getting started.',
      theme: 'resources',
      assetPrefix: P,
    })}
${platformIntro({
  icon: 'fa-circle-question',
  title: 'Browse by topic',
  body: `<p><strong>Getting Started</strong> — What is ZiricAI? What is an AI Employee? How quickly can I deploy one?</p>
        <p><strong>AI Employees</strong> — How do they work? Can I customize an employee? Can I have multiple AI Employees?</p>
        <p><strong>Platform</strong> — What is the AI Business OS? What is Mission Control? What is the Knowledge Base?</p>
        <p><strong>Channels</strong> — WhatsApp, Webchat and other supported channels.</p>
        <p><strong>Security & Billing</strong> — Data protection, isolation, trials and pricing.</p>`,
})}
${renderFaqSection('../../')}
${resourcesSarahCta()}
${marketingPricingSection()}`,
  }),

  wfPage({
    outPath: 'resources/documentation/index.html',
    title: 'Documentation',
    description: 'Technical documentation for AI Employees, integrations, workflows and the ZiricAI platform.',
    depth: 2,
    activePath: '/resources/documentation/',
    bodyHtml: `${productHero({
      eyebrow: 'ZIRICAI DOCUMENTATION',
      title: 'Everything you need to build with ZiricAI.',
      lead: 'Technical documentation for setting up your organization, configuring AI Employees, connecting integrations and building workflows.',
      theme: 'resources',
      assetPrefix: P,
    })}
${platformDetail(`
        ${wfDocNav([
          { title: 'Getting Started', items: ['Create your organization', 'Set up your account', 'Invite team members', 'Deploy your first AI Employee'] },
          { title: 'AI Employees', items: ['Employee configuration', 'Roles and responsibilities', 'Knowledge configuration', 'Permissions', 'Channels'] },
          { title: 'Knowledge Base', items: ['Uploading documents', 'Website indexing', 'Knowledge management', 'Training'] },
          { title: 'CRM', items: ['Contacts', 'Leads', 'Conversations', 'Customer records'] },
          { title: 'Automation', items: ['Workflows', 'Triggers', 'Actions', 'Conditions', 'Notifications'] },
          { title: 'Integrations', items: ['WhatsApp', 'Webchat', 'CRM', 'Calendars', 'Payments', 'APIs'] },
          { title: 'API', items: ['Authentication', 'Endpoints', 'Webhooks', 'Events', 'Examples'] },
        ])}
        <p class="platform-section-sub" style="text-align:center;margin-top:24px;">Full developer documentation is expanding — use the Company Portal and Sarah for setup guidance today.</p>`, { alt: true })}
${resourcesSarahCta()}
${marketingPricingSection()}`,
  }),

  wfPage({
    outPath: 'resources/security/index.html',
    title: 'Security & Trust',
    description: 'How ZiricAI protects business data, access control, knowledge and integrations.',
    depth: 2,
    activePath: '/resources/security/',
    bodyHtml: `${productHero({
      eyebrow: 'SECURITY & TRUST',
      title: 'Your business data belongs to your business.',
      lead: 'ZiricAI is designed to help organizations deploy AI while maintaining control over their business information, access and digital workforce.',
      theme: 'resources',
      assetPrefix: P,
    })}
${platformDetail(`
        ${platformSectionHeader({ title: 'Security built into the platform.' })}
        ${platformBulletGrid([
          '<strong>Data Isolation</strong> — Each organization\'s environment is logically separated.',
          '<strong>Access Control</strong> — Control who can access information, AI Employees and capabilities.',
          '<strong>Knowledge Control</strong> — Decide what information AI Employees can use and where it comes from.',
          '<strong>Integration Security</strong> — Connected systems accessible only per your permissions and configuration.',
          '<strong>Monitoring</strong> — Monitor AI workforce activity and operations through the platform.',
        ])}`, { alt: true })}
${platformIntro({
  icon: 'fa-shield-halved',
  title: 'Built with privacy in mind.',
  body: '<p>ZiricAI is designed around responsible handling of business and customer information, with privacy and regulatory requirements considered throughout the platform.</p><p><a href="/privacy/">Privacy Policy</a> · <a href="/privacy/#terms">Terms of Service</a></p>',
})}
${resourcesSarahCta()}
${marketingPricingSection()}`,
  }),
];
