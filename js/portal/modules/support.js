import { escapeHtml, pageHeader } from '../../admin/ui.js';
import { renderQuickActions } from '../core/widgets/quickActions.js';

const FAQ = [
  { q: 'How do I connect WhatsApp?', a: 'Open Integrations or ask Sarah: "Connect WhatsApp". You will need your Meta Business credentials.' },
  { q: 'How do I add an AI Employee?', a: 'Go to AI Employees → Create, or ask Sarah to create one for your department.' },
  { q: 'Where is my billing history?', a: 'Billing shows invoices, plan usage, and renewal dates for your tenant.' },
  { q: 'Can I invite team members?', a: 'Owners and managers can invite users from Team with role-based permissions.' },
];

export async function renderSupport(container) {
  container.innerHTML = `
    ${pageHeader('Support', 'Help center, FAQs, and contact options for your company portal.')}
    ${renderQuickActions([
      { label: 'Email Support', icon: 'fa-envelope', action: 'email', color: 'blue' },
      { label: 'View Documentation', icon: 'fa-book-open', action: 'docs', color: 'purple' },
      { label: 'Ask Sarah', icon: 'fa-sparkles', action: 'sarah', color: 'green' },
    ])}
    <div class="bos-support-grid">
      <div class="panel-card bos-panel">
        <div class="panel-header"><h3><i class="fa-solid fa-circle-question"></i> FAQ</h3></div>
        <div class="bos-faq-list">
          ${FAQ.map((item) => `
            <details class="bos-faq-item">
              <summary>${escapeHtml(item.q)}</summary>
              <p>${escapeHtml(item.a)}</p>
            </details>`).join('')}
        </div>
      </div>
      <div class="panel-card bos-panel">
        <div class="panel-header"><h3><i class="fa-solid fa-headset"></i> Contact</h3></div>
        <div class="bos-support-contact">
          <p><strong>Email:</strong> support@ziricai.com</p>
          <p><strong>Hours:</strong> Mon–Fri, 8:00–17:00 SAST</p>
          <p><strong>Priority:</strong> Business plan includes same-day response.</p>
        </div>
      </div>
    </div>
  `;

  container.querySelector('[data-action="email"]')?.addEventListener('click', () => {
    window.location.href = 'mailto:support@ziricai.com?subject=Company%20Portal%20Support';
  });

  container.querySelector('[data-action="docs"]')?.addEventListener('click', () => {
    window.open('docs/architecture/PORTAL_BOS.md', '_blank');
  });

  container.querySelector('[data-action="sarah"]')?.addEventListener('click', async () => {
    const { openPortalSarah } = await import('../sarah/sarah-ui.js');
    openPortalSarah();
  });
}
