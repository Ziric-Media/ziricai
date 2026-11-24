import multer from "multer";
import { requireFirebaseAuth } from "../auth/requireFirebaseAuth.js";
import {
    uploadProfilePhotoForUser,
    setProfilePhotoUrlForUser,
    clearProfilePhotoForUser,
    uploadProfileCoverForUser,
    clearProfileCoverForUser,
} from "../users/profilePhotoService.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
});

const coverUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * @param {import('express').Express} app
 */
export function mountProfilePhotoRoutes(app) {
    app.post(
        "/api/auth/profile-photo",
        requireFirebaseAuth(),
        upload.single("file"),
        async (req, res) => {
            try {
                const uid = req.firebaseAuth.uid;
                const urlOnly = String(req.body?.photoUrl || "").trim();

                let profile;
                if (req.file) {
                    profile = await uploadProfilePhotoForUser(
                        uid,
                        req.file.buffer,
                        req.file.mimetype
                    );
                } else if (urlOnly) {
                    profile = await setProfilePhotoUrlForUser(uid, urlOnly);
                } else {
                    return res.status(400).json({
                        error: "Choose an image file or enter a photo URL.",
                        code: "MISSING_INPUT",
                    });
                }

                res.json({ ok: true, profile });
            } catch (err) {
                console.error("[api/auth/profile-photo]", err.message);
                res.status(err.status || 500).json({
                    error: err.message || "Profile photo save failed",
                    code: err.code || "PROFILE_PHOTO_FAILED",
                });
            }
        }
    );

    app.post("/api/auth/profile-photo/url", requireFirebaseAuth(), async (req, res) => {
        try {
            const uid = req.firebaseAuth.uid;
            const profile = await setProfilePhotoUrlForUser(uid, req.body?.photoUrl);
            res.json({ ok: true, profile });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Profile photo save failed",
                code: err.code || "PROFILE_PHOTO_FAILED",
            });
        }
    });

    app.delete("/api/auth/profile-photo", requireFirebaseAuth(), async (req, res) => {
        try {
            const uid = req.firebaseAuth.uid;
            const profile = await clearProfilePhotoForUser(uid);
            res.json({ ok: true, profile });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Profile photo remove failed",
                code: err.code || "PROFILE_PHOTO_CLEAR_FAILED",
            });
        }
    });

    app.post(
        "/api/auth/profile-cover",
        requireFirebaseAuth(),
        coverUpload.single("file"),
        async (req, res) => {
            try {
                const uid = req.firebaseAuth.uid;
                if (!req.file) {
                    return res.status(400).json({
                        error: "Choose a cover image file.",
                        code: "MISSING_INPUT",
                    });
                }
                const profile = await uploadProfileCoverForUser(uid, req.file.buffer, req.file.mimetype);
                res.json({ ok: true, profile });
            } catch (err) {
                console.error("[api/auth/profile-cover]", err.message);
                res.status(err.status || 500).json({
                    error: err.message || "Cover photo save failed",
                    code: err.code || "PROFILE_COVER_FAILED",
                });
            }
        }
    );

    app.delete("/api/auth/profile-cover", requireFirebaseAuth(), async (req, res) => {
        try {
            const uid = req.firebaseAuth.uid;
            const profile = await clearProfileCoverForUser(uid);
            res.json({ ok: true, profile });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Cover photo remove failed",
                code: err.code || "PROFILE_COVER_CLEAR_FAILED",
            });
        }
    });
}
