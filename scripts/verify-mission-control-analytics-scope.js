#!/usr/bin/env node
/**
 * B-MC-4a — Analytics must use tenant operations API, not root Firestore analytics/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import {
  formatAnalyticsMetric,
  resolveTenantAnalyticsLoadState,
} from '../js/admin/services/analyticsDisplay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const RTB = 'central-motors-rtb';
const DEMO = 'demo-central-motors';

function withMode(mode, fn) {
  const prev = process.env.MISSION_CONTROL_DATA_MODE;
  process.env.MISSION_CONTROL_DATA_MODE = mode;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MISSION_CONTROL_DATA_MODE;
    else process.env.MISSION_CONTROL_DATA_MODE = prev;
  }
}

/** Mirrors loadTenantAnalytics production gate without network. */
function resolveAnalyticsLoadState(companyId, apiResult) {
  return resolveTenantAnalyticsLoadState(companyId, apiResult);
}

console.log('verify-mission-control-analytics-scope');

withMode('production', () => {
  assert.equal(isDemoDataAllowed(), false);

  const unscoped = resolveAnalyticsLoadState(null, { data: { counts: { leads: 99 } } });
  assert.equal(unscoped.loadState, 'scope_required');
  assert.equal(unscoped.view, null);

  const rtbPayload = {
    companyId: RTB,
    companyName: 'Central Motors Rustenburg',
    dataSource: 'tenant_crm',
    counts: {
      conversations: 2,
      activeConversations: 2,
      leads: 1,
      qualifiedLeads: 1,
      testDrivesBooked: 11,
      financeEnquiries: 0,
      dealsWon: 0,
      messagesTotal: 176,
      humanTakeovers: 0,
      customers: 1,
    },
    pipeline: { new: 0, contacted: 0, qualified: 1, proposal: 0, won: 0, lost: 0 },
    metricAvailability: {
      conversations: 'real',
      leads: 'real',
      pipeline: 'real',
      messagesTotal: 'real',
      testDrivesBooked: 'real',
      financeEnquiries: 'unavailable',
      customerSatisfaction: 'unavailable',
      avgResponseTimeSec: 'unavailable',
      estimatedRevenue: 'unavailable',
      openAiTokensUsed: 'unavailable',
    },
  };

  const rtb = resolveAnalyticsLoadState(RTB, { data: rtbPayload });
  assert.equal(rtb.loadState, 'ok');
  assert.equal(rtb.view.kpis.conversations.value, 2);
  assert.equal(rtb.view.kpis.leads.value, 1);
  assert.equal(rtb.view.kpis.testDrives.value, 11);
  assert.equal(rtb.view.kpis.messages.value, 176);
  assert.equal(formatAnalyticsMetric(rtb.view.kpis.revenue), '—');
  assert.equal(formatAnalyticsMetric(rtb.view.kpis.customerSatisfaction), '—');
  assert.equal(formatAnalyticsMetric(rtb.view.kpis.responseTime), '—');
  assert.equal(formatAnalyticsMetric(rtb.view.kpis.tokens), '—');
  assert.equal(formatAnalyticsMetric(rtb.view.kpis.aiEmployees), '—');

  const demoPayload = {
    companyId: DEMO,
    counts: { conversations: 50, leads: 20, messagesTotal: 999, customers: 5 },
    pipeline: { new: 10, qualified: 5, won: 2 },
    metricAvailability: { conversations: 'real', leads: 'real', messagesTotal: 'real' },
  };
  const demo = resolveAnalyticsLoadState(DEMO, { data: demoPayload });
  assert.equal(demo.view.kpis.messages.value, 999);
  assert.notEqual(demo.view.kpis.messages.value, rtb.view.kpis.messages.value);

  const err = resolveAnalyticsLoadState(RTB, { error: 'Unauthorized' });
  assert.equal(err.loadState, 'error');
});

const analyticsModule = fs.readFileSync(
  path.join(ROOT, 'js/admin/modules/analytics.js'),
  'utf8'
);
const analyticsService = fs.readFileSync(
  path.join(ROOT, 'js/admin/services/analytics.js'),
  'utf8'
);

assert.ok(!analyticsModule.includes("listDocuments('analytics')"), 'Analytics module must not read root analytics/');
assert.ok(!analyticsModule.includes('listAnalytics'), 'Analytics module must not use listAnalytics');
assert.ok(!analyticsModule.includes('DEMO_ANALYTICS_ROWS'), 'Analytics module must not import demo analytics rows');
assert.ok(!analyticsModule.includes('DEMO_ANALYTICS_SERIES'), 'Analytics module must not import demo analytics series');
assert.ok(!analyticsModule.includes('trendHtml'), 'Analytics module must not render fake trend percentages');
assert.ok(!analyticsModule.includes('9.8'), 'Analytics module must not contain hardcoded +9.8% trend');
assert.ok(analyticsModule.includes('loadTenantAnalytics'), 'Analytics module must use loadTenantAnalytics');
assert.ok(analyticsModule.includes('loadTenantAnalyticsTimeSeries'), 'Analytics module must load time-series API');
assert.ok(analyticsModule.includes('Message Documents Per Day'), 'Analytics must label message document chart distinctly');
assert.ok(analyticsModule.includes('CRM counter (totalMessages)'), 'Messages KPI must identify CRM counter source');
assert.ok(!analyticsModule.includes('Coming in B-MC-4b'), 'Analytics must not show B-MC-4b placeholder');
assert.ok(!analyticsModule.includes('DEMO_ANALYTICS'), 'Analytics module must not use demo analytics');
assert.ok(analyticsModule.includes('Live API'), 'Analytics module must show Live API badge');
assert.ok(analyticsService.includes('fetchTenantMissionMetrics'), 'Analytics service must call tenant metrics API');
assert.ok(analyticsService.includes('fetchTenantAnalyticsTimeSeries'), 'Analytics service must call time-series API');
assert.ok(!analyticsService.includes("listDocuments"), 'Analytics service must not use Firestore listDocuments');

const apiJs = fs.readFileSync(path.join(ROOT, 'js/admin/api.js'), 'utf8');
assert.ok(
  apiJs.includes('/api/operations/tenant/') && apiJs.includes('/metrics'),
  'api.js must expose fetchTenantMissionMetrics endpoint'
);
assert.ok(
  apiJs.includes('/analytics/timeseries'),
  'api.js must expose fetchTenantAnalyticsTimeSeries endpoint'
);

const consoleHtml = fs.readFileSync(path.join(ROOT, 'ziric-superadmin-console.html'), 'utf8');
assert.ok(consoleHtml.includes('chart.umd.min.js'), 'Super Admin console must load Chart.js for analytics charts');

console.log('All mission-control analytics scope checks passed.');
