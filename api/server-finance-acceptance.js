/**
 * Finance browser acceptance — loopback-only server entry.
 * Sets env before bootstrapEnv runs (via import order).
 */
import crypto from "node:crypto";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";
process.env.FINANCE_ACCEPTANCE_LOOPBACK = "1";
process.env.NODE_ENV = "development";
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "lax";
process.env.BIND_HOST = "127.0.0.1";

if (!String(process.env.FINANCE_ACCEPTANCE_SECRET || "").trim()) {
    process.env.FINANCE_ACCEPTANCE_SECRET = crypto.randomBytes(32).toString("hex");
}

if (!process.env.PORT) {
    process.env.PORT = "3099";
}

await import("./server.js");
