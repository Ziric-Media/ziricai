#!/usr/bin/env node
/**
 * B-MC-3 — production Knowledge Base must use tenant-scoped API, never legacy/demo fallback.
 */
import assert from 'node:assert/strict';
import { isDemoDataAllowed } from '../js/admin/services/dataMode.js';
import {
  enrichKnowledgeForDisplay,
  resolveDefaultKnowledgeSection,
  resolveKnowledgeBaseLabel,
  computeKnowledgeDisplayStats,
  PRIMARY_PILOT_KB_ID,
} from '../js/admin/services/knowledgeDisplay.js';

const TENANT_ID = 'central-motors-rtb';

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

/** Mirrors js/admin/services/knowledge.js listKnowledge production path. */
function resolveAdminKnowledgeList(companyId, apiResult) {
  if (!isDemoDataAllowed() && !companyId) {
    return { items: [], source: 'api', loadState: 'scope_required' };
  }
  if (!isDemoDataAllowed() && companyId) {
    if (apiResult.error) {
      return { items: [], source: 'api', error: apiResult.error, loadState: 'error' };
    }
    const items = enrichKnowledgeForDisplay(apiResult.data?.items || []);
    return {
      items,
      source: 'api',
      loadState: items.length ? 'ok' : 'empty',
      knowledgeBaseId: apiResult.data?.knowledgeBaseId || null,
    };
  }
  return { items: enrichKnowledgeForDisplay(apiResult.data?.items || []), loadState: 'ok' };
}

console.log('verify-mission-control-knowledge-scope');

withMode('production', () => {
  const unscoped = resolveAdminKnowledgeList(null, {
    data: { items: [{ id: 'demo-kn-1', title: 'Demo Vehicle Catalogue', type: 'document' }] },
  });
  assert.equal(unscoped.loadState, 'scope_required');
  assert.equal(unscoped.items.length, 0);

  const empty = resolveAdminKnowledgeList(TENANT_ID, { data: { items: [] } });
  assert.equal(empty.loadState, 'empty');
  assert.equal(empty.items.length, 0);

  const err = resolveAdminKnowledgeList(TENANT_ID, { error: 'Network error' });
  assert.equal(err.loadState, 'error');

  const ok = resolveAdminKnowledgeList(TENANT_ID, {
    data: {
      items: [
        {
          id: 'rtb-kn-faq-hours',
          title: 'Business Hours',
          type: 'faq',
          content: 'Mon-Fri 8-5',
          knowledgeBaseId: PRIMARY_PILOT_KB_ID,
          status: 'active',
          updatedAt: { _seconds: 1788452575, _nanoseconds: 0 },
        },
      ],
      knowledgeBaseId: PRIMARY_PILOT_KB_ID,
    },
  });
  assert.equal(ok.loadState, 'ok');
  assert.equal(ok.items[0].title, 'Business Hours');
  assert.equal(ok.items[0].question, 'Business Hours');
  assert.equal(ok.items[0].answer, 'Mon-Fri 8-5');
  assert.ok(ok.items[0].lastTrained);

  const faqOnlySection = resolveDefaultKnowledgeSection([
    { type: 'faq', title: 'Business Hours' },
    { type: 'faq', title: 'Visit Us' },
  ]);
  assert.equal(faqOnlySection, 'faqs');

  const stats = computeKnowledgeDisplayStats(ok.items);
  assert.equal(stats.faqs, 1);
  assert.equal(stats.documents, 0);

  const kbLabel = resolveKnowledgeBaseLabel({
    items: ok.items,
    apiKnowledgeBaseId: 'kb-central-motors-rtb',
  });
  assert.equal(kbLabel, PRIMARY_PILOT_KB_ID);
});

withMode('development', () => {
  assert.equal(isDemoDataAllowed(), true);
});

console.log('All mission-control knowledge scope checks passed.');
