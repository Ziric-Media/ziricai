/**
 * Deploy preflight — every relative import in api/ and services/ must resolve to a file,
 * and every named import must be exported by that file.
 * Usage: node scripts/verify-import-resolution.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["api", "services"];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(m?js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const exportCache = new Map();

function exportsOf(file) {
    if (exportCache.has(file)) return exportCache.get(file);
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const names = new Set();
    let star = false;
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    for (const m of src.matchAll(/export\s+(?:const|let|var)\s+\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
            const name = part.split(":").pop().trim().split("=")[0].trim();
            if (name) names.add(name);
        }
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}(\s*from\s*["']([^"']+)["'])?/g)) {
        for (const part of m[1].split(",")) {
            const bits = part.trim().split(/\s+as\s+/);
            const name = (bits[1] || bits[0]).trim();
            if (name) names.add(name);
        }
    }
    if (/export\s+default\b/.test(src)) names.add("default");
    for (const m of src.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
        if (!m[1].startsWith(".")) {
            star = true;
            continue;
        }
        const target = path.resolve(path.dirname(file), m[1]);
        if (fs.existsSync(target)) {
            const inner = exportsOf(target);
            if (inner.star) star = true;
            for (const n of inner.names) if (n !== "default") names.add(n);
        }
    }
    const result = { names, star };
    exportCache.set(file, result);
    return result;
}

function parseImportClause(clause) {
    const named = [];
    let hasDefault = false;
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
        for (const part of braces[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name) named.push(name);
        }
    }
    const head = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+[\w$]+/, "").replace(/,/g, " ").trim();
    if (head && head !== "type") hasDefault = true;
    return { named, hasDefault };
}

const failures = [];
let checked = 0;

for (const dir of SCAN_DIRS) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const file of walk(base)) {
        const src = stripComments(fs.readFileSync(file, "utf8"));
        const rel = path.relative(ROOT, file);

        const specs = [];
        for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
            specs.push({ clause: m[1], spec: m[2] });
        }
        for (const m of src.matchAll(/(?:^|[^\w.])import\s+["']([^"']+)["']/g)) {
            specs.push({ clause: "", spec: m[1] });
        }
        for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
            specs.push({ clause: "", spec: m[1] });
        }
        for (const m of src.matchAll(/export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g)) {
            specs.push({ clause: "", spec: m[1] });
        }

        for (const { clause, spec } of specs) {
            if (!spec.startsWith(".")) continue;
            checked += 1;
            const target = path.resolve(path.dirname(file), spec);
            if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
                failures.push(`${rel}: cannot resolve "${spec}"`);
                continue;
            }
            if (!clause || !/\.m?js$/.test(target)) continue;
            const { named, hasDefault } = parseImportClause(clause);
            const exp = exportsOf(target);
            if (exp.star) continue;
            for (const name of named) {
                if (!exp.names.has(name)) failures.push(`${rel}: "${name}" is not exported by "${spec}"`);
            }
            if (hasDefault && !exp.names.has("default")) {
                failures.push(`${rel}: default import from "${spec}" but no default export`);
            }
        }
    }
}

if (failures.length) {
    console.error(`Import resolution FAILED (${failures.length} problem(s), ${checked} relative imports checked):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
}
console.log(`✓ import resolution: ${checked} relative imports in ${SCAN_DIRS.join(", ")} resolve with matching exports`);
