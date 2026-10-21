import { listFinanceGlAccountsForAccess } from "../../finance/financeGlAccountService.js";
import { listFinanceCategoriesForAccess } from "../../finance/financeCategoryService.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

export default {
    name: "viewFinanceChartOfAccounts",
    description:
        "Read-only chart of accounts template for this workspace (default platform COA v1 plus tenant category labels). Does not prove full general ledger implementation.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiredPermissions: ["canViewFinance"],
    async execute(ctx) {
        financeReadAccessFromCtx(ctx);
        const access = { uid: ctx.uid, role: ctx.role };
        const categoriesRaw = await listFinanceCategoriesForAccess(ctx.companyId, access).catch(() => []);
        const categoryList = Array.isArray(categoriesRaw)
            ? categoriesRaw
            : categoriesRaw?.items || [];
        const accountsRaw = await listFinanceGlAccountsForAccess(ctx.companyId, access);
        const accounts = (Array.isArray(accountsRaw) ? accountsRaw : accountsRaw?.items || []).map((a) => ({
            code: a.code,
            name: a.name,
            type: a.type,
            active: a.active !== false,
            systemDefault: Boolean(a.systemDefault),
        }));
        return {
            message: `${accounts.length} GL account(s) for this tenant. ${categoryList.length} finance categories for ledger mapping.`,
            data: {
                accounts,
                tenantCategories: categoryList.slice(0, 100).map((c) => ({
                    id: c.id,
                    name: c.name,
                    kind: c.kind,
                })),
            },
            completionType: "read_only",
            limitations: [
                "Tenant COA is seeded from platform defaults; custom accounts may be added via Finance API.",
                "Categories are mapped heuristically for transaction-derived lines only.",
            ],
        };
    },
};
