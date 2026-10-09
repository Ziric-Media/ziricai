/**
 * Solutions — business problem landing pages.
 */

import {
  wfPage,
  productHero,
  platformIntro,
  platformDetail,
  platformSectionHeader,
  mktFinalCta,
  btnPrimary,
  btnOutlineLink,
  marketingPricingSection,
  wfSolutionCards,
  wfFlowVertical,
  wfStagePipeline,
  platformBulletGrid,
  platformCardGrid,
} from './marketing-workforce-blocks.js';

const P = '../../';

function solutionPage({ slug, title, eyebrow, heroTitle, heroLead, intro, sections, finalCta }) {
  return wfPage({
    outPath: slug ? `solutions/${slug}/index.html` : 'solutions/index.html',
    title,
    description: heroLead.slice(0, 158),
    depth: slug ? 2 : 1,
    activePath: slug ? `/solutions/${slug}/` : '/solutions/',
    bodyHtml: `${productHero({
      eyebrow,
      title: heroTitle,
      lead: heroLead,
      actions: finalCta?.actions || `${btnPrimary('Get Started')} ${btnOutlineLink('/ai-employees/marketplace/', 'Hire an AI Employee')}`,
      theme: 'solutions',
      assetPrefix: slug ? P : '../',
    })}
${intro ? platformIntro(intro) : ''}
${sections.join('\n')}
${mktFinalCta(finalCta?.block || { title: 'Build your workforce', primaryHtml: btnPrimary('Start Free') })}
${marketingPricingSection()}`,
  });
}

