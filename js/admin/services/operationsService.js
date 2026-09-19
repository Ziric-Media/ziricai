/**
 * Operations Center service — API-first with authenticated platform requests.
 * Phase 2B-1 / 2B-1.1: Firebase Bearer via apiRequest; no silent demo KPI mixing.
 */
import { fetchHealth } from '../api.js';
import { apiRequest } from '../../shared/apiRequest.js';

const PRIMARY_TENANT = 'central-motors-rtb';

const UNAVAILABLE_AVAILABILITY = {
  customers: 'unavailable',
  leads: 'unavailable',
  pipeline: 'unavailable',
  conversations: 'unavailable',
  activeConversations: 'unavailable',
  messagesTotal: 'unavailable',
  messagesToday: 'unavailable',
  humanTakeovers: 'unavailable',
  testDrivesBooked: 'unavailable',
  financeEnquiries: 'unavailable',
  estimatedRevenue: 'unavailable',
  customerSatisfaction: 'unavailable',
  avgResponseTimeSec: 'unavailable',
  aiSuccessRate: 'unavailable',
  aiEmployeesOnline: 'unavailable',
  companiesOnline: 'unavailable',
  openAiTokensUsed: 'unavailable',
};

function metricsQuery() {
  return `/api/operations/metrics?companyId=${encodeURIComponent(PRIMARY_TENANT)}`;
}

function activityQuery() {
  return `/api/operations/activity?companyId=${encodeURIComponent(PRIMARY_TENANT)}`;
}

async function request(path) {
  const result = await apiRequest(path, { silent: true });
  if (result.error) {
    console.warn('[operationsService]', path, result.error, result.status || '');
    return { error: result.error, status: result.status || null, data: null };
  }
  return { error: null, status: 200, data: result.data };
}

function isDemoAvailability(metricAvailability = {}) {
  return Object.values(metricAvailability).some((value) => value === 'demo');
}

function resolveDataSource(data) {
  if (!data) return 'unavailable';
  if (data.dataSource === 'crm' || data.dataSources?.crm === 'tenant_crm_apis') return 'crm';
  if (data.tenantMetrics || data.isDemo === false) return 'crm';
  if (data.isDemo === true || isDemoAvailability(data.metricAvailability)) return 'demo';
  return 'partial';
}

function stripDemoMetrics(metrics = {}, metricAvailability = {}) {
  const cleaned = { ...metrics };
  for (const [key, availability] of Object.entries(metricAvailability)) {
    if (availability === 'demo') {
      cleaned[key] = null;
    }
  }
  return cleaned;
}

function buildUnavailableMetricsBundle({ authStatus = 'api-unavailable', source = 'api-unavailable' } = {}) {
  return {
    metrics: {},
    trends: {},
    metricAvailability: { ...UNAVAILABLE_AVAILABILITY },
    leaderboards: { agents: [], companies: [] },
    trendingQuestions: [],
    humanTakeovers: [],
    hourlyConversations: Array.from({ length: 24 }, () => null),
    queue: null,
    storage: null,
    isDemo: false,
    dataSource: 'crm',
    companyId: PRIMARY_TENANT,
    primaryCompanyId: PRIMARY_TENANT,
    tenantMetrics: null,
    dataSources: { primaryTenant: PRIMARY_TENANT, crm: 'unavailable', demoCentralMotorsUsed: false },
    authStatus,
    authRequired: authStatus === 'unauthenticated',
    authForbidden: authStatus === 'unauthorized',
    apiError: authStatus === 'api-error',
    crmEmpty: authStatus === 'crm-empty',
    source,
  };
}

function normalizeMetricsPayload(data, { source = 'api' } = {}) {
  if (!data?.metrics) {
    return buildUnavailableMetricsBundle({ authStatus: 'crm-empty', source });
  }

  const dataSource = resolveDataSource(data);
  const metricAvailability = data.metricAvailability || {};
  const metrics =
    dataSource === 'demo' && data.primaryCompanyId === PRIMARY_TENANT
      ? stripDemoMetrics(data.metrics, metricAvailability)
      : data.metrics;

  const availability =
    dataSource === 'demo' && data.primaryCompanyId === PRIMARY_TENANT
      ? {
          ...UNAVAILABLE_AVAILABILITY,
          ...Object.fromEntries(
            Object.entries(metricAvailability).map(([key, value]) => [
              key,
              value === 'demo' ? 'unavailable' : value,
            ])
          ),
        }
      : { ...UNAVAILABLE_AVAILABILITY, ...metricAvailability };

  return {
    metrics,
    trends: data.trends || {},
    metricAvailability: availability,
    leaderboards: data.leaderboards || { agents: [], companies: [] },
    trendingQuestions: data.trendingQuestions || [],
    humanTakeovers: data.humanTakeovers || [],
    hourlyConversations: data.hourlyConversations || Array.from({ length: 24 }, () => null),
    queue: data.queue || null,
    storage: data.storage || null,
    isDemo: dataSource === 'demo',
    dataSource: dataSource === 'demo' ? 'crm' : dataSource,
    companyId: data.primaryCompanyId || PRIMARY_TENANT,
    primaryCompanyId: data.primaryCompanyId || PRIMARY_TENANT,
    tenantMetrics: data.tenantMetrics || null,
    dataSources: data.dataSources || null,
    authStatus: 'authenticated',
    authRequired: false,
    authForbidden: false,
    apiError: false,
    crmEmpty: !data.tenantMetrics,
    source,
  };
}

