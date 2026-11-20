/**
 * SNET-03 — listing logo/cover uploads.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mountNetworkListingRoutes } from "../services/api/networkListingRoutes.js";
import {
    clearListingMediaForTests,
    createListingMediaUpload,
    completeListingMediaUpload,
    getListingMediaContent,
    buildListingMediaPublicUrl,
} from "../services/network/networkListingMediaService.js";
import { clearChatMediaBlobsForTests } from "../services/users/chatMediaBlobStore.js";

const companyId = "media-co";
const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

test("listing media upload returns same-origin API path and serves bytes", async () => {
    clearListingMediaForTests();
    const { uploadId, token } = await createListingMediaUpload(companyId, {
        mimeType: "image/png",
        fileName: "logo.png",
        byteLength: PNG_1X1.length,
    });
    const done = await completeListingMediaUpload(companyId, uploadId, token, PNG_1X1);
    assert.match(done.publicUrl, /^\/api\/network\/v1\/listing-media\//);
    assert.equal(done.publicUrl, buildListingMediaPublicUrl(uploadId, token));

    const served = await getListingMediaContent(uploadId, token);
    assert.equal(served.buffer.length, PNG_1X1.length);
    assert.equal(served.mimeType, "image/png");
});

test("listing media rejects unsupported mime", async () => {
    clearListingMediaForTests();
    await assert.rejects(
        () => createListingMediaUpload(companyId, { mimeType: "application/pdf", byteLength: 100 }),
        { code: "UPLOAD_TYPE_NOT_ALLOWED" }
    );
});

test("GET /listing-media/:id/content serves bytes (publicReadRateLimit factory invoked)", async () => {
    clearListingMediaForTests();
    clearChatMediaBlobsForTests();
    const { uploadId, token } = await createListingMediaUpload(companyId, {
        mimeType: "image/png",
        fileName: "logo.png",
        byteLength: PNG_1X1.length,
    });
    await completeListingMediaUpload(companyId, uploadId, token, PNG_1X1);
    const app = express();
    mountNetworkListingRoutes(app);
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const port = server.address().port;
        const url = `http://127.0.0.1:${port}/api/network/v1/listing-media/${uploadId}/content?token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") || "", /^image\//);
        const body = Buffer.from(await res.arrayBuffer());
        assert.equal(body.length, PNG_1X1.length);
    } finally {
        server.close();
    }
});
