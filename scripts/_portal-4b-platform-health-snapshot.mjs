#!/usr/bin/env node
const key = process.env.PLATFORM_API_KEY || "";
const base = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "https://ziricai-production.up.railway.app";
if (!key) {
    console.error("PLATFORM_API_KEY missing");
    process.exit(1);
}
const res = await fetch(`${base}/api/platform/health`, {
    headers: { "x-platform-api-key": key },
});
const data = await res.json();
console.log(
    JSON.stringify({
        status: data.status,
        tenantScopeEnforcement: data.tenantScopeEnforcement,
        storage: data.storage,
        storageConfigured: data.storageConfigured,
        storageFallback: data.storageFallback,
        firestoreAdmin: data.firestoreAdmin,
        firebaseProjectId: data.firebaseProjectId,
    })
);
