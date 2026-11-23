/**
 * MC-PO-09 — organisation / Company Portal oversight (read-only metadata).
 */
import { listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { classifyTenant, summarizeByClassification } from "../../js/shared/tenantClassification.js";
import { getNetworkStats } from "../network/networkPlatformService.js";

export async function getOrganisationOversightOverview() {
    const companies = await listAllCompaniesFromStorage();
    const census = summarizeByClassification(companies);
    const byStatus = {};
    for (const c of companies) {
        const st = String(c.status || "active").toLowerCase();
        byStatus[st] = (byStatus[st] || 0) + 1;
    }
    let network = null;
    try {
        network = await getNetworkStats();
    } catch {
        network = null;
    }
    const sample = companies.slice(0, 25).map((c) => {
        const meta = classifyTenant(c);
        return {
            companyId: c.id,
            name: c.name || c.id,
            status: c.status || "unknown",
            classification: meta.classification,
            industry: c.industry || null,
        };
    });
    return {
        generatedAt: new Date().toISOString(),
        totals: {
            registered: companies.length,
            byStatus,
            census,
        },
        network: network
            ? {
                  entitiesListed: network.entities?.listed,
                  openVerificationCases: network.verification?.openCases,
                  agentsActive: network.agents?.active,
              }
            : null,
        sample,
        privacy: { note: "Mission Control does not expose tenant private business records in this overview." },
    };
}
