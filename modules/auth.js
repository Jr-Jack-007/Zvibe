import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword,
  sendEmailVerification,
  onAuthStateChanged
} from '../firebase-config.js';

// Auth module: account creation/sign-in/out and credential changes.

export async function signupWithEmail({ email, password }) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginWithEmail({ email, password }) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutCurrentUser() {
  return signOut(auth);
}

export async function sendReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function changeEmail(newEmail) {
  if (!auth.currentUser) throw new Error('not signed in');
  return updateEmail(auth.currentUser, newEmail);
}

export async function changePassword(newPassword) {
  if (!auth.currentUser) throw new Error('not signed in');
  return updatePassword(auth.currentUser, newPassword);
}

export async function resendVerification() {
  if (!auth.currentUser) throw new Error('not signed in');
  return sendEmailVerification(auth.currentUser);
}

export async function checkVerificationStatus() {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  return Boolean(auth.currentUser.emailVerified);
}

export function startAuthObserver({ onVerifiedUser, onUnverifiedUser, onSignedOut }) {
  return onAuthStateChanged(auth, user => {
    if (!user) {
      if (typeof onSignedOut === 'function') onSignedOut();
      return;
    }

    if (!user.emailVerified) {
      if (typeof onUnverifiedUser === 'function') onUnverifiedUser(user);
      return;
    }

    if (typeof onVerifiedUser === 'function') onVerifiedUser(user);
  });
}
