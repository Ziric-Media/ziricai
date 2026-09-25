const ACTIVE_WHATSAPP_STATUSES = new Set(['active', 'connected']);

/** Portal WhatsApp row from tenant integration API (never uses phoneNumberId). */
export function formatPortalWhatsAppDisplay(integrations = []) {
  const wa =
    integrations.find((i) => i.provider === 'whatsapp' || i.channel === 'whatsapp') ||
    integrations[0];
  if (!wa?.status) {
    return { phone: '—', statusText: 'Not registered', icon: '⚠️' };
  }
  const status = String(wa.status).toLowerCase();
  const phone = wa.displayPhoneNumber || '—';
  if (ACTIVE_WHATSAPP_STATUSES.has(status)) {
    return { phone, statusText: 'Active', icon: '✅' };
  }
  if (status === 'pending_configuration' || status === 'pending') {
    return { phone, statusText: 'Pending configuration', icon: '⚠️' };
  }
  if (status === 'disconnected') {
    return { phone, statusText: 'Disconnected', icon: '⚠️' };
  }
  return { phone, statusText: status, icon: '⚠️' };
}
