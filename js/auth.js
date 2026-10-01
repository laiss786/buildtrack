// js/auth.js
// ─────────────────────────────────────────────────────────────
// Handles Login, Registration and Password Reset.
// Called from login.html and register.html via auth-ui.js
// (window.login / window.register / window.resetPassword).
// Each returns true when the page is navigating away.
// ─────────────────────────────────────────────────────────────
import { auth, REMEMBER_KEY } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── Helpers ──────────────────────────────────────────────────
function showError(msg, id = "errorMsg") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = "alert alert-error";
  el.textContent = msg;
}

function showSuccess(msg, id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = "alert alert-ok";
  el.textContent = msg;
}

// ── LOGIN ─────────────────────────────────────────────────────
window.login = async function () {
  const email    = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  const remember = document.getElementById("remember")?.checked === true;

  showError("");
  const notice = document.getElementById("noticeMsg");
  if (notice) notice.textContent = "";

  if (!email || !password) {
    showError("Please fill in all fields.");
    return false;
  }

  try {
    // "Remember me" keeps the session after the browser closes;
    // otherwise the login is tied to this tab only (see firebase.js).
    try { localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"); } catch {}
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

    // Sign out any existing session first — prevents old user data leaking
    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
    return true;
  } catch (err) {
    console.error("Login error:", err);
    showError(friendlyError(err.code));
    return false;
  }
};

// ── REGISTER ──────────────────────────────────────────────────
window.register = async function () {
  const name     = document.getElementById("name")?.value.trim();
  const email    = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  showError("");

  if (!name || !email || !password) {
    showError("Please fill in all fields.");
    return false;
  }
  if (password.length < 6) {
    showError("Password must be at least 6 characters.");
    return false;
  }

  try {
    // Sign out any existing session first
    await signOut(auth);
    await createUserWithEmailAndPassword(auth, email, password);
    window.location.href = "login.html?registered=1";
    return true;
  } catch (err) {
    console.error("Register error:", err);
    showError(friendlyError(err.code));
    return false;
  }
};

// ── PASSWORD RESET ────────────────────────────────────────────
window.resetPassword = async function () {
  const email = document.getElementById("resetEmail")?.value.trim();
  // Same message whether or not the account exists, so the form
  // can't be used to find out which emails are registered.
  const sent = `If an account exists for ${email}, we've sent a link to reset your password. Check your inbox and spam folder.`;

  showError("", "resetMsg");

  try {
    await sendPasswordResetEmail(auth, email);
    showSuccess(sent, "resetMsg");
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      showSuccess(sent, "resetMsg");
    } else {
      console.error("Reset error:", err);
      showError(friendlyError(err.code), "resetMsg");
    }
  }
  return false;
};

// ── Error Code → Human Readable ───────────────────────────────
function friendlyError(code) {
  const map = {
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password. Please try again.",
    "auth/email-already-in-use":   "This email is already registered.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/too-many-requests":      "Too many attempts. Please try again later.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/invalid-credential":     "Incorrect email or password.",
    "auth/network-request-failed": "Can't reach the server. Check your connection and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
