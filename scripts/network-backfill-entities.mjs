#!/usr/bin/env node
/**
 * SNET-02 — mint SN-ID org entities for existing eligible tenants.
 *
 *   node scripts/network-backfill-entities.mjs            # dry-run (default): prints the plan, writes nothing
 *   node scripts/network-backfill-entities.mjs --apply    # writes networkEntities/networkRefs (idempotent)
 *
 * Uses the configured storage backend (Firestore Admin when credentials exist, else memory = empty).
 * Test / acceptance / demo / UNKNOWN tenants are skipped (see services/network/networkEligibility.js).
 */
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { listAllCompaniesFromStorage } from "../services/tenants/companyService.js";
import { backfillOrgEntities } from "../services/network/networkBackfill.js";

bootstrapEnv();

const apply = process.argv.includes("--apply");
const companies = await listAllCompaniesFromStorage();
const report = await backfillOrgEntities(companies, { apply });

console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN", ...report }, null, 2));
if (!apply) console.log("\nDry-run only. Re-run with --apply to write entities.");
process.exit(0);
