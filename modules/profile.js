import { auth, db, storage } from '../firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

let profileCache = null;

export function getProfileCache() {
  return profileCache;
}

export function setProfileCache(value) {
  profileCache = value;
}

export async function loadCurrentUserProfile() {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const snapshot = await getDoc(doc(db, 'users', currentUser.uid));
  if (!snapshot.exists()) return null;

  profileCache = snapshot.data();
  return profileCache;
}

export async function saveCurrentUserProfile({ profile, photoFile }) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('not signed in');

  let photoURL = profile?.photoURL || '';
  if (photoFile) {
    const avatarRef = ref(storage, `avatars/${currentUser.uid}.jpg`);
    await uploadBytes(avatarRef, photoFile, {
      contentType: photoFile.type || 'image/jpeg'
    });
    photoURL = await getDownloadURL(avatarRef);
  }

  const payload = {
    ...profile,
    photoURL,
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, 'users', currentUser.uid), payload, { merge: true });
  profileCache = payload;
  return payload;
}

export async function saveEditedProfile(profilePatch) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('not signed in');

  await setDoc(doc(db, 'users', currentUser.uid), {
    ...profilePatch,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function renderMyProfile(profileData) {
  const nameEl = document.getElementById('profile-big-name');
  const locationEl = document.getElementById('profile-location');
  const bioEl = document.getElementById('profile-bio-text');

  if (nameEl) nameEl.textContent = profileData?.name || 'Your profile';
  if (locationEl) locationEl.textContent = `📍 ${profileData?.city || 'add your city'}`;
  if (bioEl) bioEl.textContent = profileData?.bio || 'add a bio to tell people what you are about.';
}
