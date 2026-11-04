#!/usr/bin/env node
/**
 * G6 — Read-only readiness report for a company (CLI).
 * Usage:
 *   node scripts/g6-evaluate-readiness-readonly.mjs --company=central-motors-rtb
 *   npx @railway/cli run node scripts/g6-evaluate-readiness-readonly.mjs --company=central-motors-rtb
 */
import { evaluateCompanyWhatsAppReadiness, evaluatePlatformWhatsAppGatewayHealth } from "../services/platform/whatsappGatewayReadinessService.js";

const companyArg = process.argv.find((a) => a.startsWith("--company="));
const companyId = companyArg ? companyArg.slice("--company=".length) : null;

const health = await evaluatePlatformWhatsAppGatewayHealth();
const out = { platform: health };

if (companyId) {
    out.company = await evaluateCompanyWhatsAppReadiness(companyId);
}

console.log(JSON.stringify(out, null, 2));
