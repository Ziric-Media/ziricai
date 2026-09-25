import { escapeHtml } from '../../admin/ui.js';
import { mountSarahChat, SARAH_CAPABILITIES, SUGGESTIONS, initPortalSarah } from '../sarah/sarah-ui.js';

export async function renderSarah(container) {
  initPortalSarah();
  container.innerHTML = `
    <div class="portal-sarah-page">
      <aside class="portal-sarah-page-aside" aria-label="Sarah assistant info">
        <div class="portal-sarah-page-brand">
          <div class="portal-sarah-page-avatar" aria-hidden="true"><i class="fa-solid fa-sparkles"></i></div>
          <div>
            <h2 class="portal-sarah-page-title">Sarah</h2>
            <p class="portal-sarah-page-subtitle">AI Operating Assistant</p>
          </div>
        </div>
        <p class="portal-sarah-page-intro">
          Full-screen chat so you can read replies, tool results, and next steps clearly. Sarah can operate your workspace on your behalf when you ask.
        </p>
        <h3 class="portal-sarah-page-aside-heading">Can help with</h3>
        <ul class="portal-sarah-cap-list">
          ${SARAH_CAPABILITIES.map(
            (c) =>
              `<li><i class="fa-solid ${escapeHtml(c.icon)}"></i><span>${escapeHtml(c.label)}</span></li>`
          ).join('')}
        </ul>
        <h3 class="portal-sarah-page-aside-heading">Try asking</h3>
        <ul class="portal-sarah-try-list">
          ${SUGGESTIONS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </aside>
      <section class="portal-sarah-page-main" aria-label="Chat with Sarah">
        <header class="portal-sarah-page-main-header">
          <div>
            <strong>Conversation</strong>
            <span class="text-muted">Shift+Enter for a new line · Enter to send</span>
          </div>
        </header>
        <div class="portal-sarah-page-chat" id="portalSarahPageChat"></div>
      </section>
    </div>
  `;

  const chatRoot = container.querySelector('#portalSarahPageChat');
  if (chatRoot) {
    mountSarahChat(chatRoot, { mode: 'page' });
    chatRoot.querySelector('#portalSarahInput')?.focus();
  }
}
