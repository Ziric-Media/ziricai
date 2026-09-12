/**
 * In-memory platform pack version store (local verification).
 */
export class MemoryMarketplacePackVersionRepository {
    constructor() {
        /** @type {Map<string, object>} */
        this.docs = new Map();
    }

    _key(packId, version) {
        return `${packId}@${version}`;
    }

    async publishVersion({ packId, version, template, changelog = [], publishedAt }) {
        const entry = {
            packId,
            version,
            template,
            changelog,
            publishedAt: publishedAt || new Date().toISOString(),
        };
        this.docs.set(this._key(packId, version), entry);
        return entry;
    }

    async getVersion(packId, version) {
        return this.docs.get(this._key(packId, version)) || null;
    }

    async listVersions(packId) {
        return [...this.docs.values()].filter((v) => v.packId === packId);
    }
}
