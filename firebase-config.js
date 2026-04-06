import { initializeApp } from './node_modules/firebase/firebase-app.js';
import { deleteUser, getAuth, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from './node_modules/firebase/firebase-auth.js';
import { getFirestore } from './node_modules/firebase/firestore/dist/index.esm.js';

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

export { auth, db, deleteUser, getFirestore, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut };
