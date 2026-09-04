#!/usr/bin/env node
/**
 * B-MC-2 — production AI Employees must use tenant-scoped API, never legacy/demo fallback.
 */
import assert from 'node:assert/strict';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import {
  enrichAgentsForDisplay,
  isWhatsappChannelEnabled,
  PRIMARY_PILOT_TENANT_ID,
} from '../js/admin/services/agentDisplay.js';

const TENANT_ID = PRIMARY_PILOT_TENANT_ID;
const PRODUCTION_SARAH = {
  id: 'rtb-agent-sarah',
  name: 'Sarah',
  companyId: TENANT_ID,
  role: 'sales_consultant',
  roleLabel: 'Sales Consultant',
  status: 'active',
  isDefault: true,
  personality: 'sales_driven',
  model: 'gpt-4o-mini',
  channels: { whatsapp: true, websiteChat: true },
  knowledgeBaseId: 'rtb-kb-1',
  avatar: '🤖',
};

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

/** Mirrors js/admin/services/agents.js listAgents production path. */
function resolveAdminAgentList(companyId, apiResult) {
  if (!isDemoDataAllowed() && !companyId) {
    return { items: [], source: 'api', loadState: 'scope_required' };
  }
  if (!isDemoDataAllowed() && companyId) {
    if (apiResult.error) {
      return { items: [], source: 'api', error: apiResult.error, loadState: 'error' };
    }
    const items = apiResult.data?.items || [];
    return {
      items,
      source: 'api',
      loadState: items.length ? 'ok' : 'empty',
      companyId,
      defaultAgentId: apiResult.data?.defaultAgentId || null,
    };
  }
  return { items: apiResult.data?.items || [], loadState: 'ok' };
}

console.log('verify-mission-control-agents-scope');

withMode('production', () => {
  const unscoped = resolveAdminAgentList(null, { data: { items: [{ id: 'demo-agent-1', name: 'James' }] } });
  assert.equal(unscoped.loadState, 'scope_required');
  assert.equal(unscoped.items.length, 0);

  const empty = resolveAdminAgentList(TENANT_ID, { data: { items: [] } });
  assert.equal(empty.loadState, 'empty');
  assert.equal(empty.items.length, 0);

  const err = resolveAdminAgentList(TENANT_ID, { error: 'Network error' });
  assert.equal(err.loadState, 'error');
  assert.equal(err.items.length, 0);

  const ok = resolveAdminAgentList(TENANT_ID, {
    data: {
      items: [PRODUCTION_SARAH],
      defaultAgentId: 'rtb-agent-sarah',
    },
  });
  assert.equal(ok.loadState, 'ok');
  assert.equal(ok.items.length, 1);
  assert.equal(ok.items[0].id, 'rtb-agent-sarah');
  assert.equal(ok.items[0].name, 'Sarah');
  assert.equal(ok.items[0].companyId, TENANT_ID);
  assert.equal(ok.items[0].isDefault, true);
  assert.equal(ok.defaultAgentId, 'rtb-agent-sarah');
  assert.notEqual(ok.items[0].id, 'demo-agent-1');

  const companies = [{ id: TENANT_ID, name: 'Central Motors Rustenburg', whatsappConnected: true }];
  const enriched = enrichAgentsForDisplay(ok.items, { companyId: TENANT_ID, companies });
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].whatsappConnected, true);
  assert.equal(enriched[0].conversations, null);
  assert.equal(isWhatsappChannelEnabled(enriched[0]), true);

  const demoTenantItems = [{ id: 'sarah', name: 'Sarah', companyId: 'demo-central-motors', channels: ['whatsapp'] }];
  const demoEnriched = enrichAgentsForDisplay(demoTenantItems, {
    companyId: 'demo-central-motors',
    companies: [{ id: 'demo-central-motors', whatsappConnected: false }],
  });
  assert.equal(demoEnriched[0].companyId, 'demo-central-motors');
  assert.equal(demoEnriched[0].id, 'sarah');
  assert.notEqual(demoEnriched[0].id, 'rtb-agent-sarah');
});

withMode('development', () => {
  assert.equal(isDemoDataAllowed(), true);
});

console.log('All mission-control agents scope checks passed.');
