/** Client-side Automotive preset visibility (matches server preset id). */
export const AUTOMOTIVE_PRESET_ID = 'automotive-dealership';

export function isAutomotivePresetActive(company) {
  if (!company?.industryPresetActivatedAt) return false;
  return String(company.industryPresetId || '').trim() === AUTOMOTIVE_PRESET_ID;
}
