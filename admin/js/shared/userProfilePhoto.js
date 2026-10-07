import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../firebase.js';
import { updateUserProfile } from '../users.js';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function extForType(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'jpg';
}

/**
 * @param {File | null | undefined} file
 * @param {{ photoUrlOverride?: string }} [options]
 */
export async function saveUserProfilePhoto(file, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  let photoURL = (options.photoUrlOverride || '').trim();

  if (file) {
    if (!ALLOWED.has(file.type)) {
      throw new Error('Use a JPEG, PNG, WebP, or GIF image.');
    }
    if (file.size > MAX_BYTES) {
      throw new Error('Image must be under 2 MB.');
    }
    const ext = extForType(file.type);
    const objectRef = ref(storage, `user-profiles/${user.uid}/avatar.${ext}`);
    await uploadBytes(objectRef, file, { contentType: file.type });
    photoURL = await getDownloadURL(objectRef);
  }

  if (!photoURL) {
    throw new Error('Choose an image file or enter a photo URL.');
  }

  const result = await updateUserProfile(user.uid, { photoURL });
  if (result.error) throw new Error(result.error);

  try {
    await updateProfile(user, { photoURL });
  } catch (_) {
    /* Auth photo is optional; Firestore profile is source of truth for shells */
  }

  return result.profile;
}

export async function clearUserProfilePhoto() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const result = await updateUserProfile(user.uid, { photoURL: '' });
  if (result.error) throw new Error(result.error);

  try {
    await updateProfile(user, { photoURL: null });
  } catch (_) {}

  return result.profile;
}
