/** B-MC-2 display helpers — no Firestore/browser imports (safe for Node verify scripts). */

export const PRIMARY_PILOT_TENANT_ID = 'central-motors-rtb';

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
      (company?.whatsappConnected === true && channelWhatsapp);

    return {
      ...agent,
      whatsappConnected: whatsappConnected || false,
      conversations: agent.conversations ?? null,
    };
  });
}
