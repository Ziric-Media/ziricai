/**
 * Require explicit user consent before Sarah applies navigate / modal uiHints.
 */

const CONSENT_YES = [
    /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|do it|go ahead|absolutely|correct)\.?\s*$/i,
    /\b(yes please|yes, please|take me there|open it now|open that now|do that now|go ahead and)\b/i,
    /\btake me (?:there|now)\b/i,
    /\bopen (?:it|that|the setup|the wizard)\b/i,
];

const CONSENT_NO = [
    /^\s*(no|nope|not now|later|cancel|stop)\.?\s*$/i,
    /\b(not right now|maybe later|don't)\b/i,
];

const PORTAL_LABELS = {
    integrations: "Integrations",
    agents: "AI Employees",
    knowledge: "Knowledge Base",
    billing: "Billing",
    inbox: "Inbox",
    settings: "Settings",
    sarah: "Sarah",
};

export function requiresNavigationConsent(uiHints = []) {
    return (uiHints || []).some((h) => h?.navigate || h?.openWizard);
}

export function labelForUiHints(uiHints = []) {
    const hints = uiHints || [];
    if (hints.some((h) => h.openWizard === "connectWhatsApp")) {
        return "Connect WhatsApp setup";
    }
    const nav = hints.find((h) => h.navigate)?.navigate;
    if (nav) return PORTAL_LABELS[nav] || nav;
    const wizard = hints.find((h) => h.openWizard)?.openWizard;
    if (wizard) return wizard;
    return "the next step";
}

export function buildConsentQuestion(uiHints = []) {
    const hints = uiHints || [];
    if (hints.some((h) => h.openWizard === "connectWhatsApp")) {
        return "Do you want me to open the Connect WhatsApp setup now?";
    }
    const nav = hints.find((h) => h.navigate)?.navigate;
    if (nav === "integrations") {
        return "Do you want me to take you to Integrations now?";
    }
    if (nav) {
        const label = PORTAL_LABELS[nav] || nav;
        return `Do you want me to take you to ${label} now?`;
    }
    return "Do you want me to take you there now?";
}

export function isNavigationConsentYes(message) {
    const text = String(message || "").trim();
    if (!text) return false;
    return CONSENT_YES.some((p) => p.test(text));
}

export function isNavigationConsentDecline(message) {
    const text = String(message || "").trim();
    if (!text) return false;
    return CONSENT_NO.some((p) => p.test(text));
}

/**
 * Strip immediate uiHints and attach consent question; caller stores pending on session.
 */
export function shouldSkipNavigationDefer({ mode, consentGranted, waIntent, uiHints = [] }) {
    if (consentGranted || mode === "navigation-confirmed") return true;
    return (
        waIntent === "connect" && (uiHints || []).some((h) => h.openWizard === "connectWhatsApp")
    );
}

export function deferUiHintsForConsent(reply, uiHints = []) {
    const hints = uiHints || [];
    if (!requiresNavigationConsent(hints)) {
        return { reply, uiHints: hints, deferred: false };
    }

    const question = buildConsentQuestion(hints);
    let nextReply = String(reply || "").trim();
    if (!nextReply.toLowerCase().includes("do you want me to")) {
        nextReply = nextReply ? `${nextReply}\n\n${question}` : question;
    }

    return {
        reply: nextReply,
        uiHints: [],
        deferred: true,
        pendingUiHints: hints,
        pendingUiLabel: labelForUiHints(hints),
    };
}
