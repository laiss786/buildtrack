// js/auth-guard.js
// ─────────────────────────────────────────────────────────────
// Import this on any PROTECTED page (dashboard.html, etc.)
// It immediately redirects unauthenticated visitors to login.html
// ─────────────────────────────────────────────────────────────
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function requireAuth(callback) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Not logged in → kick to login page
      window.location.replace("login.html");
    } else {
      // Logged in → pass user object to caller
      if (typeof callback === "function") callback(user);
    }
  });
}
