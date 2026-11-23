/**
 * Sach Accounting — tenant knowledge + company profile (sachaccounting.co.za).
 */
import { updateCompany } from "../tenants/companyService.js";
import { saveKnowledgeDocument } from "../tenants/knowledgeService.js";

export const SACH_CONSULT_COMPANY_ID = "sach-consult";

/** Portal, Discover, and Sarah display title (companyId remains `sach-consult`). */
export const SACH_DISPLAY_NAME = "Sach Accounting";

const KB = [
    {
        id: "sach-about",
        title: "About Sach Accounting",
        type: "manual",
        content: `Sach Accounting (Sach Accounting Solutions on the web) is a professional accounting and business consulting firm in Rustenburg, North West, South Africa.

Managing Director: Saul Chitate.

We help SMEs stay compliant, profitable, and financially strong through accounting, taxation, payroll, company secretarial work, and advisory services.

Address: 169 Joubert Street, Rustenburg, 0300.
Phone: +27 14 592 1351. Email: hello@sachaccounting.co.za. Website: https://sachaccounting.co.za

Business hours: Monday–Friday 08:00–17:00 unless otherwise agreed.`,
    },
    {
        id: "sach-services",
        title: "Services",
        type: "faq",
        content: `Services include:
• Accounting & financial management
• Taxation & SARS compliance
• Payroll & HR solutions (from about R100 per employee where applicable — confirm current pricing with staff)
• Company secretarial services
• Compliance audits
• Company registration and CIPC-related support

Sarah should capture the client's name, business name, and what they need, then offer to connect them with the team for quotes and appointments. Do not invent fee amounts beyond what is listed here.`,
    },
    {
        id: "sach-sarah-tone",
        title: "Company Sarah — reception guidelines",
        type: "policy",
        content: `You are Company Sarah for Sach Accounting — professional, warm, and concise.

Help with: service questions, booking a consultation, documents needed for tax or payroll, and general enquiries.

Never provide binding tax or legal advice; offer to schedule a consultation with a qualified practitioner.

For new clients: ask full name, business name (if any), contact number, and a short description of their need.`,
    },
];

export async function bootstrapSachConsultProfile(companyId = SACH_CONSULT_COMPANY_ID) {
    await updateCompany(companyId, {
        name: SACH_DISPLAY_NAME,
        industry: "Professional Services",
        phone: "+27 14 592 1351",
        email: "hello@sachaccounting.co.za",
        website: "https://sachaccounting.co.za",
        address: "169 Joubert Street, Rustenburg, 0300, North West, South Africa",
    });

    const results = [];
    for (const doc of KB) {
        const saved = await saveKnowledgeDocument({
            companyId,
            id: doc.id,
            title: doc.title,
            type: doc.type,
            content: doc.content,
            status: "active",
        });
        results.push(saved.id || doc.id);
    }
    return { companyId, knowledgeSeeded: results };
}