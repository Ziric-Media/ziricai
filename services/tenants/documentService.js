/**
 * Document and file metadata service.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

class DocumentService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.DOCUMENTS);
    }
}

class FileService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FILES);
    }
}

const documentService = new DocumentService();
const fileService = new FileService();

export async function listDocuments(companyId, options = {}) {
    return documentService.list(companyId, options);
}

export async function saveDocument(companyId, docId, data) {
    return documentService.upsert(companyId, docId, data);
}

export async function listFiles(companyId, options = {}) {
    return fileService.list(companyId, options);
}

export async function saveFileMetadata(companyId, fileId, metadata) {
    return fileService.upsert(companyId, fileId, metadata);
}

export async function deleteFileMetadata(companyId, fileId) {
    return fileService.delete(companyId, fileId);
}
