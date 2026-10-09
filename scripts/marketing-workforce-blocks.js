/** AI Employees, Solutions, Industries, Resources page blocks. */

import {
  productHero,
  platformIntro,
  platformDetail,
  platformSectionHeader,
  mktFinalCta,
  btnPrimary,
  btnOutlineLink,
  marketingPricingSection,
  platformBulletGrid,
  platformCardGrid,
  platformCategoryGrid,
} from './marketing-platform-blocks.js';

export {
  productHero,
  platformIntro,
  platformDetail,
  platformSectionHeader,
  mktFinalCta,
  btnPrimary,
  btnOutlineLink,
  marketingPricingSection,
  platformBulletGrid,
  platformCardGrid,
  platformCategoryGrid,
};

export function wfPage({ outPath, title, description, depth, activePath, bodyHtml, includeLanding = false }) {
  return {
    outPath,
    title: `${title} · ZiricAI`,
    description,
    depth,
    activePath,
    includePricing: true,
    includeLanding,
    bodyHtml,
  };
}

export function resourcesSarahCta() {
  return `<section class="section wf-resources-cta">
    <div class="container wf-resources-cta-inner">
        <h2>Still have questions?</h2>
        <p>Sarah is available to answer questions about ZiricAI, setup, AI Employees, pricing and the platform.</p>
        <button type="button" class="btn btn-glow" onclick="document.getElementById('sarahBubble')?.click()"><i class="fa-solid fa-comment-dots"></i> Ask Sarah</button>
    </div>
</section>`;
}

export function workforceEmployeeCard({
  name,
  role,
  department,
  tagline,
  skills = [],
  worksWith = [],
  availability = '24/7',
  experience = 'Pre-trained',
  ctaLabel,
  href = '#',
  avatarImg = '',
  avatarLetter = '',
}) {
  const avatar = avatarImg
    ? `<img src="${avatarImg}" alt="" width="48" height="48" class="wf-emp-avatar-img">`
    : `<span class="wf-emp-avatar-letter">${avatarLetter || name.charAt(0)}</span>`;
  const skillsHtml = skills.length
    ? `<div class="wf-emp-block"><h5>Skills</h5><ul>${skills.map((s) => `<li>${s}</li>`).join('')}</ul></div>`
    : '';
  const worksHtml = worksWith.length
    ? `<div class="wf-emp-block"><h5>Works with</h5><div class="wf-emp-tags">${worksWith.map((w) => `<span>${w}</span>`).join('')}</div></div>`
    : '';
  return `<article class="wf-employee-card">
        <div class="wf-emp-head">
            ${avatar}
            <div><h3>${role}</h3><span class="wf-emp-dept">${department}</span></div>
        </div>
        <p class="wf-emp-tagline">${tagline}</p>
        ${skillsHtml}
        ${worksHtml}
        <div class="wf-emp-meta">
            <div><strong>Availability</strong><span>${availability}</span></div>
            <div><strong>Experience</strong><span>${experience}</span></div>
        </div>
        <a href="${href}" class="wf-emp-hire" onclick="event.preventDefault(); launchWizard();">${ctaLabel || `Hire ${role}`} <i class="fa-solid fa-arrow-right"></i></a>
    </article>`;
}

export function workforceDepartmentGrid(departments) {
  return `<div class="wf-dept-grid">${departments
    .map(
      (d) => `<a class="wf-dept-card" href="${d.href}">
            <span class="wf-dept-emoji" aria-hidden="true">${d.emoji}</span>
            <h3>${d.title}</h3>
            <ul>${d.roles.map((r) => `<li>${r}</li>`).join('')}</ul>
            <span class="wf-dept-link">Explore ${d.title} <i class="fa-solid fa-arrow-right"></i></span>
        </a>`
    )
    .join('\n        ')}</div>`;
}

export function workforceJobDescriptionGrid() {
  const items = [
    { icon: 'fa-briefcase', title: 'Role', text: 'What the employee is responsible for.' },
    { icon: 'fa-wand-magic-sparkles', title: 'Skills', text: 'What it can do.' },
    { icon: 'fa-book', title: 'Knowledge', text: 'What it needs to know.' },
    { icon: 'fa-plug', title: 'Integrations', text: 'Which systems it can work with.' },
    { icon: 'fa-comments', title: 'Channels', text: 'Where customers and employees can interact with it.' },
    { icon: 'fa-list-check', title: 'Responsibilities', text: 'The work it can perform.' },
    { icon: 'fa-user-shield', title: 'Escalation Rules', text: 'When a human should take over.' },
  ];
  return `<div class="wf-jd-grid">${items
    .map(
      (i) => `<div class="wf-jd-card">
            <div class="wf-jd-icon"><i class="fa-solid ${i.icon}"></i></div>
            <h4>${i.title}</h4>
            <p>${i.text}</p>
        </div>`
    )
    .join('')}</div>`;
}

