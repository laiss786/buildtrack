// js/auth-guard.js
// ─────────────────────────────────────────────────────────────
// Import this on any PROTECTED page (dashboard.html, etc.)
// It immediately redirects unauthenticated visitors to login.html
// ─────────────────────────────────────────────────────────────
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function requireAuth(callback) {
  // unsubscribe after first call so the callback never fires twice
  // (e.g. if Firebase re-evaluates auth state mid-session)
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe(); // stop listening after first confirmed state
    if (!user) {
      window.location.replace("login.html");
    } else {
      if (typeof callback === "function") callback(user);
    }
  });
}
