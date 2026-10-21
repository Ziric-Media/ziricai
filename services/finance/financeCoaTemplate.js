/**
 * SF-02 v1 — default chart of accounts template (read projection; not full GL posting).
 */

/** @typedef {{ code: string, name: string, type: "asset"|"liability"|"equity"|"income"|"expense" }} CoaAccount */

/** @type {CoaAccount[]} */
export const DEFAULT_FINANCE_COA = [
    { code: "1100", name: "Cash and bank (clearing)", type: "asset" },
    { code: "1200", name: "Accounts receivable", type: "asset" },
    { code: "2100", name: "Accounts payable", type: "liability" },
    { code: "3000", name: "Retained earnings (summary)", type: "equity" },
    { code: "4100", name: "Operating revenue", type: "income" },
    { code: "5100", name: "Operating expenses", type: "expense" },
    { code: "5200", name: "Cost of sales", type: "expense" },
];

export function accountByCode(code) {
    return DEFAULT_FINANCE_COA.find((a) => a.code === code) || null;
}

/**
 * Map workspace category label to a COA code (deterministic defaults).
 * @param {string} category
 * @param {"income"|"expense"|"transfer"} recordType
 */
export function categoryToAccountCode(category, recordType) {
    const cat = String(category || "").trim().toLowerCase();
    if (recordType === "income") {
        if (cat.includes("sales") || cat.includes("service")) return "4100";
        return "4100";
    }
    if (recordType === "expense") {
        if (cat.includes("cost") || cat.includes("cogs")) return "5200";
        return "5100";
    }
    return "5100";
}
