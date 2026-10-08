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
      { label: 'WhatsApp', href: '/platform/whatsapp/' },
      { label: 'Email', href: '/platform/email/' },
      { label: 'Messenger', href: '/platform/messenger/' },
      { label: 'Instagram', href: '/platform/instagram/' },
      { label: 'Webchat', href: '/platform/webchat/' },
    ],
  },
  {
    id: 'ai-employees',
    label: 'AI Employees',
    href: '/ai-employees/how-it-works/',
    children: [
      { label: 'How AI Employees Work', href: '/ai-employees/how-it-works/' },
      { label: 'AI Employee Marketplace', href: '/ai-employees/marketplace/' },
      { label: 'Industries', href: '/ai-employees/industries/' },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    href: '/products/crm/',
    children: [
      { label: 'CRM', href: '/products/crm/' },
      { label: 'Automation', href: '/products/automation/' },
      { label: 'Knowledge', href: '/products/knowledge/' },
      { label: 'Analytics', href: '/products/analytics/' },
      { label: 'Dashboards', href: '/products/dashboards/' },
    ],
  },
  {
    id: 'solutions',
    label: 'Solutions',
    href: '/solutions/',
    children: [
      { label: 'Automotive', href: '/solutions/automotive/' },
      { label: 'Construction', href: '/solutions/construction/' },
      { label: 'Mining', href: '/solutions/mining/' },
      { label: 'Retail', href: '/solutions/retail/' },
      { label: 'Professional Services', href: '/solutions/professional-services/' },
      { label: 'Healthcare', href: '/solutions/healthcare/' },
      { label: 'Education', href: '/solutions/education/' },
      { label: 'All industries', href: '/solutions/' },
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
      { label: 'AI Resources', href: '/resources/ai-resources/' },
    ],
  },
  { id: 'login', label: 'Login', href: '/login.html' },
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
  return (item.children || []).some((c) => isActive(path, c.href));
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

    if (item.id === 'login') {
      parts.push(`<a href="/login.html" class="nav-link nav-login ${linkClass(path, '/login.html')}">${item.label}</a>`);
      continue;
    }

    if (item.children?.length) {
      const open = sectionActive(path, item);
      const menu = item.children
        .map(
          (c) =>
            `<a href="${c.href}" class="nav-dropdown-item ${linkClass(path, c.href)}" role="menuitem">${c.label}</a>`
        )
        .join('\n                    ');
      parts.push(`<div class="nav-dropdown${open ? ' is-open' : ''}${open ? ' nav-section-active' : ''}" data-nav-dropdown>
                <a href="${item.href}" class="nav-dropdown-toggle ${linkClass(path, item.href, 'nav-link')}" aria-haspopup="true" aria-expanded="${open ? 'true' : 'false'}">
                    <span>${item.label}</span><i class="fa-solid fa-chevron-down nav-chevron" aria-hidden="true"></i>
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
      set.add(normalizeNavPath(c.href));
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
