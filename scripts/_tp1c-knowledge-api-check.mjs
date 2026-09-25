#!/usr/bin/env node
/** TP-1C — production knowledge list path (empty tenant KB => items: []). */
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
    console.log(JSON.stringify({ ok: false, step: "token_exchange", firebase: exchangeData }));
    process.exit(1);
  }

  const path = `/api/companies/${encodeURIComponent(companyId)}/knowledge/documents`;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${exchangeData.idToken}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }

  const items = Array.isArray(data.items) ? data.items : null;
  const ok = res.status === 200 && Array.isArray(items) && items.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        step: "TP-1C-deployed-knowledge-list",
        deploymentNote: "exercises Railway runtime listKnowledgeDocuments",
        status: res.status,
        path,
        companyId: data.companyId || companyId,
        itemCount: items?.length ?? null,
        error: data.error || null,
      },
      null,
      2
    )
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message || String(e) }));
  process.exit(1);
});
