/**
 * SW-07 — Work deliverables store + reference files from session messages.
 */
import { deriveAssignmentStatus } from "./personalSarahWorkWorkspace.js";
import { hasPendingLevel2Approval } from "./personalSarahWorkApprovals.js";

function defaultDeliverableTitle(session) {
    const msgs = Array.isArray(session?.messages) ? session.messages : [];
    const brief = String(msgs.find((m) => m.role === "user")?.content || session?.title || "").trim();
    if (/\bproposal\b/i.test(brief)) return "Business proposal";
    if (/\breport\b/i.test(brief)) return "Report";
    if (/\bpresentation\b/i.test(brief)) return "Presentation";
    return "Assignment deliverable";
}

function deliverableStatus(session) {
    const status = deriveAssignmentStatus(session);
    if (status === "completed" && session?.workReport?.markdown) {
        if (hasPendingLevel2Approval(session)) return "pending_approval";
        return "ready";
    }
    if (status === "paused") return "pending";
    if (status === "running") return "in_progress";
    return "pending";
}

/**
 * @param {object} session
 */
export function buildWorkDeliverables(session) {
    const status = deliverableStatus(session);
    const primaryTitle = defaultDeliverableTitle(session);
    const report = session?.workReport;
    const items = [
        {
            id: "del-primary",
            title: report?.taskTitle || primaryTitle,
            kind: "document",
            format: "markdown",
            status,
            summary: report?.summary || null,
            milestoneId: "m4",
            readyAt: session?.workCompletedAt || null,
            charCount: report?.markdown ? String(report.markdown).length : 0,
        },
    ];
    const research = report?.execution?.research || session?.workWorkspace?.artifacts?.research;
    const researchText = String(research || "").trim();
    if (researchText) {
        items.push({
            id: "del-research",
            title: "Research notes",
            kind: "summary",
            format: "markdown",
            status: status === "ready" ? "ready" : researchText ? "ready" : "pending",
            summary: researchText.slice(0, 280),
            milestoneId: "m2",
            readyAt: null,
            charCount: researchText.length,
        });
    }
  const review = report?.execution?.review;
  if (String(review || "").trim()) {
      items.push({
          id: "del-brief-review",
          title: "Brief review",
          kind: "summary",
          format: "markdown",
          status: "ready",
          summary: String(review).slice(0, 280),
          milestoneId: "m1",
          charCount: String(review).length,
      });
  }
    return items;
}

function fileIdFromAttachment(att, index) {
    const upload = att?.uploadId || att?.id || `att-${index}`;
    return `file-${String(upload).replace(/[^\w-]/g, "").slice(0, 48)}`;
}

function extractMessageLinks(text) {
    const urls = String(text || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
    return [...new Set(urls)].slice(0, 8);
}

/**
 * @param {object} session
 */
export function buildWorkReferenceFiles(session) {
    const files = [];
    const msgs = Array.isArray(session?.messages) ? session.messages : [];
    msgs.forEach((msg, msgIndex) => {
        const at = msg.timestamp || session.lastMessageAt || null;
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
        attachments.forEach((att, attIndex) => {
            files.push({
                id: fileIdFromAttachment(att, msgIndex * 10 + attIndex),
                name: String(att.name || att.filename || "Attachment").slice(0, 120),
                mimeType: String(att.mimeType || att.type || "application/octet-stream"),
                url: att.url || att.downloadUrl || null,
                uploadId: att.uploadId || null,
                source: "chat_attachment",
                role: msg.role || "user",
                messageIndex: msgIndex,
                addedAt: at,
                contextPreview: String(msg.content || "").trim().slice(0, 160) || null,
            });
        });
        if (msg.role === "user") {
            for (const url of extractMessageLinks(msg.content)) {
                files.push({
                    id: `link-${msgIndex}-${files.length}`,
                    name: url.length > 64 ? `${url.slice(0, 61)}…` : url,
                    mimeType: "text/uri-list",
                    url,
                    source: "message_link",
                    role: "user",
                    messageIndex: msgIndex,
                    addedAt: at,
                    contextPreview: String(msg.content || "").trim().slice(0, 160) || null,
                });
            }
        }
    });
    const seen = new Set();
    return files.filter((f) => {
        const key = `${f.id}|${f.url || ""}|${f.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * @param {object} session
 * @param {string} deliverableId
 */
export function resolveWorkDeliverableBody(session, deliverableId) {
    const id = String(deliverableId || "").trim();
    const report = session?.workReport;
    if (id === "del-primary" && report?.markdown) {
        return {
            id,
            title: report.taskTitle || defaultDeliverableTitle(session),
            format: "markdown",
            markdown: report.markdown,
            generatedAt: report.generatedAt || session.workCompletedAt,
        };
    }
    if (id === "del-research") {
        const text = report?.execution?.research || "";
        if (!text) return null;
        return {
            id,
            title: "Research notes",
            format: "markdown",
            markdown: `## Research notes\n\n${text}`,
            generatedAt: report?.generatedAt || null,
        };
    }
    if (id === "del-brief-review") {
        const text = report?.execution?.review || "";
        if (!text) return null;
        return {
            id,
            title: "Brief review",
            format: "markdown",
            markdown: `## Brief review\n\n${text}`,
            generatedAt: report?.generatedAt || null,
        };
    }
    const row = (session?.workWorkspace?.deliverables || []).find((d) => d.id === id);
    if (row && row.inlineMarkdown) {
        return {
            id,
            title: row.title,
            format: row.format || "markdown",
            markdown: row.inlineMarkdown,
            generatedAt: row.readyAt || null,
        };
    }
    return null;
}

/**
 * Merge deliverables + files into workspace (called from syncWorkWorkspace).
 * @param {object} workspace
 * @param {object} session
 */
export function mergeWorkArtifacts(workspace, session) {
    if (!workspace || !session) return;
    workspace.deliverables = buildWorkDeliverables(session);
    workspace.files = buildWorkReferenceFiles(session);
    workspace.artifactsVersion = 1;
}