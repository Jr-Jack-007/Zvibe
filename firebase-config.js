import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { deleteUser, getAuth, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail, updatePassword } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD6qaK7fAkC644P_fHsYQ3bywWOdgeDODs',
  authDomain: 'zvibe-5371c.firebaseapp.com',
  projectId: 'zvibe-5371c',
  storageBucket: 'zvibe-5371c.firebasestorage.app',
  messagingSenderId: '532932953083',
  appId: '1:532932953083:web:9fdecce80dede5ae7b015e'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage, deleteUser, getFirestore, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail, updatePassword };