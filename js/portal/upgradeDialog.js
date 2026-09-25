/**
 * Plan-upgrade dialog for Marketplace packs and paid integrations.
 */
import { escapeHtml } from '../admin/ui.js';
import { navigateTo } from './router.js';

const HOST_ID = 'portalUpgradeDialog';

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   featureLabel?: string,
 *   confirmLabel?: string,
 * }} [opts]
 */
export function showUpgradeDialog(opts = {}) {
  const title = opts.title || 'Upgrade required';
  const featureLabel = opts.featureLabel || '';
  const message =
    opts.message ||
    (featureLabel
      ? `${featureLabel} is available on a higher plan. Upgrade your subscription to unlock it.`
      : 'This feature is available on a higher plan. Upgrade your subscription to unlock it.');
  const confirmLabel = opts.confirmLabel || 'View billing plans';

  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'portal-upgrade-overlay';
    document.body.appendChild(host);
  }

  host.innerHTML = `
    <div class="portal-upgrade-backdrop" data-upgrade-close="1"></div>
    <div class="portal-upgrade-panel" role="dialog" aria-modal="true" aria-labelledby="portalUpgradeTitle">
      <button type="button" class="portal-upgrade-close" data-upgrade-close="1" aria-label="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div class="portal-upgrade-icon"><i class="fa-solid fa-crown"></i></div>
      <h3 id="portalUpgradeTitle">${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="portal-upgrade-actions">
        <button type="button" class="btn btn-secondary" data-upgrade-close="1">Not now</button>
        <button type="button" class="btn btn-primary" id="portalUpgradeConfirm">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(confirmLabel)}
        </button>
      </div>
    </div>`;

  host.classList.add('open');

  const close = () => {
    host.classList.remove('open');
    host.innerHTML = '';
  };

  host.querySelectorAll('[data-upgrade-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.currentTarget.dataset.upgradeClose) close();
    });
  });

  host.querySelector('#portalUpgradeConfirm')?.addEventListener('click', () => {
    close();
    navigateTo('billing');
  });
}

export function marketplaceUpgradeMessage(packName) {
  const label = packName ? `"${packName}"` : 'This AI employee package';
  return `${label} is not included in your current plan. Upgrade to a higher tier to unlock additional AI employee packages from the Marketplace. Your current plan already includes the packages provisioned for your tier.`;
}

export function integrationUpgradeMessage(integrationName) {
  const label = integrationName ? `"${integrationName}"` : 'This integration';
  return `${label} requires a higher plan. WhatsApp is included with your workspace — upgrade to unlock additional channels and third-party integrations.`;
}
