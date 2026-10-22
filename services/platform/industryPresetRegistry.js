/**
 * Read-only industry preset registry — loads versioned preset packages from shared/industryPresets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRESETS_ROOT = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../shared/industryPresets"
);
const PRESETS_DIR = path.join(PRESETS_ROOT, "presets");
const INSTRUCTIONS_DIR = path.join(PRESETS_ROOT, "instructions");

const ACTIVATABLE_STATUSES = new Set(["approved", "validated"]);

function readJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
}

function listPresetVersionDirs(presetId) {
    const base = path.join(PRESETS_DIR, presetId);
    if (!fs.existsSync(base)) return [];
    return fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
}

/**
 * @returns {{ presetId: string, versions: string[] }[]}
 */
export function listIndustryPresetCatalogue() {
    if (!fs.existsSync(PRESETS_DIR)) return [];
    return fs
        .readdirSync(PRESETS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({
            presetId: d.name,
            versions: listPresetVersionDirs(d.name),
        }));
}

/**
 * @param {string} presetId
 * @param {string} [version] — defaults to highest semver directory
 */
export function getIndustryPresetDocument(presetId, version) {
    const versions = listPresetVersionDirs(presetId);
    if (!versions.length) return null;
    const resolvedVersion = version || versions[versions.length - 1];
    const filePath = path.join(PRESETS_DIR, presetId, resolvedVersion, "preset.json");
    if (!fs.existsSync(filePath)) return null;
    const doc = readJsonFile(filePath);
    return { ...doc, _resolvedVersion: resolvedVersion, _sourcePath: filePath };
}

export function listInstructionBlockIds() {
    if (!fs.existsSync(INSTRUCTIONS_DIR)) return [];
    return fs
        .readdirSync(INSTRUCTIONS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
}

/**
 * @param {string} blockId
 * @returns {{ blockId: string, body: string } | null}
 */
export function loadInstructionBlock(blockId) {
    const safe = String(blockId || "").replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safe || safe !== blockId) return null;
    const filePath = path.join(INSTRUCTIONS_DIR, `${safe}.md`);
    if (!fs.existsSync(filePath)) return null;
    return { blockId: safe, body: fs.readFileSync(filePath, "utf8").trim() };
}

export function isPresetStatusActivatable(status, { allowValidated = false } = {}) {
    if (status === "approved") return true;
    if (allowValidated && status === "validated") return ACTIVATABLE_STATUSES.has(status);
    return false;
}

export function resolveInstructionBlocksForPreset(preset) {
    const blocks = [];
    const mapping = preset?.sarahMapping || {};
    const seen = new Set();
    for (const moduleKey of ["finance", "operations", "hr", "admin"]) {
        const entry = mapping[moduleKey];
        for (const blockId of entry?.instructionBlockIds || []) {
            if (seen.has(blockId)) continue;
            seen.add(blockId);
            const loaded = loadInstructionBlock(blockId);
            if (loaded) blocks.push(loaded);
        }
    }
    return blocks;
}
