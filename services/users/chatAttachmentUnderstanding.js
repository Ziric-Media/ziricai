/**
 * CHAT-01 — Interpret user chat attachments (images + voice) for Sarah contexts.
 */
import OpenAI from "openai";
import { bootstrapEnv } from "../env/startupEnv.js";
import { transcribeAudio } from "../openai.js";
import { getChatMediaContent, parseChatMediaTokenFromUrl } from "./chatMediaService.js";
import { normalizeAttachments } from "./personToPersonConversationService.js";

bootstrapEnv();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function uploadIdFromAttachment(att) {
    if (att?.uploadId) return String(att.uploadId);
    const url = String(att?.url || "");
    const match = url.match(/\/api\/chat\/media\/([^/?]+)/);
    return match ? decodeURIComponent(match[1]) : "";
}

/**
 * @param {object[]} attachments
 * @returns {Promise<{ summary: string, normalized: object[] }>}
 */
export async function enrichMessageWithAttachments(text, attachments = []) {
    const normalized = normalizeAttachments(attachments);
    if (!normalized.length) {
        return { text: String(text || "").trim(), attachments: [], modelContext: String(text || "").trim() };
    }

    const captions = [];
    for (const att of normalized) {
        const uploadId = uploadIdFromAttachment(att);
        const token = parseChatMediaTokenFromUrl(att.url) || att.token;
        if (!uploadId || !token) continue;
        let media;
        try {
            media = await getChatMediaContent(uploadId, token);
        } catch {
            captions.push("[Attachment could not be read]");
            continue;
        }
        const mime = String(media.mimeType || att.mimeType || "");
        try {
            if (mime.startsWith("image/")) {
                const desc = await describeImage(media.buffer, mime);
                captions.push(`[Image — ${att.name || "photo"}]: ${desc}`);
            } else if (mime.startsWith("audio/")) {
                const { text: transcript } = await transcribeAudio(media.buffer, {
                    mimeType: mime,
                    filename: att.name || "voice.webm",
                });
                const clean = String(transcript || "").trim();
                captions.push(clean ? `[Voice note]: ${clean}` : "[Voice note: no speech detected]");
            } else if (mime.startsWith("video/")) {
                captions.push(`[Video attached — ${att.name || "video"}]`);
            } else {
                const label = att.name || "document";
                const ref = uploadId ? `uploadId=${uploadId}` : "";
                captions.push(`[Document — ${label}${ref ? `; ${ref}` : ""}]`);
            }
        } catch (err) {
            captions.push(`[${att.name || "Attachment"}: could not interpret — ${err.message}]`);
        }
    }

    const visible = String(text || "").trim();
    const modelContext = [visible, ...captions].filter(Boolean).join("\n\n");
    return { text: visible, attachments: normalized, modelContext: modelContext || visible };
}

async function describeImage(buffer, mimeType) {
    if (!openai) return "User shared an image (vision unavailable without OPENAI_API_KEY).";
    const b64 = buffer.toString("base64");
    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Describe this image in 1–3 concise sentences for a customer-service chat assistant.",
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${b64}` },
                    },
                ],
            },
        ],
        max_tokens: 180,
    });
    return String(response.choices[0]?.message?.content || "").trim() || "Image attached.";
}
