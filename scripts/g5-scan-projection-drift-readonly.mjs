#!/usr/bin/env node
import { scanWhatsAppGatewayProjectionDrift } from "../services/platform/whatsappGatewayRecovery.js";

const report = await scanWhatsAppGatewayProjectionDrift();
console.log(JSON.stringify(report, null, 2));
process.exit(report.summary.issueCount > 0 ? 1 : 0);
