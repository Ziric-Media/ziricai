/** Dental clinic industry preset — portal feature gate (UI only; API enforces separately). */
export const DENTAL_CLINIC_PRESET_ID = 'dental-clinic';

export function isDentalClinicPresetActive(company) {
  if (!company?.industryPresetActivatedAt) return false;
  return String(company.industryPresetId || '').trim() === DENTAL_CLINIC_PRESET_ID;
}

/**
 * @param {string} companyId
 * @param {object|null|undefined} company — pass state.company when available
 */
export function isDentalPracticePortalTenant(companyId, company = null) {
  const id = String(companyId || '').trim().toLowerCase();
  if (!id) return false;
  if (company) {
    if (isDentalClinicPresetActive(company)) return true;
    if (company.settings?.dentalPractice?.enabled === true) return true;
  }
  return id === 'smilemore-demo';
}
