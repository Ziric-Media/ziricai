#!/usr/bin/env node
/**
 * CORPORATE-P0-3B — Mission Control aligned to tenant communication APIs (static).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_CLIENT_WRITE_PATTERNS } from "../services/conversation/canonicalCommunicationContract.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MC_SERVICE_PATHS = [
    "admin/js/admin/services/conversations.js",
    "js/admin/services/conversations.js",
];
const MC_API_PATHS = ["admin/js/admin/api.js", "js/admin/api.js"];

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("CORPORATE-P0-3B — Mission Control canonical API alignment");

for (const rel of MC_SERVICE_PATHS) {
    const src = read(rel);
    assert.match(src, /postConversationReply/, `${rel} must call tenant reply API`);
    assert.match(src, /postConversationTakeover/, `${rel} must call tenant takeover API`);
    assert.match(src, /postConversationRead/, `${rel} must call tenant read API`);
    assert.doesNotMatch(src, /addDoc\s*\(/, `${rel} must not addDoc to Firestore for messages`);

    for (const rule of FORBIDDEN_CLIENT_WRITE_PATTERNS) {
        for (const re of rule.patterns) {
            assert.doesNotMatch(src, re, `${rel} violates ${rule.id}`);
        }
    }
}
console.log("✓ MC conversation service uses HTTP mutations only");

for (const rel of MC_API_PATHS) {
    const src = read(rel);
    assert.match(src, /\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/reply/);
    assert.match(src, /\/takeover/);
    assert.match(src, /\/read/);
}
console.log("✓ MC api.js exposes reply/takeover/read routes");

const modules = [
    read("admin/js/admin/modules/conversations.js"),
    read("js/admin/modules/conversations.js"),
];
for (const src of modules) {
    assert.match(src, /dataSource|source === 'api'|dataSource === 'api'/, "MC module must gate API-backed simulation");
}
console.log("✓ MC inbox module gates API-backed AI simulation");

console.log("\nCORPORATE-P0-3B PASS");
