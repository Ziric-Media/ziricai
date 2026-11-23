#!/usr/bin/env node
/**
 * Enable Sach accounting practice mode + seed functional-spec knowledge on existing tenant.
 * Run: railway run node scripts/bootstrap-sach-accounting.mjs
 */
import { bootstrapSachAccountingPractice } from "../services/consulting/sachAccountingBootstrap.js";
import { SACH_CONSULT_COMPANY_ID } from "../services/consulting/sachAccountingConfig.js";

const companyId = process.argv[2] || SACH_CONSULT_COMPANY_ID;

const result = await bootstrapSachAccountingPractice(companyId);
console.log(JSON.stringify({ ok: true, ...result }, null, 2));