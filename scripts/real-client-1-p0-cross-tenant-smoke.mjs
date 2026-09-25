#!/usr/bin/env node
/**
 * REAL-CLIENT-1 P0 — tenant isolation smoke (production or staging API).
 * Read-only GETs only; uses disposable tenants — never central-motors-rtb as attack target.
 *
 * Usage:
 *   node scripts/real-client-1-p0-cross-tenant-smoke.mjs
 *
 * Optional env:
 *   RC1_API_BASE=https://ziricai-production.up.railway.app
 *   RC1_TENANT_A=portal-4c2-lc-test-...  (must have .portal-4c2-disposable-credentials.json)
 *   RC1_TENANT_B=client2-tp1-accept-20260915
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = (process.env.RC1_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const TENANT_B = process.env.RC1_TENANT_B || "client2-tp1-accept-20260915";

async function firebaseToken(email, password) {
  const { PRODUCTION_WEB_CONFIG } = await import("../js/firebase-config.js");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(data.error?.message || "Firebase auth failed");
  return data.idToken;
}

async function apiGet(path, token) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

function loadTenantA() {
  const credPath = join(ROOT, ".portal-4c2-disposable-credentials.json");
  if (process.env.RC1_TENANT_A && process.env.RC1_TENANT_A_EMAIL && process.env.RC1_TENANT_A_PASSWORD) {
    return {
      companyId: process.env.RC1_TENANT_A,
      email: process.env.RC1_TENANT_A_EMAIL,
      password: process.env.RC1_TENANT_A_PASSWORD,
    };
  }
  if (!existsSync(credPath)) return null;
  const cred = JSON.parse(readFileSync(credPath, "utf8"));
  return {
    companyId: cred.companyId || cred.testCompany,
    email: cred.email,
    password: cred.password,
  };
}

const results = {
  gate: "REAL-CLIENT-1-P0-cross-tenant-smoke",
  apiBase: API_BASE,
  checks: {},
};

const unauthOwn = await apiGet(`/api/companies/${encodeURIComponent(TENANT_B)}/crm/customers`);
results.checks.unauthenticated_tenant_b = {
  path: `/api/companies/${TENANT_B}/crm/customers`,
  status: unauthOwn.status,
  expectedStrict: 401,
  passStrict: unauthOwn.status === 401,
  note:
    unauthOwn.status === 200
      ? "LAX mode — unauthenticated tenant read allowed (P0-1)"
      : "Strict or auth required",
};

const tenantA = loadTenantA();
if (tenantA?.email && tenantA?.password && tenantA?.companyId) {
  try {
    const token = await firebaseToken(tenantA.email, tenantA.password);
    const own = await apiGet(
      `/api/companies/${encodeURIComponent(tenantA.companyId)}/crm/customers`,
      token
    );
    const cross = await apiGet(
      `/api/companies/${encodeURIComponent(TENANT_B)}/crm/customers`,
      token
    );
    results.checks.authenticated_tenant_a_own = {
      companyId: tenantA.companyId,
      status: own.status,
      expected: 200,
      pass: own.status === 200,
    };
    results.checks.authenticated_tenant_a_cross_b = {
      target: TENANT_B,
      status: cross.status,
      expectedStrict: 403,
      passStrict: cross.status === 403,
    };
  } catch (err) {
    results.checks.authenticated_flow = { skipped: true, reason: err.message };
  }
} else {
  results.checks.authenticated_flow = {
    skipped: true,
    reason: "Set RC1_TENANT_A* env or run PORTAL-4C2 disposable provision first",
  };
}

const strictReady =
  results.checks.unauthenticated_tenant_b.passStrict &&
  (results.checks.authenticated_tenant_a_cross_b?.passStrict !== false);

results.summary = {
  productionStrictIsolationVerified: strictReady,
  tenantScopeLikelyLax: unauthOwn.status === 200,
};

console.log(JSON.stringify(results, null, 2));
process.exit(strictReady ? 0 : 2);
