// ═══════════════════════════════════════════════════════════════
// BUILDTRACK FEATURE PATCH — loaded AFTER dashboard.js
// Features: 1) Offline Sync  2) AI Report Generator  3) WhatsApp
// ═══════════════════════════════════════════════════════════════
// NOTE: This file uses only window.* globals — never bare module-
// scoped variables from dashboard.js (those are ES module private).
// dashboard.js exposes: window._uid, window._projects,
//   window._buildtrackUID (getter), window.renderMaterialsGrid,
//   window.updateMaterialStats, window._getOrSetMaterials
// ═══════════════════════════════════════════════════════════════

import { initOfflineSync, isOnline, queueOfflineWrite, refreshPendingBadge } from "./offline-sync.js";
import { db } from "./firebase.js";
import { injectWeeklyReportUI, populateWeeklyReportProjects } from "./reports.js";

// ── Wait for dashboard.js auth to complete, then init ─────────
// dashboard.js sets window._uid inside requireAuth callback.
// We poll for it (max 15s) then wire everything up.

let _patchReady = false;

function waitForUID(cb, attempts = 0) {
  const uid = window._uid || window._buildtrackUID;
  if (uid) {
    cb(uid);
  } else if (attempts < 30) {
    setTimeout(() => waitForUID(cb, attempts + 1), 500);
  } else {
    console.warn("[BuildTrack Patch] Auth timed out — patch not initialised.");
  }
}

waitForUID((uid) => {
  if (_patchReady) return;
  _patchReady = true;
  console.log("[BuildTrack Patch] Auth ready, uid:", uid);

  // ── PATCH 1: Offline Sync ──────────────────────────────────
  initOfflineSync(db, uid, (online) => {
    console.log("[BuildTrack] Online:", online ? "ONLINE" : "OFFLINE");
  });

  // ── PATCH 2: Wire offline form patches ────────────────────
  // Run after DOM is fully ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireOfflinePatches);
  } else {
    wireOfflinePatches();
  }

  // ── PATCH 3: Wire Weekly Report to Reports nav ────────────
  wireWeeklyReport();
});

// ═══════════════════════════════════════════════════════
// PATCH 2: Offline form intercepts
// ═══════════════════════════════════════════════════════

function wireOfflinePatches() {
  patchDailyLogsForm();
  patchMaterialForm();
  patchAttendanceSave();
}

// ── Patch: Daily Logs ─────────────────────────────────────────
function patchDailyLogsForm() {
  const form = document.getElementById("logForm");
  if (!form || form.dataset.offlinePatched) return;
  form.dataset.offlinePatched = "1";

  form.addEventListener("submit", async function(e) {
    if (isOnline()) return; // let original handler run
    e.stopImmediatePropagation();
    e.preventDefault();

    const project = document.getElementById("logProjectSelect")?.value;
    if (!project) return showOfflineToast("Select a project first.", "error");

    const data = {
      project,
      date:             document.getElementById("logDateInput")?.value,
      labourersPresent: parseInt(document.getElementById("labourCount")?.value) || 0,
      description:      document.getElementById("logDesc")?.value,
      weather:          document.getElementById("logWeather")?.value,
      createdAt:        new Date().toISOString()
    };

    await queueOfflineWrite("daily_logs", data);
    await refreshPendingBadge();

    ["logDateInput","labourCount","logDesc"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });

    // Optimistic UI
    const feed = document.getElementById("logsFeed");
    if (feed) {
      const el = document.createElement("div");
      el.className = "timeline-item";
      el.innerHTML = `
        <div class="log-card" style="opacity:0.65;border:1px dashed rgba(245,166,35,0.3);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span class="log-date-tag">${data.date}</span>
            <span class="log-project-tag">${data.project}</span>
            <span style="font-size:0.72rem;color:#F5A623;background:rgba(245,166,35,0.1);padding:2px 8px;border-radius:100px;">⏳ Pending sync</span>
          </div>
          <div class="log-description">${data.description}</div>
          <div class="log-meta"><span>👷 ${data.labourersPresent} workers</span></div>
        </div>`;
      feed.prepend(el);
    }

    showOfflineToast("Log saved offline — will sync when online.");
  }, true);
}

