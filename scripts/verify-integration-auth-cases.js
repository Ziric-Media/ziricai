#!/usr/bin/env node
/**
 * PORTAL-2A — Integration read authorization case matrix (deterministic, no Firestore).
 */
import assert from "node:assert/strict";
import { assertIntegrationReadAccess } from "../services/core/tenantContext.js";

async function expectAccess(fn, message) {
    try {
        await fn();
        assert.fail(message || "Expected access check to throw");
    } catch (err) {
        return err;
    }
}

console.log("verify-integration-auth-cases");

const companyId = "central-motors-rtb";
const req = { headers: {} };

const allow = await assertIntegrationReadAccess(
    { companyId, uid: "user-with-membership", isSuperAdmin: false, profile: null },
    req,
    {
        getTenantMembership: async (uid, tenantId) =>
            uid === "user-with-membership" && tenantId === companyId ? { uid, companyId, role: "owner" } : null,
    }
);
assert.deepEqual(allow, { via: "tenant" });
console.log("✓ Case 1: authenticated + valid membership + missing profile → ALLOW");

const wrongTenantErr = await expectAccess(() =>
    assertIntegrationReadAccess(
        {
            companyId,
            uid: "user-other-tenant",
            isSuperAdmin: false,
            profile: { companyId: "other-tenant", role: "owner" },
        },
        req,
        {
            getTenantMembership: async () => null,
        }
    )
);
assert.equal(wrongTenantErr.status, 403);
assert.equal(wrongTenantErr.code, "TENANT_FORBIDDEN");
console.log("✓ Case 2: authenticated + wrong tenant / no membership → DENY");

const unauthErr = await expectAccess(() =>
    assertIntegrationReadAccess(
        { companyId, uid: null, isSuperAdmin: false, profile: null },
        req
    )
);
assert.equal(unauthErr.status, 401);
assert.equal(unauthErr.code, "UNAUTHORIZED");
console.log("✓ Case 3: unauthenticated → DENY");

const noMembershipErr = await expectAccess(() =>
    assertIntegrationReadAccess(
        { companyId, uid: "user-no-membership", isSuperAdmin: false, profile: null },
        req,
        {
            getTenantMembership: async () => null,
        }
    )
);
assert.equal(noMembershipErr.status, 403);
assert.equal(noMembershipErr.code, "PROFILE_REQUIRED");
console.log("✓ Case 1b: authenticated + missing profile + missing membership → DENY");

console.log("\nAll integration authorization case checks passed.");