export const SOLUTION_PAGES = [
  solutionPage({
    title: 'Solutions',
    eyebrow: 'SOLUTIONS',
    heroTitle: 'AI Employees built around the way your business works.',
    heroLead: 'Whether you want to respond to customers faster, generate more sales, automate operations or deploy an AI workforce across your organization, ZiricAI gives you the people, platform and tools to make it happen.',
    finalCta: {
      actions: `${btnPrimary('Explore Solutions')} ${btnOutlineLink('/ai-employees/marketplace/', 'Hire an AI Employee')}`,
      block: { title: 'Start with the problem. Build the workforce around it.', primaryHtml: btnPrimary('Start Free') },
    },
    intro: {
      icon: 'fa-compass',
      title: 'Start with the problem. Build the workforce around it.',
      body: '<p>Instead of asking businesses to figure out how to use AI, ZiricAI starts with the work that needs to be done.</p>',
    },
    sections: [
      platformDetail(
        wfSolutionCards([
          { title: 'Customer Service', body: 'Answer more customers. Resolve more requests.', href: '/solutions/customer-service/', linkLabel: 'Explore Customer Service' },
          { title: 'Sales', body: 'Turn more conversations into opportunities.', href: '/solutions/sales/', linkLabel: 'Explore Sales' },
          { title: 'Operations', body: 'Automate the work behind the scenes.', href: '/solutions/operations/', linkLabel: 'Explore Operations' },
          { title: 'Enterprise', body: 'Deploy AI across the organization.', href: '/solutions/enterprise/', linkLabel: 'Explore Enterprise' },
          { title: 'Small Business', body: 'Get the team you need without the overhead.', href: '/solutions/small-business/', linkLabel: 'Explore Small Business' },
          { title: 'Growing Business', body: 'Scale your workforce as you scale your business.', href: '/solutions/growing-business/', linkLabel: 'Explore Growing Business' },
        ]),
        { alt: true }
      ),
    ],
  }),

  solutionPage({
    slug: 'customer-service',
    title: 'Customer Service',
    eyebrow: 'CUSTOMER SERVICE SOLUTION',
    heroTitle: 'Give every customer an answer. Even when your team is offline.',
    heroLead: 'ZiricAI gives your business AI Employees that handle customer enquiries across WhatsApp, webchat and other connected channels — while keeping your human team in control when conversations need escalation.',
    finalCta: {
      actions: btnPrimary('Improve Customer Service'),
      block: { title: 'Turn customer service into a competitive advantage.', primaryHtml: btnPrimary('Hire Customer Support AI') },
    },
    intro: {
      icon: 'fa-headset',
      title: "Your customers don't work 9 to 5.",
      body: `<p>Customers ask questions after hours. They want order updates, product information, appointments and help with returns.</p>
            <p>Every unanswered message is an opportunity to lose a customer.</p>`,
    },
    sections: [
      platformDetail(`
        ${platformSectionHeader({ title: 'Put an AI Employee on the front line.' })}
        ${platformBulletGrid([
          'Answer FAQs',
          'Handle WhatsApp enquiries',
          'Respond on your website',
          'Track customer requests',
          'Answer product questions',
          'Capture customer details',
          'Create CRM records',
          'Handle routine support',
          'Escalate complex cases',
          'Follow up automatically',
        ])}`, { alt: true }),
      platformDetail(`
        ${platformSectionHeader({ eyebrow: 'Example', title: 'Order status in seconds' })}
        ${wfFlowVertical([
          'Customer: "Hi, where is my order?"',
          'AI Employee — Identifies the customer',
          'Connected system — Retrieves order information',
          'AI Employee — Provides the current status',
          'Customer — Gets an answer immediately',
        ])}`),
    ],
  }),

  solutionPage({
    slug: 'sales',
    title: 'Sales',
    eyebrow: 'SALES SOLUTION',
    heroTitle: 'Your sales team should sell. Let AI handle the conversations around selling.',
    heroLead: 'ZiricAI AI Employees engage prospects, qualify leads, answer questions, follow up and move opportunities into your sales pipeline.',
    finalCta: {
      block: { title: 'Your AI sales team never has to sleep.', body: 'While your human salespeople focus on relationships, negotiation and closing, AI can handle the repetitive conversations that happen before and between those moments.', primaryHtml: btnPrimary('Build Your Sales Workforce') },
    },
    sections: [
      platformDetail(`
        ${platformSectionHeader({ title: 'Every enquiry is a potential customer.' })}
        ${platformCardGrid([
          { icon: 'fa-bullseye', title: 'Capture', body: 'Identify potential buyers.' },
          { icon: 'fa-filter', title: 'Qualify', body: 'Ask the right questions.' },
          { icon: 'fa-book-open', title: 'Educate', body: 'Answer product and service questions.' },
          { icon: 'fa-clock', title: 'Follow up', body: 'Keep prospects engaged.' },
          { icon: 'fa-calendar-check', title: 'Book', body: 'Schedule meetings, demos and appointments.' },
          { icon: 'fa-user-group', title: 'Handoff', body: 'Send qualified opportunities to your sales team.' },
        ])}`, { alt: true }),
    ],
  }),

  solutionPage({
    slug: 'operations',
    title: 'Operations',
    eyebrow: 'OPERATIONS SOLUTION',
    heroTitle: 'Connect conversations to work.',
    heroLead: 'ZiricAI transforms customer and employee requests into automated business workflows — connecting AI Employees to your CRM, calendars, knowledge, payments and other systems.',
    finalCta: {
      block: { title: "AI that doesn't just talk — it works.", primaryHtml: btnOutlineLink('/products/automation/', 'Explore Automation') },
    },
    sections: [
      platformDetail(`
        ${platformSectionHeader({ title: 'Stop moving information from one system to another.' })}
        <p class="platform-section-sub" style="text-align:center;max-width:640px;margin:0 auto 24px;">A customer asks. AI understands. A workflow starts. The right system is updated. The right person is notified. The customer gets a response.</p>
        ${wfFlowVertical([
          'Customer enquiry',
          'AI Employee',
          'CRM',
          'Calendar',
          'Booking',
          'Payment',
          'Notification',
          'Completed workflow',
        ])}`, { alt: true }),
      platformDetail(`
        ${platformSectionHeader({ title: 'What you can automate' })}
        ${platformBulletGrid([
          'Appointment scheduling',
          'Lead creation',
          'Customer onboarding',
          'Notifications',
          'Follow-ups',
          'Internal requests',
          'Document collection',
          'Booking workflows',
          'Payment workflows',
          'Escalations',
        ])}`),
    ],
  }),

  solutionPage({
    slug: 'enterprise',
    title: 'Enterprise',
    eyebrow: 'ENTERPRISE AI',
    heroTitle: 'Build an AI workforce for your entire organization.',
    heroLead: 'Deploy, manage and coordinate AI Employees across departments, locations, channels and business systems from one centralized platform.',
    finalCta: {
      block: { title: 'Give every department access to an AI workforce.', primaryHtml: btnPrimary('Talk to Sales') },
    },
    sections: [
      platformDetail(`
        ${platformSectionHeader({ title: 'One AI Employee is useful. An AI workforce is transformational.' })}
        <div class="wf-enterprise-cols">
            <div><h4>Departments</h4><ul><li>Administration</li><li>Sales</li><li>Customer Support</li><li>HR</li><li>Finance</li><li>Legal</li><li>Healthcare</li><li>Operations</li></ul></div>
            <div><h4>Channels</h4><ul><li>WhatsApp</li><li>Webchat</li><li>Email</li><li>Social</li><li>Internal platforms</li><li>Connected applications</li></ul></div>
        </div>
        ${platformCardGrid([
          { icon: 'fa-users-gear', title: 'Workforce Management', body: 'Manage AI Employees across your organization.', href: '/products/dashboards/' },
          { icon: 'fa-book', title: 'Central Knowledge', body: 'Control business knowledge and information access.', href: '/products/knowledge/' },
          { icon: 'fa-plug', title: 'Integrations', body: 'Connect existing business systems.', href: '/platform/integrations/' },
          { icon: 'fa-bolt', title: 'Automation', body: 'Build cross-department workflows.', href: '/products/automation/' },
          { icon: 'fa-chart-line', title: 'Analytics', body: 'Understand workforce activity and performance.', href: '/products/analytics/' },
          { icon: 'fa-satellite-dish', title: 'Mission Control', body: 'Monitor the entire AI operation.', href: '/products/dashboards/' },
        ])}`, { alt: true }),
    ],
  }),

  solutionPage({
    slug: 'small-business',
    title: 'Small Business',
    eyebrow: 'SMALL BUSINESS',
    heroTitle: "You don't need a big team to work like one.",
    heroLead: 'ZiricAI gives small businesses access to digital employees that can handle customer service, administration, sales and other repetitive work without the cost of hiring a large team.',
    finalCta: {
      block: { title: 'Big business capability without big business overhead.', primaryHtml: btnPrimary('Start Free') },
    },
    sections: [
      platformDetail(`
        ${platformSectionHeader({ title: 'Start with one employee.' })}
        <p class="platform-section-sub" style="text-align:center;">Maybe you need a receptionist, a sales assistant or a customer support agent. Hire one. Train it. Put it to work. Then add another when the business needs it.</p>
        ${platformBulletGrid([
          '24/7 availability',
          'Faster customer responses',
          'Less repetitive work',
          'More consistent service',
          'Automated follow-ups',
          'Professional customer experience',
          'Scalable digital workforce',
        ])}`, { alt: true }),
    ],
  }),

  solutionPage({
    slug: 'growing-business',
    title: 'Growing Business',
    eyebrow: 'GROWING BUSINESSES',
    heroTitle: 'Scale your workforce without scaling your overhead at the same rate.',
    heroLead: 'As your business grows, so does the amount of customer communication, administration and operational work. ZiricAI lets your digital workforce grow with you.',
    finalCta: {
      block: { title: 'Grow the business. Not the repetitive workload.', primaryHtml: btnPrimary('Build Your Workforce') },
    },
    sections: [
      platformDetail(`
        ${wfStagePipeline([
          { title: 'Stage 1 — One AI Employee', body: 'Handle one critical workload.' },
          { title: 'Stage 2 — Multiple AI Employees', body: 'Add sales, support and administration.' },
          { title: 'Stage 3 — Multiple Departments', body: 'Build a coordinated digital workforce.' },
          { title: 'Stage 4 — AI-Powered Organization', body: 'Connect your workforce across the entire operation.' },
        ])}`, { alt: true }),
    ],
  }),
];
