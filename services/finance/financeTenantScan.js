/**
 * Paginated tenant Finance reads for Sarah summaries (complete scan with safety cap).
 */

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_RECORDS = 2000;

/**
 * @param {(companyId: string, options: object) => Promise<{ items: object[], nextCursor: string|null, hasMore: boolean }>} listPage
 * @param {string} companyId
 * @param {object} [listOptions]
 * @param {{ pageSize?: number, maxRecords?: number }} [scanOptions]
 */
export async function scanTenantCollectionPages(listPage, companyId, listOptions = {}, scanOptions = {}) {
    const pageSize = Math.min(Math.max(scanOptions.pageSize ?? DEFAULT_PAGE_SIZE, 1), 200);
    const maxRecords = Math.max(scanOptions.maxRecords ?? DEFAULT_MAX_RECORDS, pageSize);
    const items = [];
    let cursor = listOptions.startAfterId ?? null;
    let hasMore = false;
    let nextCursor = null;

    while (items.length < maxRecords) {
        const page = await listPage(companyId, {
            ...listOptions,
            max: pageSize,
            startAfterId: cursor,
        });
        items.push(...(page.items || []));
        if (!page.hasMore) {
            return {
                items,
                dataCoverage: {
                    complete: true,
                    hasMore: false,
                    nextCursor: null,
                    scannedCount: items.length,
                    totalsScope: "full_tenant_scan",
                },
            };
        }
        cursor = page.nextCursor;
        if (!cursor || items.length >= maxRecords) {
            hasMore = true;
            nextCursor = cursor;
            break;
        }
    }

    return {
        items,
        dataCoverage: {
            complete: false,
            hasMore,
            nextCursor,
            scannedCount: items.length,
            totalsScope: "bounded_scan",
            scanLimit: maxRecords,
        },
    };
}
