import { generateReport } from "../../reporting/reportService.js";

export default {
    name: "generateReport",
    description: "Generate a tenant report (weekly summary, CRM pipeline, conversations).",
    parameters: {
        type: "object",
        properties: {
            reportType: {
                type: "string",
                enum: ["weekly", "monthly", "conversations", "crm", "usage"],
            },
            format: { type: "string", enum: ["json", "html", "csv"] },
        },
    },
    requiredPermissions: ["canExportData"],
    platformOnly: false,
    async execute(ctx, args) {
        const reportType = args.reportType || "weekly";
        const format = args.format || "json";
        const report = await generateReport(ctx.companyId, reportType, format);

        const downloadPath =
            format === "html"
                ? `/api/companies/${ctx.companyId}/reports/${reportType}?format=html`
                : format === "csv"
                  ? `/api/companies/${ctx.companyId}/reports/${reportType}?format=csv`
                  : `/api/companies/${ctx.companyId}/reports/weekly`;

        return {
            message: `Generated ${reportType} report for your workspace. ${report.highlights?.join(". ") || ""}`,
            data: { report, downloadPath },
            uiHints: [{ navigate: "analytics" }, { action: "download", path: downloadPath }],
        };
    },
};
