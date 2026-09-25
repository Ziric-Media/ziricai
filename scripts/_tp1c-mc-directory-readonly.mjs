#!/usr/bin/env node
/** TP-1C acceptance — read-only Mission Control directory spot-check (Admin Firestore). */
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { captureRtbFingerprint } from "./verify-tenant-provisioning-1.mjs";

const companyId = process.env.CLIENT2_COMPANY_ID || "client2-tp1-accept-20260915";

async function main() {
  if (!hasAdminCredentials()) {
    console.log(JSON.stringify({ ok: false, error: "NO_ADMIN_CREDENTIALS" }));
    process.exit(1);
  }
  const db = getAdminFirestore();
  const companiesSnap = await db.collection("companies").select("name", "plan", "status", "industry").get();
  const directory = companiesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const accept = directory.find((c) => c.id === companyId);
  const rtb = directory.find((c) => c.id === CENTRAL_MOTORS_RTB_COMPANY_ID);
  const rtbFp = await captureRtbFingerprint();

  console.log(
    JSON.stringify(
      {
        ok: Boolean(accept),
        step: "TP-1C-mc-readonly-directory",
        companyInDirectory: accept || null,
        rtbCompanyRow: rtb ? { id: rtb.id, name: rtb.name, plan: rtb.plan, status: rtb.status } : null,
        totalCompanies: directory.length,
        rtbFingerprint: {
          companyCore: rtbFp.companyCore,
          agentCount: rtbFp.agents?.length,
          provisioningComplete: rtbFp.provisioningComplete,
        },
      },
      null,
      2
    )
  );
  process.exit(accept ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message || String(e) }));
  process.exit(1);
});