function resolveAuthStatusFromResponse(status) {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'unauthorized';
  if (status >= 500) return 'api-error';
  if (status === null || status === undefined) return 'api-error';
  return 'api-unavailable';
}

export async function getMetrics() {
  const { data, error, status } = await request(metricsQuery());
  if (!data) {
    return buildUnavailableMetricsBundle({
      authStatus: resolveAuthStatusFromResponse(status),
      source: error ? 'api-error' : 'api-unavailable',
    });
  }
  const bundle = normalizeMetricsPayload(data, { source: 'api' });
  if (!bundle.tenantMetrics && bundle.dataSource === 'crm' && !bundle.isDemo) {
    return { ...bundle, authStatus: 'authenticated', crmEmpty: true };
  }
  return bundle;
}

export async function getActivityFeed() {
  const { data } = await request(activityQuery());
  if (data?.items?.length) {
    return {
      items: data.items,
      isDemo: Boolean(data.isDemo),
      dataQuality: data.dataQuality || (data.isDemo ? 'demo' : 'real'),
      primaryCompanyId: data.primaryCompanyId || PRIMARY_TENANT,
      source: 'api',
    };
  }
  return {
    items: [],
    isDemo: false,
    dataQuality: 'unavailable',
    primaryCompanyId: PRIMARY_TENANT,
    source: 'empty',
  };
}

export async function getLeaderboards(metricsBundle) {
  const bundle = metricsBundle || (await getMetrics());
  return {
    agents: bundle.leaderboards?.agents || [],
    companies: bundle.leaderboards?.companies || [],
    trendingQuestions: bundle.trendingQuestions || [],
    humanTakeovers: bundle.humanTakeovers || [],
  };
}

export async function getSystemHealth() {
  const [healthRes, metricsResult] = await Promise.all([
    fetchHealth(),
    request(metricsQuery()),
  ]);

  const health = healthRes.data || {};
  const metricsData = metricsResult.data;
  const queue = health.queue || metricsData?.queue || { pending: 0, active: 0 };
  const storage = health.storage || metricsData?.storage || 'demo';

  let firebaseStatus = 'demo';
  if (storage === 'firestore') firebaseStatus = 'connected';
  else if (storage === 'memory') firebaseStatus = health.status === 'ok' ? 'demo' : 'offline';

  return {
    whatsapp: Boolean(health.whatsapp),
    openai: Boolean(health.openai),
    firebase: firebaseStatus,
    queue: {
      pending: queue.pending ?? 0,
      active: queue.active ?? 0,
      concurrency: queue.concurrency ?? 1,
    },
    timestamp: health.timestamp || new Date().toISOString(),
  };
}

export async function getTenantMetrics(companyId = PRIMARY_TENANT) {
  return request(`/api/operations/tenant/${encodeURIComponent(companyId)}/metrics`);
}

function platformDashboardPath(selectedCompanyId) {
  if (selectedCompanyId) {
    return `/api/operations/platform-dashboard?scope=tenant&companyId=${encodeURIComponent(selectedCompanyId)}`;
  }
  return '/api/operations/platform-dashboard?scope=platform';
}

function availabilityForValue(value) {
  if (value == null || Number.isNaN(Number(value))) return 'unavailable';
  return 'real';
}

function normalizePlatformDashboardPayload(data) {
  return {
    mode: 'platform',
    scope: 'platform',
    census: data.tenantCensus || null,
    pilotSpotlight: data.pilotSpotlight || null,
    platformHealth: data.platformHealth || null,
    registryKpis: data.kpis?.registry || null,
    operationalMeta: data.kpis?.operational || null,
    activity: data.activity || { items: [], isDemo: false },
    meta: data.meta || {},
    authRequired: false,
    authForbidden: false,
    apiError: false,
    source: 'platform-dashboard-api',
  };
}

