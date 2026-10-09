/**
 * AI Employees ecosystem — digital employment agency pages.
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
  workforceDepartmentGrid,
  workforceJobDescriptionGrid,
  meetWorkforceSection,
  featuredEmployeeBlock,
  employeeListBlock,
  wfHowItWorksSteps,
  wfFlowVertical,
  workforceEmployeeCard,
  WF_DEPARTMENTS,
} from './marketing-workforce-blocks.js';

const P = '../../';

function deptPage({
  slug,
  eyebrow,
  heroTitle,
  heroLead,
  introTitle,
  introBody,
  featured,
  others,
  extraDetail = '',
  closingTitle,
  closingBody,
  ctaLabel,
}) {
  return wfPage({
    outPath: `ai-employees/${slug}/index.html`,
    title: eyebrow.replace(/ AI EMPLOYEES/i, '').trim() || slug,
    description: heroLead.slice(0, 160),
    depth: 2,
    activePath: `/ai-employees/${slug}/`,
    bodyHtml: `${productHero({
      eyebrow,
      title: heroTitle,
      lead: heroLead,
      actions: btnPrimary(`Explore ${ctaLabel || 'Employees'}`),
      theme: 'workforce-dept',
      assetPrefix: P,
    })}
${platformIntro({ icon: 'fa-users-gear', title: introTitle, body: introBody })}
${platformDetail(`
        ${featuredEmployeeBlock(featured)}
        <h3 class="wf-other-heading">Other ${eyebrow.replace(/ AI EMPLOYEES/i, '')} Employees</h3>
        ${employeeListBlock(others)}${extraDetail}`, { alt: true })}
${closingTitle ? platformDetail(`<div class="platform-big-statement"><strong>${closingTitle}</strong>${closingBody ? `<br>${closingBody}` : ''}</div>`) : ''}
${mktFinalCta({
  title: `Explore ${ctaLabel || eyebrow} Employees`,
  primaryHtml: btnPrimary(`Explore ${ctaLabel || 'Employees'}`),
})}
${marketingPricingSection()}`,
  });
}

export const AI_EMPLOYEE_PAGES = [
  wfPage({
    outPath: 'ai-employees/marketplace/index.html',
    title: 'Browse AI Employees',
    description: 'Hire specialized AI Employees by department and role — pre-trained digital workers ready to deploy in minutes.',
    depth: 2,
    activePath: '/ai-employees/marketplace/',
    bodyHtml: `${productHero({
      eyebrow: 'DIGITAL EMPLOYMENT AGENCY',
      title: 'Hire an AI Employee for almost any role.',
      lead: 'ZiricAI gives businesses access to a growing workforce of specialized AI Employees, pre-trained for specific roles, departments and industries — ready to deploy in minutes.',
      actions: `${btnPrimary('Browse AI Employees')} ${btnOutlineLink('/ai-employees/how-it-works/', 'Build Your Workforce')}`,
      theme: 'workforce-browse',
      assetPrefix: P,
    })}
${platformIntro({
  icon: 'fa-briefcase',
  title: "Don't start with AI. Start with the job that needs to be done.",
  body: `<p>Every business has repetitive work that consumes time — answering enquiries, scheduling appointments, following up with customers, processing information, managing documents and keeping teams organized.</p>
        <p>Instead of asking, "What can AI do?", ZiricAI asks a more practical question:</p>
        <p><strong>"Which job can AI do for your business?"</strong></p>`,
})}
${platformDetail(`
        ${platformSectionHeader({ eyebrow: 'Departments', title: 'Browse by department' })}
        ${workforceDepartmentGrid(WF_DEPARTMENTS)}`, { alt: true })}
${platformDetail(`
        ${platformSectionHeader({ title: 'Every AI Employee comes with a job description.' })}
        ${workforceJobDescriptionGrid()}`)}
${platformDetail(`
        ${platformSectionHeader({
          title: 'Build your digital workforce department by department.',
          subtitle: 'Start with one employee. Add another when the business needs it. Eventually, your entire organization can operate with a coordinated digital workforce.',
        })}
        <p class="marketing-detail-cta"><a href="/ai-employees/how-it-works/" class="btn btn-outline">Explore Departments</a></p>`, { alt: true })}
${meetWorkforceSection({ assetPrefix: P })}
${platformDetail(`
        ${platformSectionHeader({ title: 'Featured roles ready to hire' })}
        <div class="wf-emp-card-grid">
            ${workforceEmployeeCard({
              role: 'AI Receptionist',
              department: 'Administration',
              tagline: 'Your always-on digital front desk for enquiries, appointments and customer communication.',
              skills: ['Multi-channel reception', 'Appointment scheduling', 'Call routing', 'Visitor management'],
              worksWith: ['WhatsApp', 'Webchat', 'CRM', 'Calendar'],
              ctaLabel: 'Hire AI Receptionist',
              avatarImg: `${P}assets/sarah-avatar.svg`,
            })}
            ${workforceEmployeeCard({
              role: 'Sales Consultant',
              department: 'Sales',
              tagline: 'Qualify prospects, answer product questions and keep your pipeline moving around the clock.',
              skills: ['Lead qualification', 'Product education', 'Follow-ups', 'CRM capture'],
              worksWith: ['WhatsApp', 'CRM', 'Knowledge Base'],
              ctaLabel: 'Hire Sales Consultant',
              avatarLetter: 'A',
            })}
            ${workforceEmployeeCard({
              role: 'Customer Support Agent',
              department: 'Customer Support',
              tagline: 'First-line support for enquiries, orders, returns and routine troubleshooting.',
              skills: ['FAQ resolution', 'Ticket creation', 'Order status', 'Escalation'],
              worksWith: ['WhatsApp', 'Webchat', 'CRM'],
              ctaLabel: 'Hire Support Agent',
              avatarLetter: 'M',
            })}
        </div>`, { alt: true })}
${mktFinalCta({
  title: 'Build your digital workforce.',
  body: 'Hire one AI Employee today. Scale department by department.',
  primaryHtml: btnPrimary('Start Hiring'),
})}
${marketingPricingSection()}`,
  }),

  wfPage({
    outPath: 'ai-employees/how-it-works/index.html',
    title: 'How AI Employment Works',
    description: 'Choose, hire, train, connect, deploy and manage AI Employees — the digital employment process in minutes.',
    depth: 2,
    activePath: '/ai-employees/how-it-works/',
    bodyHtml: `${productHero({
      eyebrow: 'HOW AI EMPLOYMENT WORKS',
      title: 'Hire an AI Employee. Train it. Put it to work.',
      lead: 'ZiricAI turns the traditional employment process into a digital one — allowing businesses to select, configure, train and deploy AI Employees in minutes.',
      actions: `${btnPrimary('Hire Your First Employee')} ${btnOutlineLink('/ai-employees/marketplace/', 'Browse AI Employees')}`,
      theme: 'workforce-how',
      assetPrefix: P,
    })}
${platformDetail(`
        ${wfHowItWorksSteps([
          {
            num: '1',
            title: 'Choose the role',
            body: 'Start with the job you need help with. Browse AI Employees by department, role or industry.',
            example: `<p><strong>Example:</strong> You need someone to answer customer enquiries and book appointments.</p><p><strong>Choose:</strong> AI Receptionist</p>`,
          },
          {
            num: '2',
            title: 'Hire',
            body: 'Select the AI Employee and add it to your organization. The employee comes with a defined role, capabilities, skills and responsibilities. No AI development team required.',
          },
          {
            num: '3',
            title: 'Train',
            body: 'Teach it your business. Connect the employee to your business knowledge:',
            list: ['Products', 'Services', 'Pricing', 'Policies', 'FAQs', 'SOPs', 'Documents', 'Website', 'Business processes'],
          },
          {
            num: '4',
            title: 'Connect',
            body: 'Connect the systems and channels your employee needs to do its job.',
            example: `<p><strong>AI Receptionist</strong> → WhatsApp · Website · Calendar · CRM · Email</p>`,
          },
          { num: '5', title: 'Deploy', body: 'Put your AI Employee where the work happens. Your employee can operate through supported channels and business systems.' },
          {
            num: '6',
            title: 'Manage',
            body: 'Monitor activity, conversations, workflows and performance from ZiricAI. Adjust knowledge, workflows, permissions and responsibilities as your business evolves.',
          },
        ])}`, { alt: true })}
${platformDetail(`
        <p class="platform-big-statement"><strong>From job description to working AI Employee.</strong><br>Choose → Hire → Train → Connect → Deploy → Manage</p>`)}
${mktFinalCta({ title: 'Ready to hire?', primaryHtml: btnPrimary('Build Your Workforce') })}
${marketingPricingSection()}`,
  }),

  deptPage({
    slug: 'administration',
    eyebrow: 'ADMINISTRATION AI EMPLOYEES',
    heroTitle: 'Your digital administration team.',
    heroLead: 'Let AI handle the repetitive administrative work that keeps your business moving — from answering enquiries and managing calendars to coordinating appointments and organizing information.',
    introTitle: 'Administration that never clocks out.',
    introBody: '<p>Your front desk, coordinators and operations assistants can work alongside AI Employees that handle routine administrative volume — with clear escalation when people need to step in.</p>',
    featured: {
      title: 'AI Receptionist',
      subtitle: 'Your always-on front desk.',
      handles: [
        'Phone and digital enquiries',
        'WhatsApp conversations',
        'Website enquiries',
        'Appointment requests',
        'Visitor information',
        'Basic customer questions',
        'Message routing',
        'Escalations',
      ],
      example: `<p><strong>Customer:</strong> "Hi, I'd like to speak to someone about your services."</p>
            <p><strong>AI Receptionist:</strong> Understands the request, captures the customer's details and routes the enquiry to the appropriate person.</p>`,
    },
    others: [
      { title: 'Executive Assistant', body: 'Keeps executives organized by managing calendars, preparing information, handling routine correspondence and coordinating meetings.' },
      { title: 'Appointment Coordinator', body: 'Books, reschedules and confirms appointments while keeping calendars synchronized.' },
      { title: 'Data & Operations Assistant', body: 'Helps organize business information, process routine administrative tasks and keep operational records updated.' },
    ],
    closingTitle: 'Never miss another enquiry because the office is closed.',
    closingBody: 'Your AI administration team can remain available outside normal business hours, helping customers and employees get answers without waiting for the office to open.',
    ctaLabel: 'Administration',
  }),

  deptPage({
    slug: 'sales',
    eyebrow: 'SALES AI EMPLOYEES',
    heroTitle: 'Turn more enquiries into customers.',
    heroLead: 'Give your sales team AI Employees that qualify leads, answer product questions, follow up with prospects and help move opportunities through your pipeline.',
    introTitle: 'Every enquiry is a potential customer.',
    introBody: '<p>Your AI Sales Employees can work continuously across your channels while your people focus on relationships, negotiation and closing.</p>',
    featured: {
      title: 'Sales Consultant',
      subtitle: 'Your AI sales representative, available around the clock.',
      handles: [
        'Answer product questions',
        'Explain services',
        'Qualify prospects',
        'Capture customer requirements',
        'Handle common objections',
        'Generate quotations where connected',
        'Schedule demonstrations',
        'Create CRM leads',
        'Follow up with prospects',
      ],
    },
    others: [
      { title: 'Lead Qualification Assistant', body: 'Identifies potential customers, asks qualifying questions and sends sales-ready leads to your team.' },
      { title: 'Sales Development Assistant', body: 'Engages prospects, follows up on enquiries and helps create new opportunities.' },
      { title: 'Quotation Assistant', body: 'Helps customers understand pricing and prepares quotation requests according to your business rules.' },
    ],
    extraDetail: `<div class="section-header marketing-detail-header"><h2>Example flow</h2></div>
        ${wfFlowVertical([
          'Customer: "I\'m interested in buying a vehicle. Do you have financing?"',
          'Sales AI — Understands requirements',
          'Knowledge Base — Provides approved information',
          'CRM — Creates or updates the lead',
          'Appointment — Books a test drive',
          'Human Salesperson — Receives a qualified opportunity',
        ])}`,
    closingTitle: "Your sales team shouldn't spend the day answering the same questions.",
    closingBody: 'Let AI handle the repetitive conversations while your people focus on closing relationships and complex deals.',
    ctaLabel: 'Sales',
  }),

  deptPage({
    slug: 'customer-support',
    eyebrow: 'CUSTOMER SUPPORT AI EMPLOYEES',
    heroTitle: 'Support customers before they have to ask twice.',
    heroLead: 'AI Employees answer questions, resolve routine issues, track requests and escalate complex cases to your human team.',
    introTitle: 'Support that scales with demand.',
    introBody: '<p>Give customers fast answers on the channels they already use — with your team in control when conversations need a human touch.</p>',
    featured: {
      title: 'Customer Support Agent',
      subtitle: 'Your first line of customer support, available 24/7.',
      handles: [
        'Customer enquiries',
        'Product questions',
        'Order information',
        'Delivery questions',
        'Returns',
        'Frequently asked questions',
        'Troubleshooting',
        'Ticket creation',
        'Escalation',
      ],
    },
    others: [
      { title: 'Order Support Assistant', body: 'Helps customers understand order status, delivery information and next steps.' },
      { title: 'Returns Assistant', body: 'Guides customers through return processes and captures the information your team needs.' },
      { title: 'Customer Success Assistant', body: 'Helps customers get value from your products and services after the sale.' },
    ],
    closingTitle: "Support doesn't stop when your office closes.",
    closingBody: "Customers shouldn't have to wait until tomorrow for an answer to a question they have today.",
    ctaLabel: 'Customer Support',
  }),

  deptPage({
    slug: 'human-resources',
    eyebrow: 'HR AI EMPLOYEES',
    heroTitle: 'Give your people team an AI assistant.',
    heroLead: 'Automate routine HR questions, recruitment administration, onboarding and employee support while keeping sensitive matters under appropriate human oversight.',
    introTitle: 'HR support without the backlog.',
    introBody: '<p>Free your HR team from repetitive enquiries while ensuring sensitive conversations stay with qualified people.</p>',
    featured: {
      title: 'HR Assistant',
      subtitle: 'A digital HR assistant for employees and managers.',
      handles: [
        'HR FAQs',
        'Leave policy questions',
        'Employee information requests',
        'Onboarding support',
        'Policy guidance',
        'HR document requests',
        'Internal enquiries',
        'Escalation to HR',
      ],
    },
    others: [
      {
        title: 'Recruitment Assistant',
        body: 'Helps manage the early stages of recruitment by screening applicants against defined criteria, answering candidate questions and coordinating interviews.',
        list: ['Screen applications', 'Ask qualifying questions', 'Schedule interviews', 'Send candidate communications', 'Organize applicant information'],
      },
      { title: 'Onboarding Assistant', body: 'Guides new employees through onboarding processes and helps them find the information they need.' },
    ],
    extraDetail: `<div class="wf-trust-statement"><p><strong>AI handles the routine. People handle the people.</strong> HR often involves sensitive conversations and important decisions. ZiricAI is designed to support HR teams, automate appropriate administrative work and escalate matters that require human judgment.</p></div>`,
    ctaLabel: 'HR',
  }),

  deptPage({
    slug: 'finance',
    eyebrow: 'FINANCE AI EMPLOYEES',
    heroTitle: 'Automate the routine work around your finances.',
    heroLead: 'Give your finance team AI assistance with invoicing enquiries, payment follow-ups, account information and routine financial administration.',
    introTitle: 'Finance teams should focus on decisions.',
    introBody: '<p>Let AI Employees handle routine financial enquiries while professionals remain responsible for approvals and sensitive matters.</p>',
    featured: {
      title: 'Finance Assistant',
      subtitle: 'Your digital first line for routine finance enquiries.',
      handles: [
        'Invoice questions',
        'Payment reminders',
        'Account lookups',
        'Billing enquiries',
        'Payment status questions',
        'Expense categorization support',
        'Finance administration',
      ],
    },
    others: [
      { title: 'Accounts Assistant', body: 'Helps organize routine accounting information and respond to common account enquiries.' },
      { title: 'Invoicing Assistant', body: 'Helps customers understand invoices, payment instructions and outstanding balances.' },
      { title: 'Collections Assistant', body: 'Supports structured payment follow-ups and escalates unresolved matters to the appropriate team.' },
    ],
    closingTitle: 'Finance teams should focus on decisions — not repetitive questions.',
    closingBody: 'ZiricAI can handle routine interactions while your finance professionals remain responsible for financial decisions, approvals and sensitive matters.',
    ctaLabel: 'Finance',
  }),

  deptPage({
    slug: 'legal',
    eyebrow: 'LEGAL AI EMPLOYEES',
    heroTitle: 'Give your legal team an AI assistant for the work around the work.',
    heroLead: 'Automate administrative legal workflows, client intake, document collection and routine information requests while keeping professional legal judgment with qualified people.',
    introTitle: 'Administrative support for legal teams.',
    introBody: '<p>Reduce intake and document workload without implying that AI replaces qualified legal professionals.</p>',
    featured: {
      title: 'Legal Assistant',
      subtitle: 'A digital assistant for legal administration and client intake.',
      handles: [
        'Initial client enquiries',
        'Client intake',
        'Appointment scheduling',
        'Document checklists',
        'Case information collection',
        'Status enquiries',
        'Administrative follow-ups',
        'Routing matters to the appropriate legal professional',
      ],
    },
    others: [
      { title: 'Client Intake Assistant', body: 'Collects initial information from prospective clients and prepares structured intake records.' },
      { title: 'Legal Document Assistant', body: 'Helps organize documents, identify missing information and manage document workflows.' },
      { title: 'Legal Research Assistant', body: 'Supports research workflows and information retrieval under the direction of qualified professionals.' },
    ],
    extraDetail: `<div class="wf-trust-statement"><p><strong>AI assistance. Human legal judgment.</strong> ZiricAI helps legal organizations reduce administrative workload. It does not replace the professional judgment, advice or responsibility of qualified legal professionals.</p></div>`,
    ctaLabel: 'Legal',
  }),

  deptPage({
    slug: 'healthcare',
    eyebrow: 'HEALTHCARE AI EMPLOYEES',
    heroTitle: 'Make healthcare administration easier for patients and staff.',
    heroLead: 'Help patients get information, book appointments and navigate routine administrative processes while your healthcare professionals focus on care.',
    introTitle: 'Administration and patient support — not clinical care.',
    introBody: '<p>Position AI around scheduling, FAQs and administrative workflows while clinical decisions remain with qualified professionals.</p>',
    featured: {
      title: 'Medical Receptionist',
      subtitle: 'Your digital front desk for healthcare.',
      handles: [
        'Appointment requests',
        'Booking confirmations',
        'Rescheduling',
        'Clinic information',
        'Operating hours',
        'General FAQs',
        'Patient administrative enquiries',
        'Reminders',
        'Escalations',
      ],
    },
    others: [
      { title: 'Patient Support Assistant', body: 'Helps patients navigate routine administrative questions and directs them to the appropriate team.' },
      { title: 'Dental Assistant', body: 'Manages dental appointment requests, treatment FAQs and follow-up reminders.' },
      { title: 'Healthcare Administration Assistant', body: 'Supports routine administrative workflows across healthcare organizations.' },
    ],
    extraDetail: `<div class="wf-trust-statement"><p><strong>Technology should reduce administrative pressure — not replace clinical care.</strong> ZiricAI supports healthcare organizations with administrative and communication workflows while clinical decisions remain with qualified healthcare professionals.</p></div>`,
    ctaLabel: 'Healthcare',
  }),

  deptPage({
    slug: 'education',
    eyebrow: 'EDUCATION AI EMPLOYEES',
    heroTitle: 'Give schools and education providers an AI team of their own.',
    heroLead: 'Help students, parents, applicants and staff get answers faster while reducing the administrative workload on education teams.',
    introTitle: 'Education administration at scale.',
    introBody: '<p>From admissions to parent enquiries, AI Employees handle volume so educators can focus on teaching and support.</p>',
    featured: {
      title: 'School Administrator',
      subtitle: 'Your digital front office for school administration.',
      handles: [
        'Parent enquiries',
        'School information',
        'Fee-related FAQs',
        'Calendar information',
        'Event enquiries',
        'General administration',
        'Appointment requests',
        'Escalations',
      ],
    },
    others: [
      {
        title: 'Admissions Officer',
        body: 'Guides prospective students and parents through the admissions process.',
        list: [
          'Answer admissions questions',
          'Explain requirements',
          'Collect applicant information',
          'Provide document checklists',
          'Schedule campus visits',
          'Track enquiries',
        ],
      },
      { title: 'Student Support Assistant', body: 'Helps students find information and navigate routine administrative questions.' },
      { title: 'Education Enquiries Assistant', body: 'Provides information about courses, programs, schedules, requirements and other approved institutional information.' },
    ],
    ctaLabel: 'Education',
  }),
];
