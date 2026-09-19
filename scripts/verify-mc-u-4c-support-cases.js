#!/usr/bin/env node
/** MC-U-4C — SupportCase tenant service + routes contract */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'memory';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const {
    createSupportCase,
    patchSupportCase,
    listSupportCasesPage,
    canPatchSupportCase,
} = await import(pathToFileURL(join(ROOT, 'services/tenants/supportCaseService.js')).href);

const tenantCtx = { uid: 'user-1', profile: { role: 'owner' }, isSuperAdmin: false };
const memberCtx = { uid: 'user-2', profile: { role: 'sales' }, isSuperAdmin: false };
const supportCtx = { uid: 'user-3', profile: { role: 'support' }, isSuperAdmin: false };

const companyId = 'test-tenant-support';

const created = await createSupportCase(
    companyId,
    { subject: 'WhatsApp not connecting', category: 'integrations', priority: 'high', source: 'portal' },
    memberCtx
);
assert.equal(created.status, 'open');
assert.equal(created.companyId, companyId);

const list = await listSupportCasesPage(companyId, { limit: 10 });
assert.equal(list.items.length, 1);

await patchSupportCase(companyId, created.id, { status: 'assigned', assigneeId: 'user-3', assigneeName: 'Support Agent' }, supportCtx);
const assigned = await patchSupportCase(companyId, created.id, { status: 'resolved' }, supportCtx);
assert.equal(assigned.status, 'resolved');
assert.ok(assigned.resolvedAt);

let forbidden = false;
try {
    await patchSupportCase(companyId, created.id, { status: 'open' }, memberCtx);
} catch (err) {
    forbidden = err.code === 'SUPPORT_PATCH_FORBIDDEN' || err.status === 403;
}
assert.ok(forbidden, 'sales role must not PATCH');

let reopenBlocked = false;
try {
    await patchSupportCase(companyId, created.id, { status: 'open' }, supportCtx);
} catch (err) {
    reopenBlocked = err.code === 'INVALID_STATUS_TRANSITION';
}
assert.ok(reopenBlocked, 'resolved → open blocked in v1');

assert.ok(canPatchSupportCase(supportCtx));
assert.ok(!canPatchSupportCase(memberCtx));

assert.ok(existsSync(join(ROOT, 'services/api/supportCaseRoutes.js')));
const routes = readFileSync(join(ROOT, 'services/api/customerOpsRoutes.js'), 'utf8');
assert.match(routes, /mountSupportCaseRoutes/);

const portal = readFileSync(join(ROOT, 'js/portal/modules/support.js'), 'utf8');
assert.match(portal, /fetchSupportCases/);
assert.match(portal, /createSupportCase/);

const mcService = readFileSync(join(ROOT, 'services/operations/platformMissionControlService.js'), 'utf8');
assert.match(mcService, /unavailable: true/, 'MC platform stub unchanged until 4D');

console.log('✓ MC-U-4C support cases verified');
