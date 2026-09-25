#!/usr/bin/env node
/** TP-1C acceptance only — Firebase Auth create/lookup, no Firestore writes. */
import admin from "firebase-admin";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";

const EMAIL = (process.env.TP1C_OWNER_EMAIL || "tp1-acceptance-2026-09-15@ziricai.com")
  .trim()
  .toLowerCase();
const PASSWORD = process.env.TP1C_OWNER_PASSWORD || "";
const DISPLAY = "TP-1 Acceptance Owner";

async function main() {
  if (!hasAdminCredentials()) {
    console.log(JSON.stringify({ ok: false, error: "NO_ADMIN_CREDENTIALS" }));
    process.exit(1);
  }
  getAdminFirestore();
  if (admin.apps.length === 0) {
    console.log(JSON.stringify({ ok: false, error: "ADMIN_APP_UNAVAILABLE" }));
    process.exit(1);
  }
  try {
    const existing = await admin.auth().getUserByEmail(EMAIL);
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "existing",
          uid: existing.uid,
          email: existing.email,
          note: "Auth-only lookup; no Firestore profile writes",
        },
        null,
        2
      )
    );
    return;
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }
  if (!PASSWORD || PASSWORD.length < 12) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "TP1C_OWNER_PASSWORD required (min 12 chars) to create new Auth user",
      })
    );
    process.exit(1);
  }
  const created = await admin.auth().createUser({
    email: EMAIL,
    password: PASSWORD,
    displayName: DISPLAY,
    emailVerified: true,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "created",
        uid: created.uid,
        email: created.email,
        displayName: DISPLAY,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message || String(e) }));
  process.exit(1);
});
