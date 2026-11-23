/**
 * Detect client confirmation after Sarah presented a service-request summary.
 */

const AFFIRMATIVE_SHORT =
    /^(yes|yeah|yep|yup|correct|that's correct|that is correct|looks good|all good|please go ahead|go ahead|proceed|submit|confirm|confirmed|ok|okay|sure|its correct|it's correct)([.!,\s]|$)/i;

/** @param {string} text */
export function isAffirmativeConfirmation(text) {
    const t = String(text || "").trim();
    if (!t || t.length > 160) return false;
    if (AFFIRMATIVE_SHORT.test(t)) return true;
    if (t.split(/\s+/).length > 14) return false;
    return /\b(yes|correct|go ahead|proceed|submit|confirm|that's right|that is right)\b/i.test(t);
}

/**
 * @param {{ role?: string, content?: string }[]} history
 */
export function assistantAwaitedSubmissionConfirm(history = []) {
    const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
    const content = String(lastAssistant?.content || "");
    if (!content) return false;
    return (
        /please confirm/i.test(content) ||
        /everything looks correct/i.test(content) ||
        /submit (this|to our team)/i.test(content) ||
        /proceed to submit/i.test(content) ||
        /Saved service request/i.test(content) ||
        /Saved — please confirm/i.test(content) ||
        /\*\*Reference:\*\*/i.test(content)
    );
}