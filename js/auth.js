// js/auth.js
// ─────────────────────────────────────────────────────────────
// Handles Login and Registration.
// Called from login.html and register.html via window.login / window.register
// ─────────────────────────────────────────────────────────────
import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── Helpers ──────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById("errorMsg");
  if (el) el.innerText = msg;
}

function setLoading(btn, isLoading, label) {
  if (!btn) return;
  btn.disabled  = isLoading;
  btn.innerText = isLoading ? "Please wait..." : label;
}

// ── LOGIN ─────────────────────────────────────────────────────
window.login = async function () {
  const email    = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  const btn      = document.querySelector(".build-btn");

  showError("");

  if (!email || !password) {
    return showError("Please fill in all fields.");
  }

  setLoading(btn, true, "Access Dashboard");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Login error:", err);
    showError(friendlyError(err.code));
  } finally {
    setLoading(btn, false, "Access Dashboard");
  }
};

// ── REGISTER ──────────────────────────────────────────────────
window.register = async function () {
  const name     = document.getElementById("name")?.value.trim();
  const email    = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  const btn      = document.querySelector(".build-btn");

  showError("");

  if (!name || !email || !password) {
    return showError("Please fill in all fields.");
  }
  if (password.length < 6) {
    return showError("Password must be at least 6 characters.");
  }

  setLoading(btn, true, "Register Account");

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Account created! Please log in.");
    window.location.href = "login.html";
  } catch (err) {
    console.error("Register error:", err);
    showError(friendlyError(err.code));
  } finally {
    setLoading(btn, false, "Register Account");
  }
};

// ── Error Code → Human Readable ───────────────────────────────
function friendlyError(code) {
  const map = {
    "auth/user-not-found":        "No account found with this email.",
    "auth/wrong-password":        "Incorrect password. Please try again.",
    "auth/email-already-in-use":  "This email is already registered.",
    "auth/invalid-email":         "Please enter a valid email address.",
    "auth/too-many-requests":     "Too many attempts. Please try again later.",
    "auth/weak-password":         "Password must be at least 6 characters.",
    "auth/invalid-credential":    "Invalid email or password.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
