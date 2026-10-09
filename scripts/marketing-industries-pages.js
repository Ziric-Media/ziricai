/**
 * Industries — vertical-specific AI Employee landing pages.
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
  wfIndustryCards,
  platformCategoryGrid,
} from './marketing-workforce-blocks.js';

const P = '../../';
const P1 = '../';

const INDUSTRY_CARD_DATA = [
  { icon: 'fa-car', title: 'Automotive', lead: 'Help dealerships, workshops and automotive businesses handle enquiries, sales, bookings and customer support.', href: '/industries/automotive/', roles: ['Automotive Sales Consultant', 'Receptionist', 'Service Booking Assistant', 'Customer Support Agent', 'Lead Qualification Assistant'] },
  { icon: 'fa-gem', title: 'Mining', lead: 'Digital assistance across enquiries, administration, procurement, recruitment, operations and stakeholder communication.', href: '/industries/mining/', roles: ['Mining Administration Assistant', 'Procurement Assistant', 'Recruitment Assistant', 'Operations Assistant', 'Customer & Supplier Support'] },
  { icon: 'fa-heart-pulse', title: 'Healthcare', lead: 'Reduce administrative pressure while helping patients access information, appointments and routine support faster.', href: '/industries/healthcare/', roles: ['Medical Receptionist', 'Patient Support Assistant', 'Appointment Assistant', 'Dental Assistant', 'Healthcare Administrator'] },
  { icon: 'fa-graduation-cap', title: 'Education', lead: 'Help parents, students, applicants and staff get answers faster while reducing administrative workloads.', href: '/industries/education/', roles: ['School Administrator', 'Admissions Officer', 'Student Support Assistant', 'Education Enquiries Assistant', 'Executive Assistant'] },
  { icon: 'fa-gavel', title: 'Legal', lead: 'Automate client intake, scheduling, document workflows and routine enquiries while keeping professional legal judgment with qualified people.', href: '/industries/legal/', roles: ['Legal Assistant', 'Client Intake Assistant', 'Document Assistant', 'Legal Research Assistant', 'Receptionist'] },
  { icon: 'fa-store', title: 'Retail', lead: 'Give customers instant product information, order support, recommendations and assistance across your digital channels.', href: '/industries/retail/', roles: ['Retail Sales Assistant', 'Customer Support Agent', 'Order Support Assistant', 'Product Advisor', 'Returns Assistant'] },
  { icon: 'fa-hotel', title: 'Hospitality', lead: 'From reservations to guest enquiries — faster, more consistent service for hotels, restaurants and hospitality businesses.', href: '/industries/hospitality/', roles: ['Guest Services Assistant', 'Reservation Assistant', 'Restaurant Booking Assistant', 'Concierge Assistant', 'Customer Support Agent'] },
];

function industryDetailPage({ slug, title, eyebrow, heroTitle, heroLead, roles, extraIntro }) {
  return wfPage({
    outPath: `industries/${slug}/index.html`,
    title,
    description: heroLead.slice(0, 160),
    depth: 2,
    activePath: `/industries/${slug}/`,
    bodyHtml: `${productHero({
      eyebrow: eyebrow || title.toUpperCase(),
      title: heroTitle,
      lead: heroLead,
      actions: `${btnPrimary('Explore AI Employees')} ${btnOutlineLink('/ai-employees/marketplace/', 'Browse Workforce')}`,
      theme: 'industries',
      assetPrefix: P,
    })}
${platformIntro({
  icon: 'fa-building',
  title: `AI Employees for ${title.toLowerCase()}.`,
  body: extraIntro || `<p>ZiricAI provides specialized AI Employees, workflows and knowledge templates designed for ${title.toLowerCase()} organizations.</p>`,
})}
${platformDetail(`
        ${platformSectionHeader({ title: 'Recommended AI Employees' })}
        <ul class="platform-feature-list wf-industry-role-list">${roles.map((r) => `<li><i class="fa-solid fa-user-tie"></i> ${r}</li>`).join('')}</ul>
        <p class="marketing-detail-cta"><a href="/ai-employees/marketplace/" class="btn btn-glow">Hire for ${title} <i class="fa-solid fa-arrow-right"></i></a></p>`, { alt: true })}
${mktFinalCta({ title: `Build your ${title.toLowerCase()} workforce`, primaryHtml: btnPrimary('Start Free') })}
${marketingPricingSection()}`,
  });
}

export const INDUSTRY_PAGES = [
  wfPage({
    outPath: 'industries/index.html',
    title: 'Industries',
    description: 'Industry-specific AI Employees, workflows and solutions for automotive, healthcare, legal, retail, hospitality and more.',
    depth: 1,
    activePath: '/industries/',
    bodyHtml: `${productHero({
      eyebrow: 'INDUSTRY SOLUTIONS',
      title: 'AI Employees that understand your industry.',
      lead: 'ZiricAI provides specialized AI Employees, workflows and business knowledge for organizations across multiple industries.',
      actions: `${btnPrimary('Browse Industries')} ${btnOutlineLink('/industries/all/', 'View All Industries')}`,
      theme: 'industries',
      assetPrefix: P1,
    })}
${platformDetail(wfIndustryCards(INDUSTRY_CARD_DATA), { alt: true })}
${mktFinalCta({ title: 'Industry-ready from day one.', primaryHtml: btnOutlineLink('/ai-employees/marketplace/', 'Browse AI Employees') })}
${marketingPricingSection()}`,
  }),

  wfPage({
    outPath: 'industries/all/index.html',
    title: 'All Industries',
    description: 'Directory of industry-specific AI Employees — professional services, healthcare, education, commerce, industrial and public sector.',
    depth: 2,
    activePath: '/industries/all/',
    bodyHtml: `${productHero({
      eyebrow: 'INDUSTRY DIRECTORY',
      title: 'AI Employees for every industry.',
      lead: 'Explore industry-specific AI Employees, workflows and solutions designed around the way different organizations operate.',
      theme: 'industries',
      assetPrefix: P,
    })}
${platformDetail(`
        ${platformCategoryGrid([
          { title: 'Professional Services', items: ['Legal', 'Accounting', 'Insurance', 'Consulting'] },
          { title: 'Healthcare', items: ['Medical', 'Dental', 'Pharmacy', 'Clinics'] },
          { title: 'Education', items: ['Schools', 'Universities', 'Colleges', 'Training'] },
          { title: 'Commerce', items: ['Retail', 'Automotive', 'Hospitality', 'Restaurants'] },
          { title: 'Industrial', items: ['Mining', 'Construction', 'Manufacturing', 'Logistics'] },
          { title: 'Public & Community', items: ['Government', 'Municipalities', 'NGOs', 'Churches'] },
        ])}
        <div class="wf-industry-grid" style="margin-top:32px">${INDUSTRY_CARD_DATA.map((c) => `<a class="wf-industry-card" href="${c.href}"><div class="wf-industry-icon"><i class="fa-solid ${c.icon}"></i></div><h3>${c.title}</h3><p>${c.lead}</p></a>`).join('')}</div>`, { alt: true })}
${marketingPricingSection()}`,
  }),

  ...INDUSTRY_CARD_DATA.map((c) =>
    industryDetailPage({
      slug: c.href.replace('/industries/', '').replace('/', ''),
      title: c.title,
      heroTitle: c.title === 'Mining' ? 'AI for mining and technical businesses.' : `AI for ${c.title.toLowerCase()} businesses.`,
      heroLead: c.lead,
      roles: c.roles,
    })
  ),
];
