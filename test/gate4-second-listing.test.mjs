/**
 * Gate 4 — second network listing tenant (Central Motors Rustenburg, companyId `central-motors-rtb`).
 * Listed only when allow-listed (SARAH_NETWORK_PILOT_COMPANY_IDS) or published via SNET-03; fail-closed otherwise.
 * Client Zero and demo/showcase tenants never appear.
 */
process.env.STORAGE_BACKEND = "memory";
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";
import test from "node:test";
import { SMILEMORE_DEMO_COMPANY_ID } from "../services/dental/smilemorePractice.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_RTB_PILOT_ID, buildPilotSeedEntries } from "../services/network/pilotListings.js";
import { evaluateNetworkEligibility } from "../services/network/networkEligibility.js";
import {
    assertCompanyDiscoverableAsync,
    clearBusinessDirectoryForTests,
    searchDiscoverCompanies,
    setBusinessDirectoryStoreForTests,
} from "../services/users/businessDirectoryService.js";
import { clearNetworkEntitiesForTests } from "../services/network/networkIdentityService.js";
import { CLIENT_ZERO_COMPANY_IDS } from "../services/clientZero/clientZero.js";

const KEY = "SARAH_NETWORK_PILOT_COMPANY_IDS";
const saved = process.env[KEY];

function withPilotEnv(value) {
    if (value === undefined) delete process.env[KEY];
    else process.env[KEY] = value;
    setBusinessDirectoryStoreForTests(null);
    clearNetworkEntitiesForTests();
    clearBusinessDirectoryForTests();
}

test.after(() => {
    withPilotEnv(saved);
});

test("pilot id constant matches the real tenant seeded by the Central Motors pilot", () => {
    assert.equal(CENTRAL_MOTORS_RTB_PILOT_ID, CENTRAL_MOTORS_RTB_COMPANY_ID);
});

test("default (no env): only SmileMore is listed; Central Motors fails closed", async () => {
    withPilotEnv(undefined);
    const res = await searchDiscoverCompanies({});
    assert.deepEqual(res.companies.map((c) => c.companyId), [SMILEMORE_DEMO_COMPANY_ID]);
    await assert.rejects(assertCompanyDiscoverableAsync(CENTRAL_MOTORS_RTB_COMPANY_ID), (e) => e.code === "COMPANY_NOT_DISCOVERABLE");
});

test("allow-listing central-motors-rtb makes Discover return >= 2 listed companies with a real profile", async () => {
    withPilotEnv(`${SMILEMORE_DEMO_COMPANY_ID},${CENTRAL_MOTORS_RTB_COMPANY_ID}`);
    const res = await searchDiscoverCompanies({});
    const ids = res.companies.map((c) => c.companyId).sort();
    assert.deepEqual(ids, [CENTRAL_MOTORS_RTB_COMPANY_ID, SMILEMORE_DEMO_COMPANY_ID].sort());
    assert.ok(res.total >= 2);

    const cm = res.companies.find((c) => c.companyId === CENTRAL_MOTORS_RTB_COMPANY_ID);
    assert.equal(cm.displayName, "Central Motors Rustenburg");
    assert.match(cm.snId, /^sn_org_/);
    assert.equal(cm.verified, false, "never verified by code");
    assert.equal(cm.verification.state, "unverified");
    assert.match(cm.location, /Rustenburg/);
    assert.ok(cm.tags.includes("dealership"));
    assert.equal(JSON.stringify(cm).includes("centralmotorsrtb.co.za"), false, "no private contact data in the public card");

    const found = await searchDiscoverCompanies({ q: "used cars rustenburg" });
    assert.equal(found.companies[0]?.companyId, CENTRAL_MOTORS_RTB_COMPANY_ID);
    await assertCompanyDiscoverableAsync(CENTRAL_MOTORS_RTB_COMPANY_ID);
});

test("Client Zero and demo/showcase tenants never appear, even when others are allow-listed", async () => {
    withPilotEnv(`${SMILEMORE_DEMO_COMPANY_ID},${CENTRAL_MOTORS_RTB_COMPANY_ID}`);
    const ids = new Set((await searchDiscoverCompanies({})).companies.map((c) => c.companyId));
    for (const id of [...CLIENT_ZERO_COMPANY_IDS, "demo-central-motors", "central-motors"]) assert.equal(ids.has(id), false, id);
    assert.equal(buildPilotSeedEntries().some((e) => CLIENT_ZERO_COMPANY_IDS.includes(e.companyId)), false);
});

test("server-side eligibility: Central Motors RTB (pilot class) may publish; demo, Client Zero allow-list untouched", () => {
    const cm = evaluateNetworkEligibility({ id: CENTRAL_MOTORS_RTB_COMPANY_ID });
    assert.equal(cm.eligible, true);
    assert.equal(cm.classification, "PILOT");
    assert.equal(evaluateNetworkEligibility({ id: "demo-central-motors" }).eligible, false);
    assert.equal(evaluateNetworkEligibility({ id: "ziricai" }).classification, "CLIENT ZERO");
});
