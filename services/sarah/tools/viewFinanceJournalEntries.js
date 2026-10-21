import { listFinanceJournalEntriesPageForAccess } from "../../finance/financeJournalService.js";
import { scanTenantCollectionPages } from "../../finance/financeTenantScan.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

export default {
    name: "viewFinanceJournalEntries",
    description:
        "Read posted manual journal entries for this tenant (newest first). Check dataCoverage before claiming all entries were scanned.",
    parameters: {
        type: "object",
        properties: {
            maxEntries: { type: "number", description: "Optional cap for scan (default full scan up to platform limit)." },
        },
        additionalProperties: false,
    },
    requiredPermissions: ["canViewFinance"],
    async execute(ctx, args = {}) {
        const access = financeReadAccessFromCtx(ctx);
        const maxRecords = Math.min(Math.max(Number(args.maxEntries) || 2000, 50), 2000);
        const scan = await scanTenantCollectionPages(
            (id, opts) => listFinanceJournalEntriesPageForAccess(id, access, opts),
            ctx.companyId,
            {},
            { maxRecords }
        );
        const entries = (scan.items || []).map((e) => ({
            id: e.id,
            entryDate: e.entryDate,
            memo: e.memo,
            status: e.status,
            lineCount: e.lineCount,
            currencies: e.currencies,
            lines: (e.lines || []).slice(0, 20),
        }));
        return {
            message: `${entries.length} journal entr(ies) in scan scope.`,
            data: { entries, dataCoverage: scan.dataCoverage },
            completionType: "read_only",
            limitations: ["Manual journals only; invoice and payment automation may also affect the trial balance projection."],
        };
    },
};