export function meetWorkforceSection({ assetPrefix = '../../' }) {
  const people = [
    { name: 'Sarah', role: 'AI Receptionist', letter: 'S', img: `${assetPrefix}assets/sarah-avatar.svg` },
    { name: 'Alex', role: 'Sales Consultant', letter: 'A' },
    { name: 'Maya', role: 'Customer Support', letter: 'M' },
    { name: 'David', role: 'HR Assistant', letter: 'D' },
    { name: 'Finance AI', role: 'Finance Assistant', letter: 'F' },
    { name: 'Legal AI', role: 'Legal Assistant', letter: 'L' },
    { name: 'Care AI', role: 'Medical Receptionist', letter: 'C' },
    { name: 'Education AI', role: 'School Administrator', letter: 'E' },
  ];
  return `<section class="section section-alt wf-meet-section">
    <div class="container">
        ${platformSectionHeader({
          title: 'Meet your new digital workforce.',
          subtitle: "These aren't generic tools. Each AI Employee has a role, responsibilities, skills, knowledge requirements and workflows designed around real business work.",
        })}
        <div class="wf-meet-grid">${people
          .map((p) => {
            const av = p.img
              ? `<img src="${p.img}" alt="" width="56" height="56">`
              : `<span class="wf-meet-letter">${p.letter}</span>`;
            return `<div class="wf-meet-card">${av}<strong>${p.name}</strong><span>${p.role}</span></div>`;
          })
          .join('\n            ')}</div>
        <p class="wf-meet-footer">Hire one employee. Or build an entire department.</p>
        <p class="marketing-detail-cta"><a href="/ai-employees/marketplace/" class="btn btn-glow">Browse All AI Employees <i class="fa-solid fa-arrow-right"></i></a></p>
    </div>
</section>`;
}

export function featuredEmployeeBlock({ title, subtitle, handles, example, icon = 'fa-star' }) {
  const handlesHtml = handles?.length
    ? `<ul class="wf-feature-list">${handles.map((h) => `<li><i class="fa-solid fa-check"></i> ${h}</li>`).join('')}</ul>`
    : '';
  const exampleHtml = example
    ? `<div class="platform-dialog-example wf-feature-example">${example}</div>`
    : '';
  return `<div class="wf-featured-employee">
        <div class="wf-featured-badge"><i class="fa-solid ${icon}"></i> Featured Employee</div>
        <h3>${title}</h3>
        ${subtitle ? `<p class="wf-featured-sub">${subtitle}</p>` : ''}
        ${handlesHtml ? `<h4>Handles</h4>${handlesHtml}` : ''}
        ${exampleHtml}
    </div>`;
}

