/**
 * Server-side profile photo upload (Firebase Admin Storage + users/{uid}).
 */
import crypto from "crypto";
import admin from "firebase-admin";
import { getAdminFirestore, hasAdminCredentials } from "../database/firestoreAdmin.js";
import { getFirebaseProjectId } from "../../js/firebase-config.js";

const MAX_BYTES = 2 * 1024 * 1024;
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extForType(type) {
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/gif") return "gif";
    return "jpg";
}

function storageUnavailable() {
    const err = new Error("Profile photo upload is not available on the server.");
    err.status = 503;
    err.code = "STORAGE_UNAVAILABLE";
    return err;
}

function getBucket() {
    if (!hasAdminCredentials()) throw storageUnavailable();
    getAdminFirestore();
    const projectId = getFirebaseProjectId();
    const bucketName =
        String(process.env.FIREBASE_STORAGE_BUCKET || "").trim() ||
        `${projectId}.firebasestorage.app`;
    return admin.storage().bucket(bucketName);
}

function buildDownloadUrl(bucketName, objectPath, token) {
    const encoded = encodeURIComponent(objectPath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

async function patchUserVisualUrl(uid, patch) {
    const db = getAdminFirestore();
    if (!db) throw storageUnavailable();
    const ref = db.collection("users").doc(uid);
    await ref.set(
        {
            ...patch,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    const snap = await ref.get();
    return snap.exists ? { uid, ...snap.data() } : { uid, ...patch };
}

async function patchUserPhotoUrl(uid, photoURL) {
    return patchUserVisualUrl(uid, { photoURL: photoURL || "" });
}

async function patchUserCoverUrl(uid, coverURL) {
    return patchUserVisualUrl(uid, { coverURL: coverURL || "" });
}

async function syncAuthPhotoUrl(uid, photoURL) {
    try {
        await admin.auth().updateUser(uid, { photoURL: photoURL || null });
    } catch (err) {
        console.warn("[profilePhoto] Auth photoURL update skipped:", err.message);
    }
}

/**
 * @param {string} uid
 * @param {Buffer} buffer
 * @param {string} contentType
 */
export async function uploadProfilePhotoForUser(uid, buffer, contentType) {
    if (!ALLOWED.has(contentType)) {
        const err = new Error("Use a JPEG, PNG, WebP, or GIF image.");
        err.status = 400;
        err.code = "INVALID_TYPE";
        throw err;
    }
    if (!buffer || buffer.length > MAX_BYTES) {
        const err = new Error("Image must be under 2 MB.");
        err.status = 400;
        err.code = "FILE_TOO_LARGE";
        throw err;
    }

    const ext = extForType(contentType);
    const objectPath = `user-profiles/${uid}/avatar.${ext}`;
    const token = crypto.randomUUID();
    const bucket = getBucket();
    const file = bucket.file(objectPath);

    await file.save(buffer, {
        metadata: {
            contentType,
            cacheControl: "public, max-age=3600",
            metadata: { firebaseStorageDownloadTokens: token },
        },
    });

    const photoURL = buildDownloadUrl(bucket.name, objectPath, token);
    const profile = await patchUserPhotoUrl(uid, photoURL);
    await syncAuthPhotoUrl(uid, photoURL);
    return profile;
}

/**
 * @param {string} uid
 * @param {string} photoURL
 */
export async function setProfilePhotoUrlForUser(uid, photoURL) {
    const trimmed = String(photoURL || "").trim();
    if (!trimmed) {
        const err = new Error("Photo URL is required.");
        err.status = 400;
        err.code = "URL_REQUIRED";
        throw err;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
        const err = new Error("Enter a valid http(s) image URL.");
        err.status = 400;
        err.code = "INVALID_URL";
        throw err;
    }
    const profile = await patchUserPhotoUrl(uid, trimmed);
    await syncAuthPhotoUrl(uid, trimmed);
    return profile;
}

/** @param {string} uid */
export async function clearProfilePhotoForUser(uid) {
    const profile = await patchUserPhotoUrl(uid, "");
    await syncAuthPhotoUrl(uid, "");
    return profile;
}

/**
 * @param {string} uid
 * @param {Buffer} buffer
 * @param {string} contentType
 */
export async function uploadProfileCoverForUser(uid, buffer, contentType) {
    if (!ALLOWED.has(contentType)) {
        const err = new Error("Use a JPEG, PNG, WebP, or GIF image.");
        err.status = 400;
        err.code = "INVALID_TYPE";
        throw err;
    }
    if (!buffer || buffer.length > COVER_MAX_BYTES) {
        const err = new Error("Cover image must be under 5 MB.");
        err.status = 400;
        err.code = "FILE_TOO_LARGE";
        throw err;
    }

    const ext = extForType(contentType);
    const objectPath = `user-profiles/${uid}/cover.${ext}`;
    const token = crypto.randomUUID();
    const bucket = getBucket();
    const file = bucket.file(objectPath);

    await file.save(buffer, {
        metadata: {
            contentType,
            cacheControl: "public, max-age=3600",
            metadata: { firebaseStorageDownloadTokens: token },
        },
    });

    const coverURL = buildDownloadUrl(bucket.name, objectPath, token);
    return patchUserCoverUrl(uid, coverURL);
}

/** @param {string} uid */
export async function clearProfileCoverForUser(uid) {
    return patchUserCoverUrl(uid, "");
}
