/**
 * User-facing messages for Embedded Signup failures (no secrets).
 */

export function mapEmbeddedSignupError(err) {
    const status = err?.status || 500;
    const msg = String(err?.message || "");

    if (status === 409) {
        if (/already active for another tenant/i.test(msg)) {
            return "This WhatsApp number is already connected to another ZiricAI workspace.";
        }
        if (/already exists/i.test(msg)) {
            return "WhatsApp is already connected for this workspace. Use Manage WhatsApp to review settings.";
        }
        return msg || "This WhatsApp connection conflicts with an existing setup.";
    }
    if (status === 400) {
        if (/phone_number_id/i.test(msg)) {
            return "Meta did not return a phone number. Complete all steps in the Meta popup, including number verification.";
        }
        if (/authorization code/i.test(msg)) {
            return "Meta authorization was incomplete. Click Connect WhatsApp and finish the Meta flow.";
        }
        return msg || "Invalid WhatsApp signup data. Please try again.";
    }
    if (status === 403) {
        return "You do not have permission to connect WhatsApp for this company.";
    }
    if (status === 503) {
        return "WhatsApp signup is temporarily unavailable — platform Meta credentials are not configured.";
    }
    if (/cancel/i.test(msg)) {
        return "WhatsApp signup was cancelled.";
    }
    return msg || "WhatsApp connection failed. Please try again.";
}