function normalizeTenantDashboardPayload(data) {
  const kpis = data.kpis || {};
  const ops = kpis.ops || {};
  const metrics = kpis.metrics || {};
  const quickStats = kpis.quickStats || {};
  const companyId = data.meta?.companyId || data.company?.id || null;

  const mappedMetrics = {
    activeConversations: ops.inbox?.unread ?? metrics.activeConversations ?? null,
    crmLeads: ops.crm?.leads ?? null,
    crmQualifiedLeads: metrics.qualifiedLeads ?? null,
    crmTestDrivesBooked: ops.appointments?.today ?? null,
    crmFinanceEnquiries: metrics.financeEnquiries ?? null,
    crmDealsWon: metrics.dealsWon ?? null,
    messagesTotal: metrics.messagesTotal ?? quickStats.messagesTotal ?? null,
    humanTakeovers: metrics.humanTakeovers ?? null,
    aiEmployeesOnline: metrics.aiEmployeesOnline ?? null,
    estimatedRevenue: metrics.estimatedRevenue ?? null,
  };

  const metricAvailability = {
    ...UNAVAILABLE_AVAILABILITY,
    activeConversations: availabilityForValue(mappedMetrics.activeConversations),
    leads: availabilityForValue(mappedMetrics.crmLeads),
    pipeline: availabilityForValue(mappedMetrics.crmQualifiedLeads ?? mappedMetrics.crmDealsWon),
    testDrivesBooked: availabilityForValue(mappedMetrics.crmTestDrivesBooked),
    financeEnquiries: availabilityForValue(mappedMetrics.crmFinanceEnquiries),
    messagesTotal: availabilityForValue(mappedMetrics.messagesTotal),
    humanTakeovers: availabilityForValue(mappedMetrics.humanTakeovers),
    aiEmployeesOnline: availabilityForValue(mappedMetrics.aiEmployeesOnline),
    estimatedRevenue: 'unavailable',
  };

  return {
    mode: 'tenant',
    scope: 'tenant',
    companyId,
    company: data.company || null,
    metrics: mappedMetrics,
    trends: {},
    metricAvailability,
    leaderboards: { agents: [], companies: [] },
    trendingQuestions: [],
    humanTakeovers: [],
    hourlyConversations: Array.from({ length: 24 }, () => null),
    queue: null,
    storage: null,
    isDemo: Boolean(data.activity?.isDemo),
    dataSource: 'portal_hub',
    primaryCompanyId: companyId,
    tenantMetrics: null,
    tenantHub: kpis,
    activity: data.activity || { items: [], isDemo: false },
    meta: data.meta || {},
    authRequired: false,
    authForbidden: false,
    apiError: false,
    source: 'platform-dashboard-api',
  };
}

function unavailablePlatformDashboardView(selectedCompanyId, authStatus) {
  const base = buildUnavailableMetricsBundle({ authStatus, source: 'platform-dashboard-api' });
  return {
    ...base,
    mode: selectedCompanyId ? 'tenant' : 'platform',
    scope: selectedCompanyId ? 'tenant' : 'platform',
    census: null,
    pilotSpotlight: null,
    platformHealth: null,
    registryKpis: null,
    operationalMeta: null,
    activity: { items: [], isDemo: false },
    meta: {},
    company: null,
    tenantHub: null,
  };
}

/** MC-U-2C — Mission Control dashboard (platform or tenant scope). */
export async function getPlatformDashboardView(selectedCompanyId = null) {
  const { data, error, status } = await request(platformDashboardPath(selectedCompanyId));
  if (!data) {
    return unavailablePlatformDashboardView(selectedCompanyId, resolveAuthStatusFromResponse(status));
  }
  if (data.scope === 'platform' || data.mode === 'platform') {
    return normalizePlatformDashboardPayload(data);
  }
  return normalizeTenantDashboardPayload(data);
}

export function healthFromPlatformSnapshot(snapshot) {
  if (!snapshot) return null;
  const storage = snapshot.storage || 'demo';
  let firebase = 'offline';
  if (storage === 'firestore') firebase = 'connected';
  else if (storage === 'memory') firebase = snapshot.status === 'ok' ? 'demo' : 'offline';

  return {
    whatsapp: Boolean(snapshot.whatsapp),
    openai: Boolean(snapshot.openai),
    firebase,
    queue: snapshot.queue || { pending: 0, active: 0, concurrency: 1 },
    timestamp: snapshot.timestamp || new Date().toISOString(),
  };
}

export { PRIMARY_TENANT };
