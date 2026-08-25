/**
 * Central Motors production pilot — env-gated WhatsApp routing to central-motors-rtb.
 *
 * Enable on Railway:
 *   CENTRAL_MOTORS_PILOT=true
 * or:
 *   DEFAULT_COMPANY_ID=central-motors-rtb
 *
 * Local dev stays on demo-central-motors unless pilot flag is set explicitly.
 */
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../inventory/adapters/centralMotorsRtbAdapter.js";

export { CENTRAL_MOTORS_RTB_COMPANY_ID };

export function isCentralMotorsPilotMode() {
    const flag = String(process.env.CENTRAL_MOTORS_PILOT || "").trim().toLowerCase();
    if (flag === "true" || flag === "1" || flag === "yes") return true;
    if (flag === "false" || flag === "0" || flag === "no") return false;
    return process.env.DEFAULT_COMPANY_ID === CENTRAL_MOTORS_RTB_COMPANY_ID;
}
