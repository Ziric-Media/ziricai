import assert from "node:assert/strict";
import test from "node:test";

process.env.STORAGE_BACKEND = "memory";

const {
    getOrCreateSarahSession,
    appendSarahMessage,
    getLatestSarahSessionForUser,
} = await import("../services/sarah/sarahSessionStore.js");

test("Sarah sessions are isolated per portal surface", async () => {
    const companyId = "surface-test-co";
    const userId = "user-1";

    const admin = await getOrCreateSarahSession({
        companyId,
        userId,
        surface: "portal-admin",
        createIfMissing: true,
    });
    await appendSarahMessage(admin, "user", "Admin-only thread");

    const finance = await getOrCreateSarahSession({
        companyId,
        userId,
        surface: "portal-finance",
        createIfMissing: true,
    });
    await appendSarahMessage(finance, "user", "Finance-only thread");

    assert.notEqual(admin.id, finance.id);
    assert.equal(admin.surface, "portal-admin");
    assert.equal(finance.surface, "portal-finance");

    const reloadWrong = await getOrCreateSarahSession({
        sessionId: admin.id,
        companyId,
        userId,
        surface: "portal-finance",
        createIfMissing: true,
    });
    assert.notEqual(reloadWrong.id, admin.id);
    assert.equal(reloadWrong.surface, "portal-finance");

    const latestFinance = await getLatestSarahSessionForUser(companyId, userId, "portal-finance");
    assert.equal(latestFinance.id, finance.id);
    assert.equal(latestFinance.messages.at(-1)?.content, "Finance-only thread");

    const latestAdmin = await getLatestSarahSessionForUser(companyId, userId, "portal-admin");
    assert.equal(latestAdmin.id, admin.id);
});