// ── Patch: Materials form ────────────────────────────────────
function patchMaterialForm() {
  const form = document.getElementById("materialForm");
  if (!form || form.dataset.offlinePatched) return;
  form.dataset.offlinePatched = "1";

  form.addEventListener("submit", async function(e) {
    if (isOnline()) return;
    e.stopImmediatePropagation();
    e.preventDefault();

    const name = document.getElementById("matName")?.value.trim();
    const qty  = parseFloat(document.getElementById("matQty")?.value) || 0;
    const sel  = document.getElementById("matProject");
    const projName = sel?.options[sel.selectedIndex]?.text || "";

    const data = {
      name,
      category:    document.getElementById("matCategory")?.value,
      quantity:    qty,
      unit:        document.getElementById("matUnit")?.value,
      location:    document.getElementById("matLocation")?.value,
      minStock:    parseFloat(document.getElementById("matMinStock")?.value) || 0,
      projectId:   sel?.value || "",
      projectName: projName === "Select project..." ? "" : projName,
      costPerUnit: parseFloat(document.getElementById("matCostPerUnit")?.value) || 0,
      supplier:    document.getElementById("matNotes")?.value.trim(),
      createdAt:   new Date().toISOString()
    };

    await queueOfflineWrite("materials", data);
    await queueOfflineWrite("materialTxns", {
      materialName: name, type: "in", quantity: qty,
      unit: data.unit, notes: data.supplier,
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString()
    });

    await refreshPendingBadge();
    if (window.closeModal) window.closeModal("materialModal");
    form.reset();
    showOfflineToast("Material saved offline — will sync when online.");

    // Optimistic UI — use window accessor so we don't touch private _materials
    if (window._getOrSetMaterials) {
      const mats = window._getOrSetMaterials();
      mats.push({ id: `offline_${Date.now()}`, ...data, _offlinePending: true });
      window._getOrSetMaterials(mats);
    }
    if (window.renderMaterialsGrid) window.renderMaterialsGrid();
    if (window.updateMaterialStats) window.updateMaterialStats();
  }, true);
}

// ── Patch: Attendance batch save ─────────────────────────────
function patchAttendanceSave() {
  const btn = document.getElementById("saveAttendanceBtn");
  if (!btn || btn.dataset.offlinePatched) return;
  btn.dataset.offlinePatched = "1";

  btn.addEventListener("click", async function(e) {
    if (isOnline()) return;
    e.stopImmediatePropagation();

    const date = document.getElementById("attendanceDate")?.value;
    if (!date) return showOfflineToast("Select a date first.", "error");

    const tiles = document.querySelectorAll(".att-tile");
    if (!tiles.length) return;

    for (const tile of tiles) {
      await queueOfflineWrite("attendance", {
        labourerId: tile.dataset.id,
        date,
        status:    tile.dataset.status,
        timestamp: new Date().toISOString()
      }, `${tile.dataset.id}_${date}`);
    }

    await refreshPendingBadge();
    showOfflineToast(`Attendance saved offline for ${date} — will sync when online.`);
  }, true);
}

// ═══════════════════════════════════════════════════════
// PATCH 3: Weekly Report — inject UI when Reports tab opens
// ═══════════════════════════════════════════════════════

function wireWeeklyReport() {
  // Use event delegation so both sidebar and bottom nav are covered
  document.addEventListener("click", (e) => {
    const item = e.target.closest("[data-section='reports'], .nav-item[onclick*='reports'], .bottom-nav-item[data-section='reports']");
    if (!item) return;

    setTimeout(() => {
      injectWeeklyReportUI();
      loadWeeklyReportProjects();
    }, 120);
  });

  // Also fire if Reports is the default active section on load
  setTimeout(() => {
    const reportsSection = document.getElementById("reports");
    if (reportsSection && !reportsSection.classList.contains("hidden") &&
        reportsSection.style.display !== "none") {
      injectWeeklyReportUI();
      loadWeeklyReportProjects();
    }
  }, 800);
}

function loadWeeklyReportProjects() {
  const projects = window._projects;
  if (projects?.length) {
    populateWeeklyReportProjects(projects);
  } else {
    let attempts = 0;
    const poll = setInterval(() => {
      const p = window._projects;
      if (p?.length) {
        clearInterval(poll);
        populateWeeklyReportProjects(p);
      } else if (++attempts > 20) {
        clearInterval(poll);
      }
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════
// Offline toast
// ═══════════════════════════════════════════════════════

function showOfflineToast(msg, type = "success") {
  const colors = {
    success: { bg: "#0D1A0D", border: "rgba(0,196,140,0.3)", text: "#00C48C" },
    error:   { bg: "#1A0D0D", border: "rgba(255,82,82,0.3)",  text: "#FF5252" }
  };
  const c = colors[type] || colors.success;

  let t = document.getElementById("offlineActionToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "offlineActionToast";
    t.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(10px);
      padding:11px 22px; border-radius:100px;
      font-family:'DM Sans',sans-serif; font-size:0.84rem; font-weight:600;
      z-index:99998; opacity:0; transition:all 0.28s ease;
      white-space:nowrap; pointer-events:none;
    `;
    document.body.appendChild(t);
  }

  t.textContent        = msg;
  t.style.background   = c.bg;
  t.style.border       = `1px solid ${c.border}`;
  t.style.color        = c.text;
  t.style.opacity      = "1";
  t.style.transform    = "translateX(-50%) translateY(0)";

  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.opacity   = "0";
    t.style.transform = "translateX(-50%) translateY(10px)";
  }, 3500);
}
