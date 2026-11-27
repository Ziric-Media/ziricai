/**
 * ST-02 — Sarah Tasks create allowance (paid tiers; free = zero).
 */
import { getConsumerWorkTaskUsage } from "../../revenue/consumerWorkTaskUsage.js";

export async function assertConsumerSarahTaskAllowance(uid) {
    if (!uid) {
        throw Object.assign(new Error("Sign in required"), { status: 401, code: "AUTH_REQUIRED" });
    }
    const work = await getConsumerWorkTaskUsage(uid);
    const limit = Math.max(0, Number(work?.limit ?? 0));
    if (limit <= 0) {
        throw Object.assign(new Error("Sarah Tasks requires a paid plan on your account."), {
            status: 403,
            code: "TASK_ALLOWANCE",
        });
    }
    return { limit, usage: work.usage, remaining: work.remaining };
}