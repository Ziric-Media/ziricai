/**
 * Railway-safe entry: bind HTTP immediately, lazy-load routes after listen().
 */
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getConfiguredStorageBackend } from "../services/storage/storageAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

const PORT = Number(process.env.PORT) || 3000;
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

app.get("/api/health", earlyHealthHandler);
app.get("/health", earlyHealthHandler);

logStartup("ZiricAI booting", {
    node: process.version,
    port: PORT,
    env: process.env.NODE_ENV || "development",
    storage: process.env.STORAGE_BACKEND || getConfiguredStorageBackend(),
});

app.listen(PORT, "0.0.0.0", () => {
    logStartup(`Listening on 0.0.0.0:${PORT}`);
    console.error("===================================");
    console.error(`ZiricAI running on port ${PORT}`);
    console.error("Health: GET /api/health or GET /health");
    console.error(`Queue concurrency: ${process.env.QUEUE_CONCURRENCY || 1}`);
    console.error("===================================");
});

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
            await setupApp(app);
            fullHealthHandler = createHealthHandler();
            appReady = true;
            logStartup("Application routes mounted");
            await runBackgroundInit();
            logStartup("Background initialization complete");
        })
        .catch((err) => {
            console.error("[startup] Fatal:", err);
            process.exit(1);
        });
});
