/**
 * Resolve Sarah App consumer profile photos for tenant inbox (list + detail).
 */
import admin from "firebase-admin";
import { getConsumerProfile } from "./consumerProfileService.js";
import { getUserProfile } from "../auth/authService.js";
import {
    inferChannelFromConversationId,
    resolveSarahAppUidFromRef,
} from "../conversation/tenantConversationRef.js";
import { hasAdminCredentials } from "../database/firestoreAdmin.js";

/**
 * @param {object} [conv]
 */
export function sarahAppUidFromConversation(conv = {}) {
    const ref = String(conv.customerId || conv.phone || conv.id || conv.conversationId || "").trim();
    if (!ref) return "";
    if (ref.includes("sarah_app") || inferChannelFromConversationId(ref) === "sarah_app") {
        return resolveSarahAppUidFromRef(ref);
    }
    const channel = conv.channel || inferChannelFromConversationId(conv.id || conv.conversationId);
    if (channel === "sarah_app") {
        return resolveSarahAppUidFromRef(conv.externalUserId || ref);
    }
    return "";
}

async function getAuthPhotoUrl(uid) {
    if (!uid || !hasAdminCredentials()) return null;
    try {
        const user = await admin.auth().getUser(uid);
        const url = user?.photoURL ? String(user.photoURL).trim() : "";
        return url || null;
    } catch {
        return null;
    }
}

function existingPhoto(conv = {}) {
    const url = conv.customerPhotoUrl || conv.avatarUrl || conv.photoURL;
    return url ? String(url).trim() : null;
}

/**
 * @param {object} conv — inbox row or customer/conversation patch context
 */
export async function resolveConsumerPhotoUrl(conv = {}) {
    const cached = existingPhoto(conv);
    if (cached) return cached;

    const uid = sarahAppUidFromConversation(conv);
    if (!uid) return null;

    try {
        const [consumer, global, authPhoto] = await Promise.all([
            getConsumerProfile(uid),
            getUserProfile(uid),
            getAuthPhotoUrl(uid),
        ]);
        return (
            global?.photoURL ||
            global?.photoUrl ||
            consumer?.photoURL ||
            consumer?.photoUrl ||
            authPhoto ||
            null
        );
    } catch {
        return null;
    }
}