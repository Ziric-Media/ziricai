#!/usr/bin/env node
/**
 * Upload Sach Discover logo + cover from sachaccounting.co.za (ops / Spencer-approved).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { SACH_CONSULT_COMPANY_ID, SACH_DISPLAY_NAME } from "../services/consulting/sachConsultBootstrap.js";
import {
    createListingMediaUpload,
    completeListingMediaUpload,
    buildListingMediaPublicUrl,
} from "../services/network/networkListingMediaService.js";
import { saveListingDraft, getListing } from "../services/network/networkProfileService.js";
import { hasAdminCredentials } from "../services/storage/storageAdapter.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const SITE = "https://sachaccounting.co.za";

async function fetchHtml(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "ZiricAI-Sach-Branding/1.0" },
        redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
}

function pickImageUrls(html, baseUrl) {
    const urls = new Set();
    const abs = (u) => {
        try {
            return new URL(u, baseUrl).href;
        } catch {
            return null;
        }
    };
    for (const m of html.matchAll(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
        const u = abs(m[1]);
        if (u && /\.(png|jpe?g|webp)(\?|$)/i.test(u)) urls.add(u);
    }
    for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) {
        const u = abs(m[1]);
        if (u) urls.add(u);
    }
    for (const m of html.matchAll(/content=["']([^"']+)["'][^>]+property=["']og:image["']/gi)) {
        const u = abs(m[1]);
        if (u) urls.add(u);
    }
    const list = [...urls];
    const logo =
        list.find((u) => /logo/i.test(u)) ||
        list.find((u) => /brand|header/i.test(u)) ||
        list[0] ||
        null;
    const cover =
        list.find((u) => /banner|hero|slide|cover|welcome|team/i.test(u) && u !== logo) ||
        list.find((u) => u !== logo) ||
        logo;
    return { logo, cover, all: list };
}

async function downloadImage(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "ZiricAI-Sach-Branding/1.0", Accept: "image/*" },
        redirect: "follow",
    });
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
    const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
        throw new Error(`Unsupported image type ${mimeType} from ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`Empty image from ${url}`);
    if (buf.length > 5 * 1024 * 1024) throw new Error(`Image too large from ${url}`);
    return { buf, mimeType };
}

async function uploadBytes(companyId, fileName, { buf, mimeType }) {
    const { uploadId, token } = await createListingMediaUpload(companyId, {
        mimeType,
        fileName,
        byteLength: buf.length,
    });
    const done = await completeListingMediaUpload(companyId, uploadId, token, buf);
    return done.publicUrl || buildListingMediaPublicUrl(uploadId, token);
}

async function main() {
    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS — run with Railway/production Firestore credentials.");
        process.exit(2);
    }
    await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

    const companyId = SACH_CONSULT_COMPANY_ID;
    const html = await fetchHtml(SITE);
    const { logo, cover, all } = pickImageUrls(html, SITE);
    if (!logo) {
        console.error("No logo URL found on", SITE, "candidates:", all.slice(0, 10));
        process.exit(1);
    }

    const logoBuf = await downloadImage(logo);
    const coverSrc = cover && cover !== logo ? cover : logo;
    const coverBuf = coverSrc === logo ? logoBuf : await downloadImage(coverSrc);

    const logoUrl = await uploadBytes(companyId, "sach-logo.png", logoBuf);
    const coverUrl = await uploadBytes(companyId, "sach-cover.jpg", coverBuf);

    const listing = await getListing(companyId);
    const prior = listing.profile || {};

    await saveListingDraft(
        companyId,
        {
            displayName: prior.displayName || SACH_DISPLAY_NAME,
            industry: prior.industry || "Professional Services — Accounting & Tax",
            shortDescription:
                prior.shortDescription ||
                "Accounting, tax, payroll, and business advisory for SMEs in Rustenburg and across South Africa.",
            location: prior.location || "Rustenburg, North West",
            address: prior.address || "169 Joubert Street, Rustenburg, 0300",
            logoUrl,
            coverUrl,
            contact: {
                phone: prior.contact?.phone || "+27 14 592 1351",
                email: prior.contact?.email || "hello@sachaccounting.co.za",
                website: prior.contact?.website || "https://sachaccounting.co.za",
            },
        },
        "sach-branding-script"
    );

    console.log(
        JSON.stringify(
            {
                companyId,
                logoUrl,
                coverUrl,
                source: { logo, cover: coverSrc },
                sarahDiscover: `https://sarah.ziricai.com/#discover/${companyId}`,
            },
            null,
            2
        )
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});