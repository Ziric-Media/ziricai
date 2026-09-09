/**
 * Mission Control WhatsApp integration display helpers (B-MC-5c-2c).
 * Uses whatsappIntegration summary from Platform API — never company.whatsappConnected.
 */

export const WA_STATUS_PENDING = 'pending_configuration';
export const WA_STATUS_ACTIVE = 'active';
export const WA_STATUS_CONNECTED = 'connected';
export const WA_STATUS_DISCONNECTED = 'disconnected';

const ACTIVE_STATUSES = new Set([WA_STATUS_ACTIVE, WA_STATUS_CONNECTED]);

export function isActiveIntegrationStatus(status) {
  return ACTIVE_STATUSES.has(String(status || '').toLowerCase());
}

/** Compact table label from company.whatsappIntegration. */
export function whatsappIntegrationTableLabel(company) {
  const wa = company?.whatsappIntegration;
  if (!wa?.status) return 'Not registered';

  const status = String(wa.status).toLowerCase();
  if (status === WA_STATUS_PENDING) return 'Pending';
  if (status === WA_STATUS_DISCONNECTED) return 'Disconnected';
  if (isActiveIntegrationStatus(status)) {
    if (wa.runtimeReady === false) return 'Active · Runtime not ready';
    return 'Active';
  }
  return status.replace(/_/g, ' ');
}

export function whatsappIntegrationTableIconClass(company) {
  const label = whatsappIntegrationTableLabel(company);
  if (label === 'Active') return 'wa-active';
  if (label.startsWith('Active ·')) return 'wa-active-warn';
  if (label === 'Pending') return 'wa-pending';
  if (label === 'Disconnected') return 'wa-disconnected';
  return 'wa-none';
}

export function credentialsSourceLabel(source) {
  if (source === 'env') return 'Environment (server-managed)';
  if (source === 'tenant') return 'Tenant-managed (not available in pilot)';
  if (source === null || source === undefined || source === '') return 'Not configured';
  return String(source);
}

const MISSING_LABELS = {
  phoneNumberId: 'Phone number ID is required',
  'env.PHONE_NUMBER_ID': 'Server PHONE_NUMBER_ID is not configured',
  'env.WHATSAPP_TOKEN': 'Server WHATSAPP_TOKEN is not configured',
  phoneNumberId_env_mismatch: 'Phone number ID does not match server environment',
  tenant_credentials_not_configured: 'Tenant credentials are not configured',
  credentialsSource: 'Credentials source is not configured',
};

export function humanizeMissingRequirement(key) {
  return MISSING_LABELS[key] || String(key).replace(/_/g, ' ');
}

export function integrationCardState(integration, runtimeReady, missing = []) {
  if (!integration) return 'not_registered';
  const status = String(integration.status || '').toLowerCase();
  if (status === WA_STATUS_PENDING) return 'pending';
  if (status === WA_STATUS_DISCONNECTED) return 'disconnected';
  if (isActiveIntegrationStatus(status)) {
    return runtimeReady === false ? 'active_not_ready' : 'active_ready';
  }
  return 'unknown';
}
