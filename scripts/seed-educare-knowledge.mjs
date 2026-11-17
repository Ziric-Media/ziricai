#!/usr/bin/env node
/**
 * Upload Educare KB v1.0 working draft (EDU-KB-001–007 + six EDU-* packs) and refresh Sarah prompt.
 *
 *   node scripts/seed-educare-knowledge.mjs
 *   EDUCARE_COMPANY_ID=educare-christian-combined railway run node scripts/seed-educare-knowledge.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { EDUCARE_COMPANY_ID } from "../services/education/educareDefaults.js";
import { seedEducareKnowledge } from "../services/education/seedEducareKnowledge.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const companyId = (process.env.EDUCARE_COMPANY_ID || EDUCARE_COMPANY_ID).trim();

const result = await seedEducareKnowledge(companyId);
console.log(JSON.stringify({ gate: "EDU-KB-v1", ...result }, null, 2));
