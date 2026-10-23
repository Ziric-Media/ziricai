import {
    PI_PERIOD_PARAMETERS,
    buildToolEnvelope,
    loadPlatformIntelligence,
} from "../../platformIntelligence/sarahReadModels.js";
import { piSarahResponse } from "./platformIntelligenceToolCommon.js";

export default {
    name: "viewPlatformUserNetwork",
    description:
        "Mission Control: platform people network — unique people, new vs returning, multi-organisation and multi-channel (strong match only), by organisation type and sector. Use for end-user / people questions.",
    parameters: PI_PERIOD_PARAMETERS,
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args = {}) {
        const intel = await loadPlatformIntelligence(args);
        if (intel.error) {
            return piSarahResponse(
                buildToolEnvelope(intel),
                { error: intel.error },
                intel.error
            );
        }
        const u = intel.userNetwork?.totals || {};
        const envelope = buildToolEnvelope(intel);
        return piSarahResponse(
            envelope,
            { userNetwork: intel.userNetwork },
            `People network ${intel.period} ${intel.periodKey}: ${u.uniquePlatformUsersActive ?? 0} unique people ` +
                `(${u.newPlatformUsers ?? 0} new, ${u.returningPlatformUsersActive ?? 0} returning), ` +
                `${u.multiOrganisationUsersActive ?? 0} multi-organisation, ` +
                `${u.multiChannelUsersActive ?? 0} multi-channel.`
        );
    },
};
