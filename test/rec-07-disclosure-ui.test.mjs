/**
 * REC-07 — recommendationsUi payload from tool actions.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendationsUiFromActions } from "../services/sarah/personal/personalSarahRecommendationsUi.js";

test("buildRecommendationsUiFromActions merges latest query", () => {
    const actions = [
        {
            success: true,
            tool: "querySarahRecommendations",
            data: {
                requestId: "req_abc",
                organic: [{ offeringId: "o1", displayName: "Org A", reason: "Near you", sponsored: false }],
                sponsored: [
                    {
                        offeringId: "o2",
                        displayName: "Sponsor B",
                        reason: "Eligible",
                        campaignId: "camp_1",
                        disclosureLabel: "Sponsored Recommendation",
                        discoverProfileUrl: "/discover/sn_test",
                        sponsored: true,
                    },
                ],
            },
        },
    ];
    const ui = buildRecommendationsUiFromActions(actions);
    assert.ok(ui);
    assert.equal(ui.requestId, "req_abc");
    assert.equal(ui.organic.length, 1);
    assert.equal(ui.sponsored.length, 1);
    assert.equal(ui.sponsored[0].sponsored, true);
    assert.match(ui.disclosure.body, /endorses/i);
});

test("buildRecommendationsUiFromActions returns null when no query", () => {
    assert.equal(buildRecommendationsUiFromActions([]), null);
    assert.equal(buildRecommendationsUiFromActions([{ success: true, tool: "other" }]), null);
});