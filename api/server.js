/**
 * Railway-safe entry: bind HTTP immediately, lazy-load routes after listen().
 */
import express from "express";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { getConfiguredStorageBackend } from "../services/storage/storageAdapter.js";
import { authRateLimit } from "../services/auth/authRateLimiter.js";
import { createIsolatedStartupLifecycle, getIsolatedStartupConfig } from "../services/env/isolatedStartup.js";

const isolatedStartup = getIsolatedStartupConfig(process.env);
bootstrapEnv();

const PORT = isolatedStartup?.port || Number(process.env.PORT) || 3000;
const app = express();

let appReady = false;
let fullHealthHandler = null;

function logStartup(message, extra) {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    console.error(`[startup] ${message}${suffix}`);
}

async function earlyHealthHandler(req, res) {
    if (appReady && fullHealthHandler) {
        return fullHealthHandler(req, res);
    }
    res.status(503).json({
        status: "starting",
        timestamp: new Date().toISOString(),
    });
}

const healthProbeLimit = authRateLimit("health-probe");

app.get("/api/health", healthProbeLimit, earlyHealthHandler);
app.get("/health", healthProbeLimit, earlyHealthHandler);

logStartup("ZiricAI booting", {
    node: process.version,
    port: PORT,
    env: process.env.NODE_ENV || "development",
    storage: process.env.STORAGE_BACKEND || getConfiguredStorageBackend(),
});

const bindHost =
    isolatedStartup
        ? isolatedStartup.host
        : process.env.FINANCE_ACCEPTANCE_LOOPBACK === "1"
        ? process.env.BIND_HOST || "127.0.0.1"
        : process.env.BIND_HOST || "0.0.0.0";

const isolatedLifecycle = isolatedStartup ? createIsolatedStartupLifecycle() : null;
const listener = app.listen(PORT, bindHost, () => {
    logStartup(`Listening on ${bindHost}:${PORT}`);
    console.error("===================================");
    console.error(`ZiricAI running on port ${PORT}`);
    console.error("Health: GET /api/health or GET /health");
    console.error(`Queue concurrency: ${process.env.QUEUE_CONCURRENCY || 1}`);
    console.error("===================================");
});
if (isolatedLifecycle) {
    isolatedLifecycle.register(listener);
    const shutdown = () => isolatedLifecycle.shutdown().catch((err) => console.error("[startup] isolated shutdown failed:", err));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

process.on("uncaughtException", (err) => {
    console.error("[startup] uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("[startup] unhandledRejection:", err);
});

// Defer heavy module graph so the listen callback and early /health can run first.
setImmediate(() => {
    import("./app.js")
        .then(async ({ setupApp, runBackgroundInit, createHealthHandler }) => {
            logStartup("Loading application modules");
            const { getStorageAdapter, getStorageFallbackReason } = await import(
                "../services/storage/storageAdapter.js"
            );
            const adapter = await getStorageAdapter();
            logStartup("Storage backend resolved", {
                backend: adapter.name,
                fallback: getStorageFallbackReason() || undefined,
            });
            await setupApp(app);
            fullHealthHandler = createHealthHandler();
            appReady = true;
            logStartup("Application routes mounted");
            if (isolatedStartup?.skipBackgroundInit) {
                logStartup("Background initialization skipped for isolated startup");
            } else {
                await runBackgroundInit();
                logStartup("Background initialization complete");
            }
        })
        .catch((err) => {
            console.error("[startup] Fatal:", err);
            process.exit(1);
        });
});
