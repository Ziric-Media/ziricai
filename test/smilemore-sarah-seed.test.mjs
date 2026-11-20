import test from "node:test";
import assert from "node:assert/strict";
import { buildSmilemorePilotDiscoverProfile } from "../services/network/pilotListings.js";
import { buildSmilemoreKnowledgeDocs } from "../services/storage/seedSmilemoreDentalPilot.js";

test("Smilemore discover profile links official website", () => {
    const profile = buildSmilemorePilotDiscoverProfile();
    assert.equal(profile.contact?.website, "https://www.smilemoredentists.co.za");
    assert.ok(profile.products?.length >= 10);
    assert.ok(profile.products.some((p) => p.id === "ortho-metal-braces"));
});

test("Smilemore knowledge docs include website and team", () => {
    const docs = buildSmilemoreKnowledgeDocs();
    const website = docs.find((d) => d.id === "sm-kn-website");
    assert.ok(website?.content.includes("smilemoredentists.co.za"));
    const team = docs.find((d) => d.id === "sm-kn-team");
    assert.ok(team?.content.includes("Ramorola"));
});