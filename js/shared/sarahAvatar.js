/** Platform Sarah portrait — copied to admin/app assets by prepare-sites. */
export const SARAH_AVATAR_PATH = 'assets/sarah-avatar.svg';

export function resolveSarahAvatarUrl() {
  const version =
    typeof globalThis !== 'undefined' && globalThis.__ZIRICAI_CONFIG__?.assetVersion
      ? String(globalThis.__ZIRICAI_CONFIG__.assetVersion)
      : '';
  return version ? `${SARAH_AVATAR_PATH}?v=${encodeURIComponent(version)}` : SARAH_AVATAR_PATH;
}

export function sarahPageAvatarMarkup() {
  const src = resolveSarahAvatarUrl();
  return `<div class="portal-sarah-page-avatar" aria-hidden="true">
    <img src="${src}" alt="" class="portal-sarah-page-avatar-img" width="48" height="48" />
  </div>`;
}
