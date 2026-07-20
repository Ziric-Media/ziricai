/** Integration placeholders — scaffold for future connectors. */

export const INTEGRATIONS = [
  { id: 'google-calendar', name: 'Google Calendar', icon: 'fa-brands fa-google', category: 'Productivity', status: 'coming_soon' },
  { id: 'stripe', name: 'Stripe', icon: 'fa-brands fa-stripe', category: 'Payments', status: 'coming_soon' },
  { id: 'payfast', name: 'PayFast', icon: 'fa-solid fa-money-bill-transfer', category: 'Payments', status: 'coming_soon' },
  { id: 'hubspot', name: 'HubSpot', icon: 'fa-brands fa-hubspot', category: 'CRM', status: 'coming_soon' },
  { id: 'salesforce', name: 'Salesforce', icon: 'fa-brands fa-salesforce', category: 'CRM', status: 'coming_soon' },
  { id: 'zapier', name: 'Zapier', icon: 'fa-solid fa-bolt', category: 'Automation', status: 'coming_soon' },
  { id: 'slack', name: 'Slack', icon: 'fa-brands fa-slack', category: 'Communication', status: 'coming_soon' },
  { id: 'microsoft-teams', name: 'Microsoft Teams', icon: 'fa-brands fa-microsoft', category: 'Communication', status: 'coming_soon' },
  { id: 'xero', name: 'Xero', icon: 'fa-solid fa-file-invoice-dollar', category: 'Accounting', status: 'coming_soon' },
  { id: 'whatsapp-business', name: 'WhatsApp Business', icon: 'fa-brands fa-whatsapp', category: 'Messaging', status: 'connected' },
  { id: 'openai', name: 'OpenAI', icon: 'fa-solid fa-brain', category: 'AI', status: 'connected' },
  { id: 'firebase', name: 'Firebase', icon: 'fa-solid fa-fire', category: 'Infrastructure', status: 'connected' },
];

export function renderIntegrationsPanel() {
  const connected = INTEGRATIONS.filter((i) => i.status === 'connected');
  const upcoming = INTEGRATIONS.filter((i) => i.status === 'coming_soon');

  return `
    <div class="automation-integrations">
      <div class="integrations-section">
        <h4><i class="fa-solid fa-plug-circle-check"></i> Connected</h4>
        <div class="integration-grid">
          ${connected.map(renderIntegrationCard).join('')}
        </div>
      </div>
      <div class="integrations-section">
        <h4><i class="fa-solid fa-clock"></i> Coming Soon</h4>
        <div class="integration-grid">
          ${upcoming.map(renderIntegrationCard).join('')}
        </div>
      </div>
    </div>`;
}

function renderIntegrationCard(integration) {
  const badge = integration.status === 'connected'
    ? '<span class="integration-badge connected">Connected</span>'
    : '<span class="integration-badge coming-soon">Coming soon</span>';
  return `
    <div class="integration-card ${integration.status}">
      <div class="integration-icon"><i class="${integration.icon}"></i></div>
      <div class="integration-info">
        <strong>${integration.name}</strong>
        <span class="text-muted">${integration.category}</span>
      </div>
      ${badge}
    </div>`;
}
