/**
 * Platform product ecosystem pages (AI Business OS + stack + channels).
 */

import {
  platformStack,
  platformCardGrid,
  platformFlow,
  platformBulletGrid,
  platformNumberedSteps,
  platformCategoryGrid,
  mktFinalCta,
  btnPrimary,
  btnOutlineLink,
  productHero,
  platformIntro,
  platformDetail,
  platformSectionHeader,
  marketingPricingSection,
} from './marketing-platform-blocks.js';
import { tourPhoneBlock } from './marketing-tour-phone.js';

function page({ outPath, title, description, depth, activePath, includeLanding, bodyHtml }) {
  return {
    outPath,
    title: `${title} · ZiricAI`,
    description,
    depth,
    activePath,
    includePricing: true,
    includeLanding: includeLanding ?? false,
    bodyHtml,
  };
}

const STACK = platformStack([
  { icon: 'fa-users-gear', title: 'AI Employees', sub: 'Your digital workforce' },
  { icon: 'fa-book', title: 'Knowledge Base', sub: 'What they know' },
  { icon: 'fa-address-book', title: 'CRM', sub: 'Who your business knows' },
  { icon: 'fa-bolt', title: 'Automation', sub: 'What they can do' },
  { icon: 'fa-share-nodes', title: 'Channels', sub: 'Where they communicate' },
  { icon: 'fa-plug', title: 'Integrations', sub: 'What they connect to' },
  { icon: 'fa-chart-line', title: 'Analytics', sub: 'What you measure' },
  { icon: 'fa-satellite-dish', title: 'Mission Control', sub: 'How you manage everything' },
]);

const OS_CARDS = platformCardGrid([
  { icon: 'fa-users-gear', title: 'AI Employees', body: 'Hire specialized digital workers.', href: '/ai-employees/how-it-works/' },
  { icon: 'fa-book', title: 'Knowledge', body: "Give them your organization's information.", href: '/products/knowledge/' },
  { icon: 'fa-address-book', title: 'CRM', body: 'Keep customer relationships connected.', href: '/products/crm/' },
  { icon: 'fa-bolt', title: 'Automation', body: 'Turn conversations into business processes.', href: '/products/automation/' },
  { icon: 'fa-chart-line', title: 'Analytics', body: 'Understand performance and activity.', href: '/products/analytics/' },
  { icon: 'fa-satellite-dish', title: 'Mission Control', body: 'Manage your AI workforce centrally.', href: '/products/dashboards/' },
  { icon: 'fa-plug', title: 'Integrations', body: 'Connect your existing business systems.', href: '/platform/integrations/' },
  { icon: 'fa-comments', title: 'Channels', body: 'Deploy AI wherever your customers are.', href: '/platform/whatsapp/' },
]);

