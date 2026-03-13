// js/firebase.js — Single source of truth for all Firebase services
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBz_2ZJeFisSUTFNbwrtI6CuD7hw53f8Po",
  authDomain:        "buildtrack001.firebaseapp.com",
  projectId:         "buildtrack001",
  storageBucket:     "buildtrack001.firebasestorage.app",
  messagingSenderId: "789303765991",
  appId:             "1:789303765991:web:24117d01611b98bb662b42",
  measurementId:     "G-F6X4VXMV65"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// SESSION persistence = login is tied to this browser tab only.
// When the tab closes or user logs out, the session is fully cleared.
// This prevents one user's session from bleeding into another account.
setPersistence(auth, browserSessionPersistence).catch(console.error);

export { app, auth, db, storage };
