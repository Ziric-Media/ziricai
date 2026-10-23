import {
    PI_PERIOD_PARAMETERS,
    buildToolEnvelope,
    loadPlatformIntelligence,
} from "../../platformIntelligence/sarahReadModels.js";
import { piSarahResponse } from "./platformIntelligenceToolCommon.js";

export default {
    name: "viewPlatformCommunications",
    description:
        "Mission Control: platform message and conversation metrics from Platform Intelligence — totals, inbound/outbound, by channel, organisation, organisation type, and sector (segment snapshots). Use for message volume questions.",
    parameters: PI_PERIOD_PARAMETERS,
    platformOnly: true,
    requiredPermissions: [],
    async execute(_ctx, args = {}) {
        const intel = await loadPlatformIntelligence(args);
        if (intel.error) {
            return piSarahResponse(
                buildToolEnvelope(intel),
                { error: intel.error, supportedPeriods: intel.supportedPeriods },
                intel.error
            );
        }
        const t = intel.communications?.totals || {};
        const msg = t.messages || {};
        const envelope = buildToolEnvelope(intel);
        return piSarahResponse(
            envelope,
            {
                communications: intel.communications,
                growthVersusPreviousPeriod: intel.growthVersusPreviousPeriod,
            },
            `Communications ${intel.period} ${intel.periodKey}: ${msg.all ?? 0} messages ` +
                `(${msg.inbound ?? 0} inbound, ${msg.outbound ?? 0} outbound), ` +
                `${t.organisationsActive ?? 0} active organisations, ` +
                `${t.conversationsActive ?? 0} conversations.`
        );
    },
};
