/**
 * Pure Analytics view mapping — safe for Node verify scripts (no API/Firestore imports).
 */

/**
 * @param {object|null} data tenantMissionMetrics API payload
 */
export function mapTenantMetricsToAnalyticsView(data) {
  const counts = data?.counts || {};
  const availability = data?.metricAvailability || {};
  const pipeline = data?.pipeline || {};

  const metric = (value, availKey, { derived = false } = {}) => ({
    value: value ?? null,
    availability: derived ? 'derived' : availability[availKey] || 'unavailable',
  });

  return {
    companyId: data?.companyId || null,
    companyName: data?.companyName || null,
    dataSource: data?.dataSource || 'tenant_crm',
    kpis: {
      conversations: metric(counts.conversations, 'conversations'),
      activeConversations: metric(counts.activeConversations, 'activeConversations'),
      leads: metric(counts.leads, 'leads'),
      qualifiedLeads: metric(counts.qualifiedLeads, 'pipeline'),
      testDrives: metric(counts.testDrivesBooked, 'testDrivesBooked'),
      financeEnquiries: metric(counts.financeEnquiries, 'financeEnquiries'),
      dealsWon: metric(counts.dealsWon, 'pipeline'),
      messages: metric(counts.messagesTotal, 'messagesTotal'),
      humanTakeovers: metric(counts.humanTakeovers, 'humanTakeovers'),
      // Authoritative count lives on GET /api/companies/:id/ai-employees — not tenant metrics yet.
      aiEmployees: metric(null, 'aiEmployeesOnline'),
      revenue: metric(null, 'estimatedRevenue'),
      customerSatisfaction: metric(null, 'customerSatisfaction'),
      responseTime: metric(null, 'avgResponseTimeSec'),
      tokens: metric(null, 'openAiTokensUsed'),
    },
    pipeline: {
      new: pipeline.new ?? 0,
      contacted: pipeline.contacted ?? 0,
      qualified: pipeline.qualified ?? 0,
      proposal: pipeline.proposal ?? 0,
      won: pipeline.won ?? 0,
      lost: pipeline.lost ?? 0,
    },
    financeContext: Array.isArray(data?.financeContext) ? data.financeContext : [],
    hasOperationalData:
      (counts.customers || 0) > 0 ||
      (counts.leads || 0) > 0 ||
      (counts.conversations || 0) > 0 ||
      (counts.testDrivesBooked || 0) > 0,
  };
}

/** @param {{ value: number|null, availability: string }} kpi */
export function formatAnalyticsMetric(kpi) {
  if (!kpi || kpi.availability === 'unavailable' || kpi.value == null) {
    return '—';
  }
  return kpi.value;
}

/** Mirrors loadTenantAnalytics scope/error handling without network. */
export function resolveTenantAnalyticsLoadState(companyId, apiResult) {
  if (!companyId) {
    return { loadState: 'scope_required', view: null };
  }
  if (apiResult?.error) {
    return { loadState: 'error', view: null, error: apiResult.error };
  }
  const view = mapTenantMetricsToAnalyticsView(apiResult?.data);
  return { loadState: view.hasOperationalData ? 'ok' : 'empty', view };
}
