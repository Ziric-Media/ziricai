/**
 * Knowledge upload + listing — legacy flat `knowledge` collection in Firestore mode.
 * @deprecated Use services/tenants/knowledgeService.js for tenant-scoped documents.
 */
import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../js/firebase.js";
import { getStorageAdapter } from "./storage/storageAdapter.js";

export async function loadKnowledge(file) {
    try {
        const data = await fs.readFile(file, "utf8");
        return JSON.parse(data);
    } catch (err) {
        console.error(err);
        return null;
    }
}

export async function parseUploadedFile(buffer, mimetype, originalname) {
    const ext = path.extname(originalname || "").toLowerCase();
    if (mimetype === "application/pdf" || ext === ".pdf") {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();
        return result.text || "";
    }
    if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        ext === ".docx"
    ) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value || "";
    }
    if (mimetype === "text/plain" || ext === ".txt") {
        return buffer.toString("utf8");
    }
    throw new Error(`Unsupported file type: ${mimetype || ext || "unknown"}`);
}

export async function saveKnowledgeDocument({ companyId, title, type, content, url, fileName }) {
    const adapter = await getStorageAdapter();
    if (adapter.saveKnowledgeDoc && (process.env.STORAGE_BACKEND || "auto").toLowerCase() === "memory") {
        return adapter.saveKnowledgeDoc({
            companyId,
            title,
            type,
            content: content || "",
            url: url || "",
            fileName: fileName || "",
            status: "active",
        });
    }

    try {
        const ref = await addDoc(collection(db, "knowledge"), {
            companyId,
            title,
            type,
            content: content || "",
            url: url || "",
            fileName: fileName || "",
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { id: ref.id };
    } catch (err) {
        if (adapter.saveKnowledgeDoc) {
            console.warn("[knowledge] Firestore save failed, using memory adapter:", err.message);
            return adapter.saveKnowledgeDoc({
                companyId,
                title,
                type,
                content: content || "",
                url: url || "",
                fileName: fileName || "",
                status: "active",
            });
        }
        throw err;
    }
}

export async function listKnowledgeDocuments(companyId) {
    const adapter = await getStorageAdapter();
    if (adapter.listKnowledgeDocs && (process.env.STORAGE_BACKEND || "auto").toLowerCase() === "memory") {
        return adapter.listKnowledgeDocs({ companyId });
    }

    try {
        const constraints = [orderBy("createdAt", "desc")];
        if (companyId) {
            constraints.unshift(where("companyId", "==", companyId));
        }
        const q = query(collection(db, "knowledge"), ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (err) {
        if (adapter.listKnowledgeDocs) {
            console.warn("[knowledge] Firestore list failed, using memory adapter:", err.message);
            return adapter.listKnowledgeDocs({ companyId });
        }
        throw err;
    }
}

/** Simple keyword retrieval for worker pipeline — swap for embeddings later. */
export async function retrieveKnowledgeContext(companyId, queryText) {
    const terms = String(queryText || "")
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);

    let docs = [];
    try {
        docs = await listKnowledgeDocuments(companyId);
    } catch (err) {
        console.warn("[knowledge] Firestore list failed, using local fallback:", err.message);
    }

    if (!docs.length) {
        const local = await loadKnowledge(path.join(process.cwd(), "knowledge", "ziric-media.json"));
        if (local) {
            docs = [
                {
                    title: local.company || "Ziric Media",
                    content: JSON.stringify(local, null, 2),
                    type: "json",
                },
            ];
        }
    }

    const scored = docs
        .map((doc) => {
            const hay = `${doc.title || ""} ${doc.content || ""}`.toLowerCase();
            const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
            return { doc, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    const picks = scored.length ? scored.map((r) => r.doc) : docs.slice(0, 1);
    const context = picks
        .map((d) => `### ${d.title || "Document"}\n${(d.content || "").slice(0, 1500)}`)
        .join("\n\n");

    return {
        context,
        sources: picks.map((d) => d.title || d.id || "unknown"),
    };
}
