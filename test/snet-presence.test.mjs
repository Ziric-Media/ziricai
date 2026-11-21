/**
 * SNET — Status posts, presence metrics, boosts.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import test from "node:test";
import {
    clearPresenceMetricsForTests,
    getPresenceMetrics,
    recordProfileView,
    recordPostReaction,
    recordLeadInterested,
} from "../services/network/networkPresenceMetricsService.js";
import {
    clearStatusPostsForTests,
    createStatusPost,
    scheduleStatusPosts,
    publishDueScheduledPosts,
    listStatusPostsForCompany,
    listPublicStatusFeed,
    reactToStatusPost,
    removeStatusPost,
    applyPostBoost,
    seedStatusPostForTests,
} from "../services/network/networkStatusPostService.js";
import {
    clearBusinessDirectoryForTests,
    setBusinessDirectoryStoreForTests,
    saveBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { validateProfilePatch } from "../services/network/networkProfileService.js";

test("validateProfilePatch accepts gallery and products", () => {
    const { profile } = validateProfilePatch({
        gallery: [{ imageUrl: "https://cdn.example/a.jpg", caption: "Showroom" }],
        products: [{ name: "SUV", price: "R 450 000", imageUrl: "https://cdn.example/car.jpg" }],
    });
    assert.equal(profile.gallery.length, 1);
    assert.equal(profile.products[0].name, "SUV");
    assert.throws(() => validateProfilePatch({ gallery: [{ imageUrl: "http://bad" }] }), { code: "PROFILE_INVALID" });
    const seeded = validateProfilePatch({
        products: [{ name: "Braces", imageUrl: "assets/dental-products/braces.svg" }],
    });
    assert.equal(seeded.profile.products[0].imageUrl, "assets/dental-products/braces.svg");
    const uploaded = validateProfilePatch({
        products: [
            {
                name: "Kit",
                imageUrl:
                    "https://sarah.ziricai.com/api/network/v1/listing-media/lmed_test/content?token=abc",
            },
        ],
    });
    assert.ok(uploaded.profile.products[0].imageUrl.startsWith("/api/network/v1/listing-media/"));
});

test("status posts CRUD and public feed respects published discoverability", async () => {
    clearStatusPostsForTests();
    clearBusinessDirectoryForTests();
    setBusinessDirectoryStoreForTests(null);

    const companyId = "presence-co";
    await saveBusinessDirectoryEntry(companyId, {
        displayName: "Presence Co",
        industry: "Retail",
        shortDescription: "Test",
        location: "Joburg",
        discoverability: "public",
    });

    const post = await createStatusPost(companyId, { body: "Hello Status" }, "owner-1");
    assert.ok(post.postId.startsWith("stp_"));

    let listed = await listStatusPostsForCompany(companyId);
    assert.equal(listed.length, 1);

    const feed = await listPublicStatusFeed({ limit: 10 });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].body, "Hello Status");

    await reactToStatusPost(post.postId);
    const refreshed = await listStatusPostsForCompany(companyId);
    assert.equal(refreshed[0].reactions, 1);

    await applyPostBoost(companyId, post.postId, { days: 7 });
    const boosted = await listStatusPostsForCompany(companyId);
    assert.ok(boosted[0].boostUntil);

    await removeStatusPost(companyId, post.postId);
    const afterRemove = await listPublicStatusFeed();
    assert.equal(afterRemove.length, 0);
});

test("schedule posts publish when due", async () => {
    clearStatusPostsForTests();
    clearBusinessDirectoryForTests();
    setBusinessDirectoryStoreForTests(null);
    const companyId = "sched-co";
    await saveBusinessDirectoryEntry(companyId, {
        displayName: "Sched Co",
        industry: "Retail",
        shortDescription: "Test",
        location: "Joburg",
        discoverability: "public",
    });

    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    await scheduleStatusPosts(companyId, [{ body: "Soon", scheduledAt: future }]);
    await seedStatusPostForTests({
        postId: "stp_test_due",
        companyId,
        body: "Due",
        status: "scheduled",
        scheduledAt: past,
        createdAt: past,
    });

    const promoted = await publishDueScheduledPosts();
    assert.equal(promoted, 1);

    const listed = await listStatusPostsForCompany(companyId);
    assert.equal(listed.filter((p) => p.status === "published").length, 1);
    assert.equal(listed.filter((p) => p.status === "scheduled").length, 1);

    const feed = await listPublicStatusFeed();
    assert.equal(feed.length, 1);
    assert.equal(feed[0].body, "Due");
});

test("presence metrics aggregate views reactions and leads", async () => {
    clearPresenceMetricsForTests();
    const companyId = "metrics-co";
    let m = await getPresenceMetrics(companyId);
    assert.equal(m.profileViews, 0);

    m = await recordProfileView(companyId);
    assert.equal(m.profileViews, 1);
    m = await recordPostReaction(companyId, "stp_x");
    assert.equal(m.postReactions, 1);
    m = await recordLeadInterested(companyId);
    assert.equal(m.leadsInterested, 1);
});
