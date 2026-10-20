import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../inventory/adapters/centralMotorsRtbAdapter.js";
import { DEMO_COMPANY_ID } from "../core/dataMode.js";
import { resolvePilotDataCompanyId } from "../storage/centralMotorsPilot.js";

export { CENTRAL_MOTORS_RTB_COMPANY_ID, DEMO_COMPANY_ID };

export function resolveBosCompanyId(companyId) {
    return resolvePilotDataCompanyId(companyId) || companyId;
}

export function isBosPilotTenant(companyId) {
    const id = resolveBosCompanyId(companyId);
    return id === CENTRAL_MOTORS_RTB_COMPANY_ID || id === DEMO_COMPANY_ID;
}
