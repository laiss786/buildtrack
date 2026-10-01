// js/auth-ui.js
// ─────────────────────────────────────────────────────────────
// Form behaviour for login.html and register.html:
// inline validation, show/hide password, Caps Lock hint,
// loading state, and the forgot-password view.
// The Firebase calls themselves live in auth.js (window.login etc.)
// ─────────────────────────────────────────────────────────────
(function () {
  // ── Validation ──────────────────────────────────────────────
  function messageFor(input) {
    const v = input.type === "password" ? input.value : input.value.trim();
    if (!v) return input.dataset.requiredMsg || "This field is required.";
    if (input.type === "email" && input.validity.typeMismatch) {
      return "Enter a valid email address, like name@company.com.";
    }
    if (input.minLength > 0 && v.length < input.minLength) {
      return `Use at least ${input.minLength} characters.`;
    }
    return "";
  }

  function showFieldError(input, msg) {
    const el = document.getElementById(input.id + "Error");
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (el) el.textContent = msg;
  }

  function validate(input) {
    const msg = messageFor(input);
    showFieldError(input, msg);
    return !msg;
  }

  function fieldsOf(form) {
    return Array.from(form.querySelectorAll(".input[required]"));
  }

  document.querySelectorAll("form[data-action]").forEach((form) => {
    fieldsOf(form).forEach((input) => {
      input.addEventListener("blur", () => {
        if (input.value || input.dataset.touched) {
          input.dataset.touched = "1";
          validate(input);
        }
      });
      input.addEventListener("input", () => {
        if (input.getAttribute("aria-invalid") === "true") validate(input);
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fields = fieldsOf(form);
      fields.forEach((f) => (f.dataset.touched = "1"));
      const results  = fields.map(validate);
      const firstBad = fields[results.indexOf(false)];
      if (firstBad) { firstBad.focus(); return; }

      const action = window[form.dataset.action];
      if (typeof action !== "function") return;

      const btn   = form.querySelector('button[type="submit"]');
      const label = btn.querySelector(".btn-label");
      const idle  = label.textContent;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      label.textContent = btn.dataset.busyLabel || "Please wait…";

      let leaving = false;
      try {
        leaving = await action(form);
      } finally {
        // keep the loading state while the browser navigates away
        if (!leaving) {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
          label.textContent = idle;
        }
      }
    });
  });

  // ── Show / hide password ───────────────────────────────────
  document.querySelectorAll("[data-toggle-for]").forEach((btn) => {
    const input = document.getElementById(btn.dataset.toggleFor);
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  // ── Caps Lock hint ─────────────────────────────────────────
  document.querySelectorAll("[data-caps]").forEach((input) => {
    const hint = document.getElementById(input.dataset.caps);
    const update = (e) => {
      if (e.getModifierState) hint.hidden = !e.getModifierState("CapsLock");
    };
    input.addEventListener("keydown", update);
    input.addEventListener("keyup", update);
    input.addEventListener("blur", () => (hint.hidden = true));
  });

  // ── Forgot password view (login page only) ────────────────
  const loginForm = document.getElementById("loginForm");
  const resetForm = document.getElementById("resetForm");

  function swap(from, to, copyEmail) {
    const src = from.querySelector('input[type="email"]');
    const dst = to.querySelector('input[type="email"]');
    if (copyEmail && src && dst && !dst.value) dst.value = src.value;
    from.hidden = true;
    to.hidden = false;
    to.querySelector(".card-title").focus();
  }

  document.getElementById("forgotBtn")?.addEventListener("click", () => {
    document.getElementById("resetMsg").textContent = "";
    swap(loginForm, resetForm, true);
  });
  document.getElementById("backToLogin")?.addEventListener("click", () => {
    swap(resetForm, loginForm, false);
  });

  // ── "Account created" notice after registering ───────────
  const notice = document.getElementById("noticeMsg");
  if (notice && new URLSearchParams(location.search).has("registered")) {
    notice.textContent = "Account created. Sign in to continue.";
    history.replaceState(null, "", location.pathname);
  }
})();
