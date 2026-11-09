/**
 * U4 — Sarah Network consent, discoverability gate, enquiry dispatch.
 */
process.env.STORAGE_BACKEND = 'memory';

import assert from 'node:assert/strict';
import { SMILEMORE_DEMO_COMPANY_ID } from '../services/dental/smilemorePractice.js';
import { createConsentGrant } from '../services/users/consentGrantService.js';
import { clearConsentGrantsForTests } from '../services/users/consentGrantService.js';
import { assertCompanyDiscoverable, clearBusinessDirectoryForTests } from '../services/users/businessDirectoryService.js';
import {
    submitPersonalToCompanyEnquiry,
    getSarahNetworkRequest,
    resetSarahNetworkRateLimitsForTests,
} from '../services/sarah/network/sarahNetworkService.js';
import { clearSarahNetworkStoreForTests } from '../services/sarah/network/sarahNetworkStore.js';

clearConsentGrantsForTests();
clearBusinessDirectoryForTests();
clearSarahNetworkStoreForTests();
resetSarahNetworkRateLimitsForTests();

const uid = 'u-network-1';

assert.doesNotThrow(() => assertCompanyDiscoverable(SMILEMORE_DEMO_COMPANY_ID));

const grant = createConsentGrant(uid, { companyId: SMILEMORE_DEMO_COMPANY_ID });

const completed = await submitPersonalToCompanyEnquiry(uid, {
    companyId: SMILEMORE_DEMO_COMPANY_ID,
    grantId: grant.grantId,
    naturalLanguage: 'Do you accept new patients?',
});

assert.equal(completed.status, 'completed');
assert.ok(completed.response?.payload?.naturalLanguage);

const loaded = getSarahNetworkRequest(completed.requestId, uid);
assert.equal(loaded.request.requestId, completed.requestId);
assert.ok(loaded.audit.length >= 1);

let failed = false;
try {
    await submitPersonalToCompanyEnquiry(uid, {
        companyId: 'unknown-company-xyz',
        grantId: grant.grantId,
        naturalLanguage: 'Hello',
    });
} catch (err) {
    failed = true;
    assert.equal(err.code, 'COMPANY_NOT_DISCOVERABLE');
}
assert.equal(failed, true);

console.log('sarah-network-u4.test.mjs: ok');
