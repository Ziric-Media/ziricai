#!/usr/bin/env node
/** TP-1C acceptance — prove owner can access tenant via production Portal API (custom token). */
import admin from "firebase-admin";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { PRODUCTION_WEB_CONFIG } from "../app/js/firebase-config.js";

const companyId = process.env.CLIENT2_COMPANY_ID || "client2-tp1-accept-20260915";
const ownerUid = process.env.CLIENT2_OWNER_UID;
const API_BASE = (process.env.API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");

async function main() {
  if (!hasAdminCredentials() || !ownerUid) {
    console.log(JSON.stringify({ ok: false, error: "missing admin or CLIENT2_OWNER_UID" }));
    process.exit(1);
  }
  getAdminFirestore();

  const customToken = await admin.auth().createCustomToken(ownerUid);
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${PRODUCTION_WEB_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const exchangeData = await exchange.json();
  if (!exchangeData.idToken) {
    console.log(JSON.stringify({ ok: false, step: "custom_token_exchange", firebase: exchangeData }));
    process.exit(1);
  }

  const idToken = exchangeData.idToken;
  const paths = [
    `/api/portal/company/${encodeURIComponent(companyId)}`,
    `/api/portal/workspace/${encodeURIComponent(companyId)}`,
    `/api/portal/dashboard/${encodeURIComponent(companyId)}`,
  ];

  const results = [];
  for (const p of paths) {
    const res = await fetch(`${API_BASE}${p}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    results.push({
      path: p,
      status: res.status,
      companyId: data?.company?.id || data?.companyId || data?.id || null,
      companyName: data?.company?.name || data?.name || null,
    });
  }

  const ok = results.every((r) => r.status === 200);
  console.log(JSON.stringify({ ok, step: "TP-1C-portal-api-access", companyId, ownerUid, results }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message || String(e) }));
  process.exit(1);
});
