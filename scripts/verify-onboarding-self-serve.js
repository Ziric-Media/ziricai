#!/usr/bin/env node
/**
 * Static checks: marketing free-trial onboarding ↔ MC-style provision + Embedded Signup.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const onboardingMain = read("js/onboarding/main.js");
assert.match(onboardingMain, /embeddedSignupEnabled|runMetaEmbeddedSignupConnect/);
assert.match(onboardingMain, /finalizeWhatsAppOnboardingStep/);
assert.match(onboardingMain, /btnWaSkip/);

const onboardingApi = read("js/onboarding/api.js");
assert.match(onboardingApi, /embedded-signup-config/);
assert.match(onboardingApi, /embedded-signup/);

const onboardingSvc = read("services/platform/onboardingService.js");
assert.match(onboardingSvc, /ensureWhatsAppReadyForSetup/);
assert.match(onboardingSvc, /embeddedSignupEnabled/);

const appJs = read("api/app.js");
assert.match(appJs, /req\.firebaseAuth\?\.uid/);

const honesty = read("services/platform/onboardingSessionHonesty.js");
assert.match(honesty, /pending_configuration/);

console.log("✓ Self-serve onboarding wired for MC-style WhatsApp setup + Embedded Signup");
