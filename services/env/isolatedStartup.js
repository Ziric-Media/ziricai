/**
 * Explicit fail-closed contract for a locally owned full-server test process.
 * This module is intentionally pure: callers validate before reading .env,
 * opening a listener, initializing Firebase, or starting background work.
 */
const MODE_FLAG = "ZIRICAI_ISOLATED_STARTUP";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const FORBIDDEN_ENV = [
    "DATABASE_URL",
    "REDIS_URL",
    "OPENAI_API_KEY",
    "WHATSAPP_TOKEN",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
    "GOOGLE_APPLICATION_CREDENTIALS",
];
const FINANCE_ACCEPTANCE_LOOPBACK_FLAG = "FINANCE_ACCEPTANCE_LOOPBACK";
const FINANCE_ACCEPTANCE_SECRET = "FINANCE_ACCEPTANCE_SECRET";

function fail(message) {
    throw new Error(`Isolated startup rejected: ${message}`);
}

function validateEmulatorHost(value, label) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(127\.0\.0\.1|localhost|\[::1\]|::1):(\d{1,5})$/);
    if (!match) fail(`${label} must be a loopback host with an explicit port`);
    const port = Number(match[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`${label} has an invalid port`);
    return raw;
}

/** Returns null for ordinary startup, or a validated isolated-only contract. */
export function getIsolatedStartupConfig(env = process.env) {
    const requested = env[MODE_FLAG];
    if (requested === undefined || requested === "") return null;
    if (requested !== "1") fail(`${MODE_FLAG} must be exactly "1" when set`);
    if (String(env.NODE_ENV || "").toLowerCase() !== "test") fail("NODE_ENV=test is required");

    const host = String(env.BIND_HOST || "").trim();
    if (!LOOPBACK_HOSTS.has(host)) fail("BIND_HOST must be an explicit loopback address");
    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) {
        fail("PORT must be an explicit dedicated non-production port");
    }

    const storageBackend = String(env.STORAGE_BACKEND || "").trim().toLowerCase();
    if (storageBackend !== "memory" && storageBackend !== "firestore") {
        fail("STORAGE_BACKEND must be explicitly memory or firestore");
    }
    if (env.ZIRICAI_FIREBASE_EMULATOR !== "1") fail("ZIRICAI_FIREBASE_EMULATOR=1 is required");
    const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
    if (!projectId.startsWith("demo-")) fail("FIREBASE_PROJECT_ID must use a demo-* project");
    const firestoreHost = validateEmulatorHost(env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST");
    const authHost = validateEmulatorHost(env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST");
    const forbidden = FORBIDDEN_ENV.filter((name) => Boolean(String(env[name] || "").trim()));
    if (forbidden.length) fail("cloud credentials, queue URLs, and external integration credentials are forbidden");
    if (env[FINANCE_ACCEPTANCE_LOOPBACK_FLAG] === "1") {
        fail(`${FINANCE_ACCEPTANCE_LOOPBACK_FLAG}=1 is incompatible with isolated startup`);
    }
    if (String(env[FINANCE_ACCEPTANCE_SECRET] || "").trim()) {
        fail(`${FINANCE_ACCEPTANCE_SECRET} is incompatible with isolated startup`);
    }

    return Object.freeze({
        isolated: true,
        host,
        port,
        storageBackend,
        projectId,
        firestoreHost,
        authHost,
        skipRepositoryEnvFiles: true,
        skipBackgroundInit: true,
    });
}

export function shouldSkipRepositoryEnvFiles(env = process.env) {
    return Boolean(getIsolatedStartupConfig(env)?.skipRepositoryEnvFiles);
}

/**
 * Mounting integration routes initializes the integration hub and adapter
 * registry. Keep that initialization out of the isolated server path.
 */
export function mountIntegrationRoutesForStartup(app, mountIntegrationRoutes, env = process.env) {
    if (getIsolatedStartupConfig(env)) return false;
    mountIntegrationRoutes(app);
    return true;
}

/** Tracks only a listener explicitly registered by the isolated server path. */
export function createIsolatedStartupLifecycle() {
    let listener = null;
    return {
        register(server) {
            if (!server || typeof server.close !== "function") fail("listener ownership could not be established");
            if (listener) fail("listener ownership was already registered");
            listener = server;
        },
        async shutdown() {
            if (!listener) return false;
            const owned = listener;
            listener = null;
            await new Promise((resolve, reject) => owned.close((error) => (error ? reject(error) : resolve())));
            return true;
        },
    };
}
