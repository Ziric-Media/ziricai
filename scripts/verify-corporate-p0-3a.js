#!/usr/bin/env node
/**
 * CORPORATE-P0-3A — canonical communication authority lock (static).
 *
 * Default: pass with documented KNOWN_COMMUNICATION_DEBT (MC root writes until 3B).
 * --strict: fail if forbidden MC client write patterns remain.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    ARCHITECTURAL_RULE,
    CANONICAL_MESSAGE_STORE,
    CANONICAL_WRITE_ENTRY_POINTS,
    FORBIDDEN_CLIENT_WRITE_PATTERNS,
    KNOWN_COMMUNICATION_DEBT,
    REGISTERED_COMMUNICATION_ADAPTERS,
} from "../services/conversation/canonicalCommunicationContract.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("CORPORATE-P0-3A — canonical communication authority");

assert.ok(ARCHITECTURAL_RULE.includes("approved adapter"));
assert.equal(CANONICAL_MESSAGE_STORE.root, "companies");
assert.ok(CANONICAL_WRITE_ENTRY_POINTS.length >= 5);
assert.ok(REGISTERED_COMMUNICATION_ADAPTERS.some((a) => a.id === "whatsapp-inbound"));
console.log("✓ canonicalCommunicationContract exports");

const schema = read("services/database/schema.js");
assert.match(schema, /CORPORATE-P0-3|canonical communication|not authoritative/i);
console.log("✓ schema documents tenant SoT vs legacy conversations");

const pipeline = read("services/integrations/conversationPipeline.js");
assert.match(pipeline, /saveInboundMessage|ingest/);
const worker = read("services/queue/workers/messageWorker.js");
assert.match(worker, /saveOutboundMessage/);
const tenantSvc = read("services/tenants/conversationService.js");
assert.match(tenantSvc, /sendConversationReply/);
console.log("✓ server paths reference canonical write surface");

let mcViolations = [];
for (const rule of FORBIDDEN_CLIENT_WRITE_PATTERNS) {
    const rel = rule.glob.replace(/^admin\//, "admin/");
    const paths = [rule.glob, rule.glob.replace("admin/", "js/admin/")];
    for (const relPath of paths) {
        let src;
        try {
            src = read(relPath);
        } catch {
            continue;
        }
        for (const re of rule.patterns) {
            if (re.test(src)) {
                mcViolations.push({ rule: rule.id, file: relPath, pattern: re.source });
            }
        }
    }
}

if (mcViolations.length) {
    console.log("\nKnown communication debt (MC — remediated in P0-3B):");
    for (const v of mcViolations) {
        console.log(`  • ${v.rule} in ${v.file}`);
    }
    for (const d of KNOWN_COMMUNICATION_DEBT) {
        console.log(`  • ${d.id}: ${d.summary}`);
    }
    if (strict) {
        console.error("\nFAIL (--strict): remove MC forbidden write patterns before closing P0-3B.");
        process.exit(1);
    }
} else {
    console.log("✓ no forbidden MC client write patterns detected");
}

console.log("\nCORPORATE-P0-3A PASS" + (strict ? " (strict)" : " (baseline — use --strict after P0-3B)"));
