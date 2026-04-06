import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { deleteUser, getAuth, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail, updatePassword } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_FIREBASE_CONSOLE_VALUE',
  authDomain: 'REPLACE_WITH_FIREBASE_CONSOLE_VALUE',
  projectId: 'REPLACE_WITH_FIREBASE_CONSOLE_VALUE',
  storageBucket: 'REPLACE_WITH_FIREBASE_CONSOLE_VALUE',
  messagingSenderId: 'REPLACE_WITH_FIREBASE_CONSOLE_VALUE',
  appId: 'REPLACE_WITH_FIREBASE_CONSOLE_VALUE'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage, deleteUser, getFirestore, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail, updatePassword };
