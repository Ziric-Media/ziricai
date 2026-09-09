/** B-MC-2 display helpers — no Firestore/browser imports (safe for Node verify scripts). */

export const PRIMARY_PILOT_TENANT_ID = 'central-motors-rtb';

const ACTIVE_WHATSAPP_STATUSES = new Set(['active', 'connected']);

/** Integration-authoritative WhatsApp active state for a company list item (B-MC-5c-2d). */
export function isCompanyWhatsAppActive(company) {
  const wa = company?.whatsappIntegration;
  if (wa?.status) {
    return ACTIVE_WHATSAPP_STATUSES.has(String(wa.status).toLowerCase());
  }
  // Deprecated compatibility — platform GET whatsappConnected until all readers migrate.
  return company?.whatsappConnected === true;
}

/** Whether WhatsApp is enabled on an employee channel config (object or legacy array). */
export function isWhatsappChannelEnabled(agent) {
  const channels = agent?.channels;
  if (!channels) return false;
  if (Array.isArray(channels)) return channels.includes('whatsapp');
  return channels.whatsapp !== false && Boolean(channels.whatsapp);
}

/**
 * Enrich tenant API employees for Mission Control display — no invented KPI fields.
 * WhatsApp "Connected" derives from company integration when the employee record omits it.
 */
export function enrichAgentsForDisplay(items, { companyId = null, companies = [] } = {}) {
  const company =
    companies.find((c) => c.id === companyId) ||
    (items[0]?.companyId ? companies.find((c) => c.id === items[0].companyId) : null);

  return (items || []).map((agent) => {
    const channelWhatsapp = isWhatsappChannelEnabled(agent);
    const whatsappConnected =
      agent.whatsappConnected === true ||
      (isCompanyWhatsAppActive(company) && channelWhatsapp);

    return {
      ...agent,
      whatsappConnected: whatsappConnected || false,
      conversations: agent.conversations ?? null,
    };
  });
}
