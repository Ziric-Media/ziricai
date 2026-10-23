/**
 * Platform capability catalogue for industry presets — code-maintained, not tenant-editable.
 */
import platformCapabilities from "../../shared/industryPresets/capabilities/platformCapabilities.json" with { type: "json" };

/** @type {Record<string, { class: string, label?: string, sarahModules?: string[] }>} */
const CAPABILITIES = platformCapabilities.capabilities || {};

export function getPlatformCapabilityCatalogue() {
    return { ...CAPABILITIES };
}

export function getPlatformCapability(capabilityId) {
    return CAPABILITIES[capabilityId] || null;
}

export function listPlatformCapabilityIds() {
    return Object.keys(CAPABILITIES);
}
