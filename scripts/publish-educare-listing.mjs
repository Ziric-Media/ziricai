#!/usr/bin/env node
/**
 * Publish Educare to Sarah Discover (post EDU-01).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { EDUCARE_COMPANY_ID } from "../services/education/educareDefaults.js";
import { getCompany } from "../services/tenants/companyService.js";
import { saveListingDraft, publishListing } from "../services/network/networkProfileService.js";
import { getOrgEntityByCompanyId } from "../services/network/networkIdentityService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const PROFILE = {
    displayName: "Educare Christian Combined School",
    industry: "Education",
    shortDescription:
        "Christian-based education in Rustenburg — primary and secondary campuses, preschool through Grade 12.",
    location: "Rustenburg, South Africa",
    tags: ["education", "school", "christian"],
    contact: {
        phone: "+27 14 592 2854",
        email: "info@educarechristianschool.co.za",
        website: "https://educarechristianschool.co.za",
    },
    hours: [{ day: "Mon–Fri", time: "07:00–16:00" }],
    address: "25 Von Wielligh Street, Rustenburg (Primary); 155 Leyds Street (Secondary)",
};

async function main() {
    const companyId = process.env.EDUCARE_COMPANY_ID || EDUCARE_COMPANY_ID;
    const company = await getCompany(companyId);
    if (!company) {
        console.error(`Company missing: ${companyId}`);
        process.exit(1);
    }
    const ownerUid = company.ownerUid || company.ownerId || "educare-owner";
    const deps = { getCompany: async (id) => (id === companyId ? company : getCompany(id)) };

    await saveListingDraft(companyId, PROFILE, ownerUid, deps);
    const listing = await publishListing(companyId, ownerUid, deps);
    const entity = await getOrgEntityByCompanyId(companyId);
    console.log(
        JSON.stringify(
            {
                gate: "EDU-02-publish",
                companyId,
                published: listing.published,
                snId: entity?.snId || listing.snId,
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