export const PLATFORM_PRODUCT_PAGES = [
  page({
    outPath: 'platform/index.html',
    title: 'AI Business OS',
    description:
      'ZiricAI is the AI Business Operating System — AI Employees, knowledge, CRM, automation, analytics, and integrations in one platform.',
    depth: 1,
    activePath: '/platform/',
    bodyHtml: `${productHero({
      eyebrow: 'THE FOUNDATION OF YOUR AI WORKFORCE',
      title: 'One operating system for your entire AI workforce.',
      lead: 'ZiricAI brings AI Employees, business knowledge, customer relationships, automation, communications, analytics and integrations together in one intelligent business operating system.',
      actions: `${btnPrimary('Build Your AI Workforce')} ${btnOutlineLink('/ai-employees/how-it-works/', 'Explore AI Employees')}`,
      theme: 'os',
      assetPrefix: '../',
    })}
${platformIntro({
  icon: 'fa-microchip',
  title: 'AI is no longer just a tool',
  body: `<p>Your business doesn't need another AI tool. It needs an AI operating system.</p>
        <p>Businesses already use software for communication, sales, customer management, finance, operations and administration.</p>
        <p>ZiricAI connects AI to those workflows, giving your business a central platform for deploying and managing a digital workforce.</p>
        <p>Instead of adding another isolated chatbot, you can build an AI workforce that operates as part of your organization.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header">
            <span class="section-eyebrow">The ZiricAI stack</span>
            <h2>How the platform fits together</h2>
        </div>
        ${STACK}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header">
            <span class="section-eyebrow">Platform</span>
            <h2>One platform. Every part of the AI workforce.</h2>
        </div>
        ${OS_CARDS}`)}
${mktFinalCta({
  title: 'Build your business around an AI workforce.',
  body: 'Start with one AI Employee. Connect your business. Scale when you\'re ready.',
  primaryHtml: btnPrimary('Start Free'),
})}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'products/knowledge/index.html',
    title: 'Knowledge Base',
    description: 'Give your AI Employees the business knowledge they need — documents, website, FAQs, and role-specific training.',
    depth: 2,
    activePath: '/products/knowledge/',
    bodyHtml: `${productHero({
      eyebrow: 'BUSINESS KNOWLEDGE',
      title: 'Give your AI Employees the knowledge they need to do their jobs.',
      lead: "Turn your company's documents, policies, products, processes and website information into a knowledge layer your AI workforce can use.",
      actions: `${btnPrimary('Upload Knowledge')} ${btnOutlineLink('/ai-employees/how-it-works/', 'See How It Works')}`,
      theme: 'knowledge',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-book-open',
  title: 'Your AI should know your business.',
  body: `<p>General-purpose AI knows a lot about the world. Your AI Employees need to know <strong>your</strong> world.</p>
        <p>Your products. Your services. Your prices. Your policies. Your procedures. Your customers. Your way of working.</p>
        <p>ZiricAI Knowledge Base gives your AI Employees access to the business information you choose to provide.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><span class="section-eyebrow">How it works</span><h2>From upload to deployed knowledge</h2></div>
        ${platformNumberedSteps([
          {
            num: '1',
            title: 'Upload',
            list: ['PDFs', 'Documents', 'Spreadsheets', 'Policies', 'SOPs', 'Price lists', 'Product information', 'Training materials'],
          },
          {
            num: '2',
            title: 'Connect',
            list: ['Your website', 'FAQs', 'Business content', 'Connected systems'],
          },
          { num: '3', title: 'Organize', body: 'Keep business information structured and accessible.' },
          { num: '4', title: 'Deploy', body: 'Make relevant knowledge available to the AI Employees that need it.' },
        ])}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>One source of truth for your AI workforce.</h2></div>
        ${platformBulletGrid([
          '<strong>Shared knowledge</strong> — Give multiple AI Employees access to approved information.',
          '<strong>Role-specific knowledge</strong> — Give specific employees the information relevant to their role.',
          '<strong>Controlled access</strong> — Control what information is available to your workforce.',
        ])}`)}
${mktFinalCta({
  title: 'Teach your AI Employees how your business works.',
  primaryHtml: btnPrimary('Build Your Knowledge Base'),
})}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'products/crm/index.html',
    title: 'CRM',
    description: 'ZiricAI CRM — turn every conversation into a customer relationship with leads, pipeline, and AI-assisted updates.',
    depth: 2,
    activePath: '/products/crm/',
    bodyHtml: `${productHero({
      eyebrow: 'CUSTOMER RELATIONSHIP MANAGEMENT',
      title: 'Turn every conversation into a customer relationship.',
      lead: 'ZiricAI CRM gives your AI Employees the customer context they need to capture leads, manage relationships and keep your team informed.',
      actions: btnPrimary('Explore CRM'),
      theme: 'crm',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-address-book',
  title: "Your AI Employees shouldn't forget your customers.",
  body: `<p>A customer may talk to your business today, return next week, speak to another employee and continue the same relationship.</p>
        <p>CRM gives your AI workforce the context needed to understand those interactions and keep customer information connected.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><span class="section-eyebrow">Core features</span><h2>CRM built for conversations</h2></div>
        ${platformCardGrid([
          { icon: 'fa-user-plus', title: 'Lead Management', body: 'Capture and organize new opportunities.' },
          { icon: 'fa-id-card', title: 'Customer Profiles', body: 'Keep customer information in one place.' },
          { icon: 'fa-comments', title: 'Conversation History', body: 'Understand previous interactions.' },
          { icon: 'fa-clock', title: 'Follow-ups', body: 'Keep opportunities moving.' },
          { icon: 'fa-filter', title: 'Pipeline', body: 'Track prospects from enquiry to customer.' },
          { icon: 'fa-robot', title: 'AI-Assisted CRM', body: 'Let AI Employees capture and update information during conversations.' },
        ])}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>The conversation becomes the CRM.</h2></div>
        ${platformFlow([
          { label: 'Customer', text: 'Sends WhatsApp message' },
          { label: 'Sarah', text: 'Identifies a potential buyer' },
          { label: 'CRM', text: 'Lead created · Customer information captured' },
          { label: 'Sales Employee', text: 'Follows up · Opportunity updated' },
          { label: 'Your team', text: 'Human salesperson takes over when needed' },
        ])}`)}
${mktFinalCta({ title: 'Turn conversations into opportunities.', primaryHtml: btnPrimary('Start Using CRM') })}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'products/automation/index.html',
    title: 'Automation',
    description: 'Workflow automation — from customer message to completed work with CRM, calendar, booking, and team notifications.',
    depth: 2,
    activePath: '/products/automation/',
    bodyHtml: `${productHero({
      eyebrow: 'WORKFLOW AUTOMATION',
      title: 'From conversation to completed work. Automatically.',
      lead: 'Connect AI Employees to the workflows your business runs every day — without manually moving information between systems.',
      actions: btnPrimary('Build a Workflow'),
      theme: 'automation',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-bolt',
  title: 'AI should do more than answer.',
  body: `<p>A customer enquiry often triggers a chain of work — capture the lead, update the CRM, check availability, book the appointment, send confirmation and notify the team.</p>
        <p>ZiricAI can connect these steps into automated workflows.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><span class="section-eyebrow">Example</span><h2>One conversation. An entire workflow.</h2></div>
        ${platformFlow([
          { label: 'Customer message', text: '"Can I book an appointment tomorrow?"' },
          { label: 'AI Employee', text: 'Understands the request.' },
          { label: 'CRM', text: 'Customer information retrieved.' },
          { label: 'Calendar', text: 'Availability checked.' },
          { label: 'Booking', text: 'Appointment created.' },
          { label: 'Customer', text: 'Confirmation sent.' },
          { label: 'Team', text: 'Relevant staff notified.' },
        ])}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>Automation capabilities</h2></div>
        ${platformBulletGrid([
          'Lead creation',
          'CRM updates',
          'Appointment booking',
          'Notifications',
          'Follow-ups',
          'Customer routing',
          'Task creation',
          'Escalations',
          'Business process triggers',
          'Multi-step workflows',
        ])}`)}
${mktFinalCta({ title: 'Automate the work behind every conversation.', primaryHtml: btnPrimary('Explore Automation') })}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'products/analytics/index.html',
    title: 'Analytics',
    description: 'AI business analytics — visibility into conversations, leads, workflows, and workforce performance.',
    depth: 2,
    activePath: '/products/analytics/',
    bodyHtml: `${productHero({
      eyebrow: 'AI BUSINESS ANALYTICS',
      title: 'Know what your AI workforce is doing.',
      lead: 'Turn AI activity and business interactions into insights you can use to make better decisions.',
      actions: btnPrimary('Explore Analytics'),
      theme: 'analytics',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-chart-line',
  title: 'Visibility across your digital workforce.',
  body: `<p>When AI starts handling conversations and business processes at scale, you need more than activity logs.</p>
        <p>You need to understand what is happening, what is working and where your team needs to intervene.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>Dashboard areas</h2></div>
        ${platformCardGrid([
          { icon: 'fa-robot', title: 'AI Activity', body: 'See how your AI Employees are being used.' },
          { icon: 'fa-comments', title: 'Conversations', body: 'Monitor customer interactions and outcomes.' },
          { icon: 'fa-user-plus', title: 'Leads', body: 'Track opportunities generated by AI.' },
          { icon: 'fa-bolt', title: 'Workflows', body: 'Understand automation activity.' },
          { icon: 'fa-gauge-high', title: 'Response Performance', body: 'See how quickly customers receive assistance.' },
          { icon: 'fa-arrow-up-right-from-square', title: 'Escalations', body: 'Identify where human intervention is required.' },
        ])}`, { alt: true })}
${platformIntro({
  icon: 'fa-gauge-high',
  title: 'Measure the work. Improve the workforce.',
  body: `<p>Analytics isn't just about counting conversations. It's about understanding how AI is contributing to the business.</p>`,
})}
${mktFinalCta({ title: 'Explore AI Analytics', primaryHtml: btnPrimary('Explore Analytics') })}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'products/dashboards/index.html',
    title: 'Mission Control',
    description: 'Mission Control — manage AI Employees, conversations, knowledge, integrations, and automation from one command center.',
    depth: 2,
    activePath: '/products/dashboards/',
    bodyHtml: `${productHero({
      eyebrow: 'AI WORKFORCE MANAGEMENT',
      title: 'Your entire AI workforce. One command center.',
      lead: 'Mission Control gives business leaders a central place to manage AI Employees, monitor operations, oversee integrations and understand what their digital workforce is doing.',
      actions: btnPrimary('Open Mission Control'),
      theme: 'mission-control',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-satellite-dish',
  title: 'As your AI workforce grows, control becomes essential.',
  body: `<p>One AI Employee is simple. Ten AI Employees across different departments is an operation.</p>
        <p>Mission Control gives you the visibility and controls to manage that operation.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>What you can manage</h2></div>
        <div class="platform-manage-grid">
            <div class="platform-manage-card"><h4><i class="fa-solid fa-robot"></i> AI Employees</h4><ul><li>Who is deployed</li><li>What role they perform</li><li>Their status</li><li>Their configuration</li></ul></div>
            <div class="platform-manage-card"><h4><i class="fa-solid fa-comments"></i> Conversations</h4><ul><li>Active conversations</li><li>Resolved conversations</li><li>Escalations</li><li>Customer interactions</li></ul></div>
            <div class="platform-manage-card"><h4><i class="fa-solid fa-book"></i> Knowledge</h4><ul><li>Business knowledge</li><li>Sources</li><li>Training status</li><li>Updates</li></ul></div>
            <div class="platform-manage-card"><h4><i class="fa-solid fa-plug"></i> Integrations</h4><ul><li>Connected systems</li><li>Connection status</li><li>Configuration</li></ul></div>
            <div class="platform-manage-card"><h4><i class="fa-solid fa-bolt"></i> Automation</h4><ul><li>Active workflows</li><li>Completed workflows</li><li>Issues requiring attention</li></ul></div>
        </div>
        <p class="platform-big-statement"><strong>Hire them. Train them. Deploy them. Monitor them. Manage them.</strong><br>All from one command center.</p>`, { alt: true })}
${mktFinalCta({ title: 'Explore Mission Control', primaryHtml: btnPrimary('Explore Mission Control') })}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'platform/integrations/index.html',
    title: 'Integrations',
    description: 'Connect ZiricAI to WhatsApp, CRM, calendars, payments, APIs, and the systems your business already uses.',
    depth: 2,
    activePath: '/platform/integrations/',
    bodyHtml: `${productHero({
      eyebrow: 'CONNECTED BUSINESS',
      title: 'Connect ZiricAI to the systems your business already uses.',
      lead: "Your AI workforce shouldn't require you to rebuild your technology stack. Connect the tools, channels and systems your business already relies on.",
      actions: btnPrimary('Explore Integrations'),
      theme: 'integrations',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-plug',
  title: "Your AI Employees don't work alone.",
  body: '<p>They need access to the systems where business actually happens.</p><p>ZiricAI connects your AI workforce to the tools and services that support your operation.</p>',
})}
${platformDetail(`
        ${platformCategoryGrid([
          { title: 'Communication', items: ['WhatsApp', 'Email', 'Webchat', 'Social channels'] },
          { title: 'Customer Management', items: ['CRM', 'Customer databases', 'Lead systems'] },
          { title: 'Productivity', items: ['Calendars', 'Documents', 'Business tools'] },
          { title: 'Payments', items: ['Payment platforms', 'Billing systems'] },
          { title: 'Developer & Business Systems', items: ['APIs', 'Webhooks', 'Custom integrations'] },
        ])}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>Connect once. Let your workforce use it.</h2></div>
        ${platformFlow([
          { label: 'CRM', text: 'Customer data' },
          { label: 'Calendar', text: 'Availability' },
          { label: 'Payments', text: 'Payment information' },
          { label: 'WhatsApp', text: 'Communication' },
          { label: 'ZiricAI', text: 'AI workforce connecting everything' },
        ])}`)}
${mktFinalCta({ title: 'Connect your business to your AI workforce.', primaryHtml: btnPrimary('View Integrations') })}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'platform/whatsapp/index.html',
    title: 'WhatsApp',
    description: 'AI Employees on WhatsApp — enquiries, sales, support, bookings, and CRM from the channel your customers already use.',
    depth: 2,
    activePath: '/platform/whatsapp/',
    includeLanding: true,
    bodyHtml: `${productHero({
      eyebrow: 'AI ON WHATSAPP',
      title: 'Put your AI Employees where your customers already are.',
      lead: 'Let customers talk to your business through WhatsApp while your AI Employees handle enquiries, sales, support, bookings and other workflows.',
      actions: `${btnPrimary('Connect WhatsApp')} ${btnOutlineLink('/#product-tour', 'See Sarah in Action')}`,
      theme: 'whatsapp',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-comment-dots',
  title: 'Turn WhatsApp into a digital employee.',
  body: `<p>Your customers already use WhatsApp to ask questions, request prices, book appointments and communicate with your business.</p>
        <p>Instead of making your team answer every routine message manually, let your AI Employees handle the conversation.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>What AI Employees can do</h2></div>
        ${platformCardGrid([
          { icon: 'fa-comment', title: 'Answer', body: 'Respond using your business knowledge.' },
          { icon: 'fa-cart-shopping', title: 'Sell', body: 'Qualify leads and move prospects forward.' },
          { icon: 'fa-calendar-check', title: 'Book', body: 'Schedule appointments and manage requests.' },
          { icon: 'fa-life-ring', title: 'Support', body: 'Handle routine support enquiries.' },
          { icon: 'fa-database', title: 'Capture', body: 'Collect information and create CRM records.' },
          { icon: 'fa-user-group', title: 'Escalate', body: 'Bring your human team in when needed.' },
        ])}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header"><span class="section-eyebrow">Example</span><h2>From stock question to test drive</h2></div>
        <div class="platform-dialog-example">
            <p><strong>Customer:</strong> "Hi, do you have the 2025 Hilux Legend in stock?"</p>
            <p><strong>Sarah:</strong> Checks your business knowledge / inventory source.</p>
            <p><strong>Sarah:</strong> Provides available options and pricing.</p>
            <p><strong>Customer:</strong> "Can I book a test drive tomorrow?"</p>
            <p><strong>Sarah:</strong> Checks availability and continues the booking workflow.</p>
        </div>
        <p class="platform-closing-line">WhatsApp becomes more than messaging. It becomes a business channel powered by AI.</p>
        <div class="tour-layout" id="product-tour">
            ${tourPhoneBlock({ title: 'Central Motors' })}
            <div class="tour-controls">
                <div class="tour-step-indicator">
                    <span class="tour-dot active" data-step="0"></span>
                    <span class="tour-dot" data-step="1"></span>
                    <span class="tour-dot" data-step="2"></span>
                    <span class="tour-dot" data-step="3"></span>
                </div>
                <h3 id="tourStepTitle">Step 1 · Answer WhatsApp enquiry</h3>
                <p id="tourStepDesc">Sarah replies instantly with accurate information from your knowledge base.</p>
                <div class="tour-nav">
                    <button class="btn btn-outline" id="tourPrevBtn" disabled type="button"><i class="fa-solid fa-arrow-left"></i> Back</button>
                    <button class="btn" id="tourNextBtn" type="button">Next <i class="fa-solid fa-arrow-right"></i></button>
                </div>
            </div>
        </div>`)}
${mktFinalCta({ title: 'Connect WhatsApp', primaryHtml: btnPrimary('Connect WhatsApp') })}
${marketingPricingSection()}`,
  }),

  page({
    outPath: 'platform/webchat/index.html',
    title: 'Webchat',
    description: 'AI website assistant — answer questions, capture leads, and guide visitors with Sarah on your site.',
    depth: 2,
    activePath: '/platform/webchat/',
    bodyHtml: `${productHero({
      eyebrow: 'AI WEBSITE ASSISTANT',
      title: 'Turn every website visitor into a conversation.',
      lead: 'Give your website an AI Employee that can answer questions, guide visitors, capture leads and help customers take the next step.',
      actions: `${btnPrimary('Add Webchat')} <button class="btn btn-ghost" type="button" onclick="document.getElementById('sarahBubble')?.click()"><i class="fa-solid fa-comment-dots"></i> Try Sarah</button>`,
      theme: 'webchat',
      assetPrefix: '../../',
    })}
${platformIntro({
  icon: 'fa-window-maximize',
  title: "Your website shouldn't just display information. It should work for your business.",
  body: `<p>Visitors arrive with questions — pricing, hours, booking, location, which service is right for them.</p>
        <p>Instead of making visitors search through pages, your AI Employee can help them immediately.</p>`,
})}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>What Webchat can do</h2></div>
        ${platformCardGrid([
          { icon: 'fa-circle-question', title: 'Answer questions', body: 'Using your business knowledge.' },
          { icon: 'fa-compass', title: 'Guide visitors', body: 'Help customers find the right product or service.' },
          { icon: 'fa-user-plus', title: 'Capture leads', body: 'Collect contact details and customer intent.' },
          { icon: 'fa-calendar', title: 'Book appointments', body: 'Connect conversations to booking workflows.' },
          { icon: 'fa-filter', title: 'Qualify prospects', body: 'Understand what the visitor needs.' },
          { icon: 'fa-arrow-up-right-from-square', title: 'Escalate', body: 'Connect customers to your team when required.' },
        ])}`, { alt: true })}
${platformDetail(`
        <div class="section-header marketing-detail-header"><h2>Your AI Employee is already on your website.</h2></div>
        <p>Use the <strong>Chat with Sarah</strong> bubble on any marketing page to experience webchat firsthand.</p>
        <div class="webchat-widget-preview">
            <div class="webchat-preview-card">
                <div class="webchat-preview-header"><img src="../../assets/sarah-avatar.svg" alt="" width="36" height="36"><span>Sarah · Online</span></div>
                <div class="webchat-preview-msg ai">Hi 👋 Ask me anything about ZiricAI — no signup required.</div>
            </div>
        </div>`)}
${mktFinalCta({ title: 'Add Webchat to Your Website', primaryHtml: btnPrimary('Add Webchat to Your Website') })}
${marketingPricingSection()}`,
  }),
];
