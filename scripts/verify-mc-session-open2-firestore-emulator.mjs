#!/usr/bin/env node
/**
 * OPEN-2 Firestore boundary — requires Firestore emulator (not memory fallback).
 *
 *   Terminal 1: firebase emulators:start --only firestore
 *   Terminal 2: $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; node scripts/verify-mc-session-open2-firestore-emulator.mjs
 */
import assert from "node:assert/strict";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim();
if (!emulatorHost) {
    console.error("verify-mc-session-open2-firestore-emulator: FIRESTORE_EMULATOR_HOST is required.");
    console.error("Start emulator: firebase emulators:start --only firestore");
    console.error('Then: $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080" (PowerShell) or export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080');
    process.exit(2);
}

process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "ziricai-mc-open2-emulator";
delete process.env.STORAGE_BACKEND;

const { getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
const { platformSarahSessionPath } = await import("../services/database/schema.js");
const { useAdminBackend } = await import("../services/database/firestoreClient.js");
const {
    mcScopeKey,
    getOrCreateMcSarahSession,
    loadMcSarahSession,
    appendMcSarahMessage,
} = await import("../services/sarah/mcSessionStore.js");
const { MC_SCOPE } = await import("../services/sarah/mcToolPolicy.js");

async function readFirestoreSessionDoc(sessionId) {
    const db = getAdminFirestore();
    assert.ok(db, "Admin Firestore must be available when FIRESTORE_EMULATOR_HOST is set");
    const snap = await db.doc(platformSarahSessionPath(sessionId)).get();
    if (!snap.exists) return null;
    return snap.data();
}

async function expectForbidden(fn) {
    try {
        await fn();
        assert.fail("Expected SARAH_SESSION_FORBIDDEN");
    } catch (err) {
        assert.equal(err.code, "SARAH_SESSION_FORBIDDEN", err.message);
        assert.equal(err.status, 403);
    }
}

console.log("verify-mc-session-open2-firestore-emulator");
console.log(`  emulator: ${emulatorHost}`);

assert.ok(useAdminBackend(), "useAdminBackend() must be true — do not run this script with memory-only backend");

const sessionId = `mc-sarah-open2-fs-${Date.now()}`;
const operatorA = "open2-fs-operator-a";
const operatorB = "open2-fs-operator-b";
const marker = `distinctive-marker-${Date.now()}`;

const created = await getOrCreateMcSarahSession({
    sessionId,
    operatorUid: operatorA,
    scopeMode: MC_SCOPE.PLATFORM,
    scopedCompanyId: null,
});
assert.equal(created.id, sessionId);
await appendMcSarahMessage(created, "user", marker);

const afterSeed = await readFirestoreSessionDoc(sessionId);
assert.ok(afterSeed, "seed document must exist in Firestore");
assert.equal(afterSeed.operatorUid, operatorA);
assert.equal(afterSeed.scopeKey, "platform");
assert.ok(Array.isArray(afterSeed.messages) && afterSeed.messages.some((m) => String(m.content).includes(marker)));

await expectForbidden(() =>
    getOrCreateMcSarahSession({
        sessionId,
        operatorUid: operatorB,
        scopeMode: MC_SCOPE.PLATFORM,
        scopedCompanyId: null,
        createIfMissing: true,
    })
);

const afterAttack = await readFirestoreSessionDoc(sessionId);
assert.equal(afterAttack.operatorUid, operatorA, "Firestore operatorUid must not be overwritten");
assert.equal(afterAttack.scopeKey, "platform");
assert.ok(
    afterAttack.messages.some((m) => String(m.content).includes(marker)),
    "Firestore message history must be unchanged"
);

const viaLoadA = await loadMcSarahSession({
    sessionId,
    operatorUid: operatorA,
    scopeKey: mcScopeKey(null),
});
assert.ok(viaLoadA, "operator A load after B attempt");
assert.equal(viaLoadA.operatorUid, operatorA);
assert.match(viaLoadA.messages[0].content, new RegExp(marker));

const deniedB = await loadMcSarahSession({
    sessionId,
    operatorUid: operatorB,
    scopeKey: mcScopeKey(null),
});
assert.equal(deniedB, null, "operator B must not load A session");

const freshB = await getOrCreateMcSarahSession({
    sessionId: null,
    operatorUid: operatorB,
    scopeMode: MC_SCOPE.PLATFORM,
    scopedCompanyId: null,
});
assert.ok(freshB?.id, "operator B can create a new session");
assert.notEqual(freshB.id, sessionId, "new session id must differ from A");

console.log("✓ OPEN-2 Firestore: forbidden reuse does not merge-overwrite document");
console.log("✓ OPEN-2 Firestore: operator A doc + memory-visible state unchanged");
console.log("✓ OPEN-2 Firestore: new session creation still works");
