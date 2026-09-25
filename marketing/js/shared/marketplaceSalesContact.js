/**
 * Canonical Marketplace sales contact (Industry Pack access requests).
 * Aligns with platform KB / billing Enterprise CTAs (sales@ziricai.com).
 */
export const ZIRIC_SALES_EMAIL = 'sales@ziricai.com';

/**
 * @param {{ packId: string, packName?: string, companyId?: string }} params
 * @returns {string} mailto URL
 */
export function buildIndustryPackAccessMailto({ packId, packName, companyId } = {}) {
    const id = packId || 'unknown-pack';
    const label = packName || id;
    const subject = encodeURIComponent(`Industry Pack access request: ${label}`);
    const lines = [
        'Hello ZiricAI Sales,',
        '',
        'We would like to request access to install the following Industry Pack:',
        '',
        `Pack: ${label}`,
        `Pack ID: ${id}`,
    ];
    if (companyId) lines.push(`Company ID: ${companyId}`);
    lines.push('', 'Thank you.');
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:${ZIRIC_SALES_EMAIL}?subject=${subject}&body=${body}`;
}
