#!/usr/bin/env node
/**
 * B-MC-3b — tenant knowledge write path unification (memory backend, no production mutation).
 */
process.env.STORAGE_BACKEND = 'memory';

import assert from 'node:assert/strict';
import {
  resolveAuthoritativeKnowledgeBaseId,
  PRIMARY_PILOT_KB_ID,
} from '../js/admin/services/knowledgeDisplay.js';

const DEMO = 'demo-central-motors';
const TEST_CO = 'verify-kb-write-tenant';
const KB = PRIMARY_PILOT_KB_ID;

function assertKbResolver() {
  const kb = resolveAuthoritativeKnowledgeBaseId({
    agents: [{ companyId: TEST_CO, isDefault: true, knowledgeBaseId: KB }],
  });
  assert.equal(kb, KB);

  const fromItems = resolveAuthoritativeKnowledgeBaseId({
    existingItems: [{ knowledgeBaseId: KB }],
  });
  assert.equal(fromItems, KB);

  const missing = resolveAuthoritativeKnowledgeBaseId({});
  assert.equal(missing, null);
}

async function assertTenantWritesMemoryOnly() {
  const { resetMemoryTenantStore } = await import('../services/database/tenantRepository.js');
  resetMemoryTenantStore();

  const { saveKnowledgeDocument, listKnowledgeDocuments, resolveWriteKnowledgeBaseId } = await import(
    '../services/tenants/knowledgeService.js'
  );
  const { createAiEmployee } = await import('../services/tenants/aiEmployeeService.js');
  const { createCompany } = await import('../services/tenants/companyService.js');

  await createCompany(TEST_CO, { name: 'KB Write Verify Tenant', status: 'active' });

  await assert.rejects(
    () => resolveWriteKnowledgeBaseId(TEST_CO, null),
    /knowledgeBaseId is required/
  );

  await createAiEmployee(TEST_CO, {
    id: 'verify-agent',
    name: 'Verify Agent',
    role: 'sales_consultant',
    isDefault: true,
    knowledgeBaseId: KB,
  });

  const resolvedKb = await resolveWriteKnowledgeBaseId(TEST_CO, null);
  assert.equal(resolvedKb, KB);

  await saveKnowledgeDocument({
    companyId: TEST_CO,
    knowledgeBaseId: KB,
    title: 'Test FAQ Write',
    type: 'faq',
    content: 'Write path verification content',
    source: 'verify-script',
  });

  await saveKnowledgeDocument({
    companyId: TEST_CO,
    knowledgeBaseId: KB,
    title: 'Manual Rules',
    type: 'manual',
    content: 'Always greet the customer warmly.',
    source: 'verify-script',
  });

  const tenantDocs = await listKnowledgeDocuments(TEST_CO, { knowledgeBaseId: KB });
  assert.ok(tenantDocs.some((d) => d.title === 'Test FAQ Write'));
  assert.ok(tenantDocs.some((d) => d.title === 'Manual Rules'));
  assert.ok(tenantDocs.every((d) => d.companyId === TEST_CO));
  assert.ok(tenantDocs.every((d) => d.knowledgeBaseId === KB));

  await createCompany(DEMO, { name: 'Demo Central Motors', status: 'active' });
  await saveKnowledgeDocument({
    companyId: DEMO,
    knowledgeBaseId: 'demo-kb-1',
    title: 'Demo Only FAQ',
    type: 'faq',
    content: 'Demo tenant isolation',
    source: 'verify-script',
  });

  const demoDocs = await listKnowledgeDocuments(DEMO, { knowledgeBaseId: 'demo-kb-1' });
  assert.ok(demoDocs.some((d) => d.title === 'Demo Only FAQ'));
  assert.ok(!tenantDocs.some((d) => d.title === 'Demo Only FAQ'));
}

async function assertAdminProductionWriteGate() {
  process.env.MISSION_CONTROL_DATA_MODE = 'production';
  const { createKnowledge } = await import('../js/admin/services/knowledge.js');

  const blocked = await createKnowledge({
    companyId: TEST_CO,
    type: 'faq',
    title: 'Blocked',
    answer: 'No KB id',
  });
  assert.ok(blocked.error);
  assert.match(blocked.error, /Knowledge base not configured/i);
}

console.log('verify-mission-control-knowledge-writes');
assertKbResolver();
await assertTenantWritesMemoryOnly();
await assertAdminProductionWriteGate();
console.log('All mission-control knowledge write checks passed.');
