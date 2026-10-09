/**
 * Site-wide marketing navigation (ZIRICAI.COM IA).
 * Dropdown hrefs are canonical URLs for current + future subpages.
 */

export const MARKETING_NAV = [
  { id: 'home', label: 'Home', href: '/', home: true },
  {
    id: 'platform',
    label: 'Platform',
    href: '/platform/',
    children: [
      { type: 'group', label: 'Core Platform' },
      { label: 'AI Business OS', href: '/platform/' },
      { label: 'Knowledge Base', href: '/products/knowledge/' },
      { label: 'CRM', href: '/products/crm/' },
      { label: 'Automation', href: '/products/automation/' },
      { label: 'Analytics', href: '/products/analytics/' },
      { label: 'Mission Control', href: '/products/dashboards/' },
      { type: 'group', label: 'Connect' },
      { label: 'Integrations', href: '/platform/integrations/' },
      { type: 'group', label: 'Channels' },
      { label: 'WhatsApp', href: '/platform/whatsapp/' },
      { label: 'Webchat', href: '/platform/webchat/' },
    ],
  },
  {
    id: 'ai-employees',
    label: 'AI Employees',
    href: '/ai-employees/marketplace/',
    children: [
      { label: 'Browse AI Employees', href: '/ai-employees/marketplace/' },
      { label: 'How It Works', href: '/ai-employees/how-it-works/' },
      { label: 'Administration', href: '/ai-employees/administration/' },
      { label: 'Sales', href: '/ai-employees/sales/' },
      { label: 'Customer Support', href: '/ai-employees/customer-support/' },
      { label: 'Human Resources', href: '/ai-employees/human-resources/' },
      { label: 'Finance', href: '/ai-employees/finance/' },
      { label: 'Legal', href: '/ai-employees/legal/' },
      { label: 'Healthcare', href: '/ai-employees/healthcare/' },
      { label: 'Education', href: '/ai-employees/education/' },
    ],
  },
  {
    id: 'solutions',
    label: 'Solutions',
    href: '/solutions/',
    children: [
      { label: 'Customer Service', href: '/solutions/customer-service/' },
      { label: 'Sales', href: '/solutions/sales/' },
      { label: 'Operations', href: '/solutions/operations/' },
      { label: 'Enterprise', href: '/solutions/enterprise/' },
      { label: 'Small Business', href: '/solutions/small-business/' },
      { label: 'Growing Business', href: '/solutions/growing-business/' },
    ],
  },
  {
    id: 'industries',
    label: 'Industries',
    href: '/industries/',
    children: [
      { label: 'Automotive', href: '/industries/automotive/' },
      { label: 'Mining', href: '/industries/mining/' },
      { label: 'Healthcare', href: '/industries/healthcare/' },
      { label: 'Education', href: '/industries/education/' },
      { label: 'Legal', href: '/industries/legal/' },
      { label: 'Retail', href: '/industries/retail/' },
      { label: 'Hospitality', href: '/industries/hospitality/' },
      { label: 'View All Industries', href: '/industries/all/' },
    ],
  },
  { id: 'pricing', label: 'Pricing', href: '/pricing/' },
  {
    id: 'resources',
    label: 'Resources',
    href: '/resources/guides/',
    children: [
      { label: 'Guides', href: '/resources/guides/' },
      { label: 'FAQ', href: '/resources/faq/' },
      { label: 'Documentation', href: '/resources/documentation/' },
      { label: 'Security', href: '/resources/security/' },
    ],
  },
];

/** Normalize for active-state checks (trailing slash, no hash). */
export function normalizeNavPath(href) {
  if (!href || href.startsWith('http') || href.endsWith('.html')) return href;
  if (href === '/') return '/';
  return href.endsWith('/') ? href : `${href}/`;
}

export function pathFromOutPath(outPath) {
  const dir = outPath.replace(/index\.html$/, '');
  return normalizeNavPath(`/${dir}`);
}

function isActive(path, href) {
  const p = normalizeNavPath(path);
  const h = normalizeNavPath(href);
  if (h === '/') return p === '/';
  return p === h || p.startsWith(h);
}

function sectionActive(path, item) {
  if (isActive(path, item.href)) return true;
  return (item.children || []).some((c) => c.href && isActive(path, c.href));
}

function linkClass(path, href, extra = '') {
  return isActive(path, href) ? `nav-active ${extra}`.trim() : extra.trim();
}

/**
 * @param {object} opts
 * @param {string} [opts.activePath='/']
 */
export function renderMarketingNavLinks({ activePath = '/' } = {}) {
  const path = normalizeNavPath(activePath);
  const parts = [];

  for (const item of MARKETING_NAV) {
    if (item.home) {
      parts.push(
        `<a href="/" class="nav-link nav-home ${linkClass(path, '/')}"><i class="fa-solid fa-house" aria-hidden="true"></i><span>Home</span></a>`
      );
      continue;
    }

    if (item.children?.length) {
      const open = sectionActive(path, item);
      const menu = item.children
        .map((c) => {
          if (c.type === 'group') {
            return `<div class="nav-dropdown-group" role="presentation"><span class="nav-dropdown-group-label">${c.label}</span></div>`;
          }
          return `<a href="${c.href}" class="nav-dropdown-item ${linkClass(path, c.href)}" role="menuitem">${c.label}</a>`;
        })
        .join('\n                    ');
      parts.push(`<div class="nav-dropdown${open ? ' is-open' : ''}${open ? ' nav-section-active' : ''}" data-nav-dropdown>
                <a href="${item.href}" class="nav-dropdown-toggle ${linkClass(path, item.href, 'nav-link')}" aria-haspopup="true" aria-expanded="${open ? 'true' : 'false'}">
                    ${item.label} <i class="fa-solid fa-chevron-down nav-chevron" aria-hidden="true"></i>
                </a>
                <div class="nav-dropdown-menu" role="menu">
                    ${menu}
                </div>
            </div>`);
      continue;
    }

    parts.push(`<a href="${item.href}" class="nav-link ${linkClass(path, item.href)}">${item.label}</a>`);
  }

  return parts.join('\n                ');
}

/** All leaf + hub paths for stub page generation. */
export function collectMarketingNavPaths() {
  const set = new Set(['/']);
  for (const item of MARKETING_NAV) {
    if (item.href && !item.href.endsWith('.html')) set.add(normalizeNavPath(item.href));
    for (const c of item.children || []) {
      if (c.href) set.add(normalizeNavPath(c.href));
    }
  }
  return [...set].sort();
}

export function outPathFromHref(href) {
  if (href === '/') return 'index.html';
  if (href.endsWith('.html')) return href.replace(/^\//, '');
  const slug = href.replace(/^\//, '').replace(/\/$/, '');
  return `${slug}/index.html`;
}

export function depthFromOutPath(outPath) {
  const segments = outPath.replace(/index\.html$/, '').split('/').filter(Boolean);
  return segments.length;
}
