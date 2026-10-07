import { auth } from '../firebase.js';

/**
 * Renders user avatars in shell chrome (#userMenu .avatar, #sidebarAvatar).
 * @param {object | null | undefined} profile
 * @param {string | undefined} email
 * @param {string} [selectors]
 */
export function applyUserAvatars(profile, email, selectors = '#userMenu .avatar, #sidebarAvatar') {
  const name = profile?.fullName || profile?.name || email || 'User';
  const initial = name.charAt(0).toUpperCase();
  const photoURL = (profile?.photoURL || auth.currentUser?.photoURL || '').trim();

  document.querySelectorAll(selectors).forEach((el) => {
    if (photoURL) {
      let img = el.querySelector('img.avatar-photo');
      if (!img) {
        el.textContent = '';
        img = document.createElement('img');
        img.className = 'avatar-photo';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        el.appendChild(img);
      }
      img.src = photoURL;
      el.classList.add('has-photo');
      el.setAttribute('aria-label', name);
    } else {
      el.textContent = initial;
      el.classList.remove('has-photo');
      el.removeAttribute('aria-label');
    }
  });
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