export function employeeListBlock(employees) {
  return `<div class="wf-other-employees">${employees
    .map(
      (e) => `<article class="wf-other-card">
            <h4>${e.title}</h4>
            <p>${e.body}</p>
            ${e.list ? `<ul>${e.list.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
        </article>`
    )
    .join('\n        ')}</div>`;
}

export function wfHowItWorksSteps(steps) {
  return `<div class="wf-how-steps">${steps
    .map(
      (s) => `<article class="wf-how-step">
            <span class="wf-how-num">${s.num}</span>
            <div>
                <h4>${s.title}</h4>
                ${s.body ? `<p>${s.body}</p>` : ''}
                ${s.example ? `<div class="wf-how-example">${s.example}</div>` : ''}
                ${s.list ? `<ul>${s.list.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
            </div>
        </article>`
    )
    .join('\n        ')}</div>`;
}

export function wfFlowVertical(steps) {
  return `<div class="wf-flow-vertical">${steps
    .map(
      (s, i) => `${i ? '<div class="wf-flow-arrow"><i class="fa-solid fa-arrow-down"></i></div>' : ''}<div class="wf-flow-step"><span>${s}</span></div>`
    )
    .join('\n        ')}</div>`;
}

export function wfSolutionCards(cards) {
  return `<div class="wf-solution-grid">${cards
    .map(
      (c) => `<a class="wf-solution-card" href="${c.href}">
            <h3>${c.title}</h3>
            <p>${c.body}</p>
            <span class="wf-solution-link">${c.linkLabel || 'Explore'} <i class="fa-solid fa-arrow-right"></i></span>
        </a>`
    )
    .join('\n        ')}</div>`;
}

export function wfIndustryCards(cards) {
  return `<div class="wf-industry-grid">${cards
    .map(
      (c) => `<a class="wf-industry-card" href="${c.href}">
            <div class="wf-industry-icon"><i class="fa-solid ${c.icon}"></i></div>
            <h3>${c.title}</h3>
            <p>${c.lead}</p>
            ${c.roles ? `<p class="wf-industry-roles"><strong>AI Employees:</strong> ${c.roles.join(' · ')}</p>` : ''}
            <span class="wf-industry-link">Explore ${c.title.split(' ')[0]} <i class="fa-solid fa-arrow-right"></i></span>
        </a>`
    )
    .join('\n        ')}</div>`;
}

export function wfGuideGrid(guides) {
  return `<div class="wf-guide-grid">${guides
    .map(
      (g) => `<article class="wf-guide-card">
            <h3>${g.title}</h3>
            <p>${g.body}</p>
            <a href="${g.href || '/resources/guides/'}" class="wf-guide-link">Read guide <i class="fa-solid fa-arrow-right"></i></a>
        </article>`
    )
    .join('\n        ')}</div>`;
}

export function wfDocNav(sections) {
  return `<div class="wf-doc-nav">${sections
    .map(
      (s) => `<div class="wf-doc-section">
            <h4>${s.title}</h4>
            <ul>${s.items.map((i) => `<li>${i}</li>`).join('')}</ul>
        </div>`
    )
    .join('\n        ')}</div>`;
}

export function wfTrustStatement(text) {
  return `<div class="wf-trust-statement"><p>${text}</p></div>`;
}

export function wfStagePipeline(stages) {
  return `<div class="wf-stage-pipeline">${stages
    .map(
      (s, i) => `${i ? '<div class="wf-stage-arrow"><i class="fa-solid fa-arrow-down"></i></div>' : ''}<div class="wf-stage"><h4>${s.title}</h4><p>${s.body}</p></div>`
    )
    .join('\n        ')}</div>`;
}

export const WF_DEPARTMENTS = [
  {
    emoji: '🏢',
    title: 'Administration',
    href: '/ai-employees/administration/',
    roles: ['AI Receptionist', 'Executive Assistant', 'Appointment Coordinator', 'Data & Operations Assistant'],
  },
  {
    emoji: '💼',
    title: 'Sales',
    href: '/ai-employees/sales/',
    roles: ['Sales Consultant', 'Lead Qualification Assistant', 'Sales Development Assistant', 'Quotation Assistant'],
  },
  {
    emoji: '🎧',
    title: 'Customer Support',
    href: '/ai-employees/customer-support/',
    roles: ['Customer Support Agent', 'Order Support Assistant', 'Returns Assistant', 'Customer Success Assistant'],
  },
  {
    emoji: '👥',
    title: 'Human Resources',
    href: '/ai-employees/human-resources/',
    roles: ['HR Assistant', 'Recruitment Assistant', 'Onboarding Assistant', 'Employee Support Assistant'],
  },
  {
    emoji: '💰',
    title: 'Finance',
    href: '/ai-employees/finance/',
    roles: ['Finance Assistant', 'Accounts Assistant', 'Invoicing Assistant', 'Collections Assistant'],
  },
  {
    emoji: '⚖️',
    title: 'Legal',
    href: '/ai-employees/legal/',
    roles: ['Legal Assistant', 'Client Intake Assistant', 'Legal Research Assistant', 'Document Assistant'],
  },
  {
    emoji: '🏥',
    title: 'Healthcare',
    href: '/ai-employees/healthcare/',
    roles: ['Medical Receptionist', 'Patient Support Assistant', 'Dental Assistant', 'Healthcare Administration Assistant'],
  },
  {
    emoji: '🎓',
    title: 'Education',
    href: '/ai-employees/education/',
    roles: ['School Administrator', 'Admissions Officer', 'Student Support Assistant', 'Education Enquiries Assistant'],
  },
];
