#!/usr/bin/env node
/**
 * Legacy entry — PORTAL-4C-6C-E (pre-6I frozen install) superseded at 6I-D.
 * Forwards to verify-portal-4c-6i-e-production-acceptance.mjs (aligned install matrix).
 */
console.log(
    "Note: 6C-E runner forwards to 6I-E production acceptance (6I-D aligned). See scripts/PORTAL-4C-6I-d-production-verification.md"
);
await import("./verify-portal-4c-6i-e-production-acceptance.mjs");
