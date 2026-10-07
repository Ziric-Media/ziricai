/**
 * Where to send a user after unified sign-in (Mission Control vs Company Portal).
 */
import { isSuperAdminRole, isActiveStatus } from '../auth.js';
import { adminUrl, portalUrl } from './siteUrls.js';

/**
 * @param {object | null | undefined} profile
 * @returns {{ url: string, kind: 'admin' | 'portal' } | { error: string }}
 */
export function resolvePostLoginDestination(profile) {
  if (!profile) {
    return { error: 'No profile found for this account. Complete onboarding or contact your administrator.' };
  }

  if (isSuperAdminRole(profile.role)) {
    if (profile.status && !isActiveStatus(profile.status)) {
      return { error: 'This account is not active. Contact platform support.' };
    }
    return { url: adminUrl(), kind: 'admin' };
  }

  const companyId = profile.companyId || profile.company || null;
  if (!companyId) {
    return { error: 'No company assigned to this account. Contact your administrator.' };
  }

  if (profile.status && !isActiveStatus(profile.status)) {
    return { error: 'This account is not active. Contact your administrator.' };
  }

  return { url: portalUrl(companyId), kind: 'portal' };
}
