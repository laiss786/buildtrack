// js/ai-report.js — BuildTrack AI Site Report Generator
// ─────────────────────────────────────────────────────────────
// Uses Claude (via Anthropic API) to generate a structured
// weekly site report from Firestore data.
// Includes: weekly progress, labourer attendance & costs, material usage.
// ─────────────────────────────────────────────────────────────

import { db } from "./firebase.js";
import {
  collection, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Inject AI Report UI into the Reports section ──────────────
export function injectAIReportUI() {
  const reportsSection = document.getElementById("reports");
  if (!reportsSection || document.getElementById("aiReportPanel")) return;

  const panel = document.createElement("div");
  panel.id = "aiReportPanel";
  panel.innerHTML = `
    <div class="ai-report-card">
      <div class="ai-report-header">
        <div class="ai-report-title-row">
          <div class="ai-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            AI Powered
          </div>
          <h2 class="ai-report-title">Weekly Site Report Generator</h2>
          <p class="ai-report-sub">AI analyses your last 7 days of data and writes a full contractor report.</p>
        </div>

        <div class="ai-report-controls">
          <div class="ai-control-row">
            <div class="field-group" style="flex:1;">
              <label class="field-label">Project</label>
              <select id="aiReportProject" class="field-input">
                <option value="">All Projects</option>
              </select>
            </div>
            <div class="field-group" style="flex:1;">
              <label class="field-label">Report for week ending</label>
              <input type="date" id="aiReportDate" class="field-input">
            </div>
          </div>
          <button class="ai-generate-btn" id="aiGenerateBtn" onclick="window.generateAIReport()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            Generate AI Report
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div id="aiReportLoading" style="display:none;" class="ai-loading-box">
        <div class="ai-spinner"></div>
        <div class="ai-loading-text">Analysing site data...</div>
        <div class="ai-loading-sub" id="aiLoadingStep">Fetching attendance records</div>
      </div>

      <!-- Output -->
      <div id="aiReportOutput" style="display:none;" class="ai-output-box">
        <div class="ai-output-toolbar">
          <span class="ai-output-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
            Generated Report
          </span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-secondary" onclick="window.copyAIReport()">Copy</button>
            <button class="btn btn-sm btn-secondary" onclick="window.downloadAIReport()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
            <button class="btn btn-sm btn-secondary" onclick="window.prepareWhatsApp()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Send via WhatsApp
            </button>
          </div>
        </div>
        <div id="aiReportContent" class="ai-report-content"></div>
      </div>

      <!-- WhatsApp Panel -->
      <div id="whatsappPanel" style="display:none;" class="whatsapp-panel">
        <div class="whatsapp-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Send Weekly Report via WhatsApp
        </div>
        <div class="field-group" style="margin-bottom:14px;">
          <label class="field-label">Contractor's WhatsApp Number</label>
          <input type="tel" id="waPhone" class="field-input" placeholder="+91 98765 43210">
        </div>
        <div class="wa-preview" id="waPreview"></div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('whatsappPanel').style.display='none'">Cancel</button>
          <button class="wa-send-btn" style="flex:2;" onclick="window.sendWhatsApp()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Open WhatsApp
          </button>
        </div>
      </div>
    </div>
  `;

  // Insert at the TOP of the reports section, before existing cards
  const firstCard = reportsSection.querySelector(".card, .report-card, .stats-row");
  if (firstCard) {
    reportsSection.insertBefore(panel, firstCard);
  } else {
    reportsSection.appendChild(panel);
  }

  // Set default date to today
  const dateEl = document.getElementById("aiReportDate");
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  injectAIReportStyles();
}

// ── Gather data from Firestore for the past 7 days ───────────
async function gatherReportData(uid, projectFilter, weekEndingDate) {
  const weekEnd   = new Date(weekEndingDate);
  weekEnd.setHours(23,59,59,999);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);
  weekStart.setHours(0,0,0,0);

  const startStr = weekStart.toISOString().split("T")[0];
  const endStr   = weekEnd.toISOString().split("T")[0];

  function userCol(name) {
    return collection(db, "users", uid, name);
  }

  setLoadingStep("Fetching attendance records…");
  const attSnap = await getDocs(query(
    userCol("attendance"),
    where("date", ">=", startStr),
    where("date", "<=", endStr)
  ));
  const attendance = attSnap.docs.map(d => d.data());

  setLoadingStep("Fetching labourer data…");
  const labSnap = await getDocs(userCol("labourers"));
  const labourers = labSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  setLoadingStep("Fetching site journal entries…");
  let logsQuery = query(
    userCol("daily_logs"),
    where("date", ">=", startStr),
    where("date", "<=", endStr)
  );
  const logsSnap = await getDocs(logsQuery);
  const logs = logsSnap.docs.map(d => d.data())
    .filter(l => !projectFilter || l.project === projectFilter);

  setLoadingStep("Fetching material usage…");
  const matTxnSnap = await getDocs(query(
    userCol("materialTxns"),
    where("date", ">=", startStr),
    where("date", "<=", endStr)
  ));
  const materialTxns = matTxnSnap.docs.map(d => d.data());

  setLoadingStep("Fetching expenses…");
  const expSnap = await getDocs(query(
    userCol("expenses"),
    where("date", ">=", startStr),
    where("date", "<=", endStr)
  ));
  const expenses = expSnap.docs.map(d => d.data())
    .filter(e => !projectFilter || e.projectName === projectFilter || e.project === projectFilter);

  // Compute attendance stats per labourer
  const attMap = {};
  attendance.forEach(a => {
    if (!attMap[a.labourerId]) attMap[a.labourerId] = { present: 0, absent: 0 };
    if (a.status === "present") attMap[a.labourerId].present++;
    else if (a.status === "absent") attMap[a.labourerId].absent++;
  });

  const labourSummary = labourers
    .filter(l => !projectFilter || l.projectName === projectFilter)
    .map(l => ({
      name:       l.name,
      role:       l.role || "Worker",
      wagePerDay: l.wagePerDay || 0,
      project:    l.projectName || "General",
      daysPresent: attMap[l.id]?.present || 0,
      daysAbsent:  attMap[l.id]?.absent  || 0,
      weekEarnings: (attMap[l.id]?.present || 0) * (l.wagePerDay || 0),
    }));

  const totalLabourCost = labourSummary.reduce((s, l) => s + l.weekEarnings, 0);
  const totalExpenses   = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Material usage summary
  const matSummary = {};
  materialTxns.forEach(t => {
    const key = t.materialName || "Unknown";
    if (!matSummary[key]) matSummary[key] = { in: 0, out: 0, unit: t.unit || "" };
    if (t.type === "in")  matSummary[key].in  += (t.quantity || 0);
    if (t.type === "out") matSummary[key].out += (t.quantity || 0);
  });

  return {
    weekStart: startStr,
    weekEnd:   endStr,
    projectFilter,
    logs,
    labourSummary,
    totalLabourCost,
    materialSummary: matSummary,
    expenses,
    totalExpenses,
    attendance: {
      total:   attendance.length,
      present: attendance.filter(a => a.status === "present").length,
      absent:  attendance.filter(a => a.status === "absent").length,
    }
  };
}

// ── Call Claude API to generate the report ───────────────────
async function callClaudeForReport(data) {
  setLoadingStep("AI is writing your report…");

  const presentPct = data.attendance.total
    ? Math.round(data.attendance.present / data.attendance.total * 100)
    : 0;

  const prompt = `You are a professional construction site report writer. Write a formal weekly site report for a contractor based on the following data. Be specific, professional, and concise. Use clear sections.

REPORT DATA:
- Period: ${data.weekStart} to ${data.weekEnd}
- Project Filter: ${data.projectFilter || "All Projects"}

SITE JOURNAL ENTRIES (${data.logs.length} entries):
${data.logs.map(l => `• [${l.date}] ${l.project || "General"}: ${l.description} (Weather: ${l.weather || "N/A"}, Workers present: ${l.labourersPresent || 0})`).join("\n") || "No journal entries this week."}

LABOUR ATTENDANCE SUMMARY:
- Total attendance records: ${data.attendance.total}
- Present: ${data.attendance.present} (${presentPct}%)
- Absent: ${data.attendance.absent}
- Total labour cost this week: ₹${data.totalLabourCost.toLocaleString("en-IN")}

WORKERS THIS WEEK:
${data.labourSummary.slice(0, 15).map(l => `• ${l.name} (${l.role}) — ${l.daysPresent} days present, earned ₹${l.weekEarnings.toLocaleString("en-IN")}`).join("\n") || "No worker data."}

MATERIAL MOVEMENTS:
${Object.entries(data.materialSummary).map(([name, m]) => `• ${name}: +${m.in} received, -${m.out} used (${m.unit})`).join("\n") || "No material transactions this week."}

EXPENSES THIS WEEK:
${data.expenses.slice(0, 10).map(e => `• ${e.description} — ₹${(e.amount||0).toLocaleString("en-IN")} (${e.category})`).join("\n") || "No expenses recorded."}
- Total weekly spend: ₹${data.totalExpenses.toLocaleString("en-IN")}

Write the report with these exact sections:
1. WEEKLY SUMMARY (2-3 sentences overview)
2. WORK PROGRESS (what was done on site this week based on journal entries)
3. LABOUR & ATTENDANCE (attendance rate, notable absences, total cost)
4. MATERIAL USAGE (what was received and consumed)
5. FINANCIAL SNAPSHOT (expenses breakdown, total weekly cost)
6. ISSUES & RECOMMENDATIONS (any concerns, risks, or next steps)

Keep the tone professional but readable. Use ₹ for currency. Format numbers in Indian style (lakhs/thousands). End with a one-line action plan for next week.`;

  // Proxy via Cloudflare Worker to avoid CORS block on direct Anthropic calls.
  // Replace CLOUDFLARE_WORKER_URL with your worker URL after setup.
  const PROXY_URL = "https://old-sun-0c82.muhammedlais786.workers.dev";

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 2000,
      messages:   [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const result = await response.json();
  return result.content?.map(b => b.text || "").join("") || "No report generated.";
}

// ── Main generate function (called from button) ───────────────
window.generateAIReport = async function() {
  const uid = window._buildtrackUID;
  if (!uid) return alert("Please log in first.");

  const projectFilter = document.getElementById("aiReportProject")?.value || "";
  const weekEndDate   = document.getElementById("aiReportDate")?.value || new Date().toISOString().split("T")[0];

  // Show loading
  document.getElementById("aiReportOutput")?.setAttribute("style", "display:none");
  document.getElementById("whatsappPanel")?.setAttribute("style", "display:none");
  document.getElementById("aiReportLoading").style.display = "flex";
  document.getElementById("aiGenerateBtn").disabled = true;

  try {
    const data   = await gatherReportData(uid, projectFilter, weekEndDate);
    const report = await callClaudeForReport(data);

    window._lastAIReport     = report;
    window._lastReportData   = data;
    window._lastReportProject = projectFilter || "All Projects";
    window._lastReportWeek   = weekEndDate;

    // Render
    const formatted = report
      .replace(/^(#{1,3} .+)$/gm, m => `<h3 class="ai-rpt-section">${m.replace(/^#+\s/,"")}</h3>`)
      .replace(/^(\d+\. .+)$/gm, m => `<h3 class="ai-rpt-section">${m}</h3>`)
      .replace(/^• (.+)$/gm, m => `<div class="ai-rpt-bullet">${m}</div>`)
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");

    document.getElementById("aiReportContent").innerHTML = formatted;
    document.getElementById("aiReportLoading").style.display = "none";
    document.getElementById("aiReportOutput").style.display  = "block";
  } catch (err) {
    console.error("[AIReport] Error:", err);
    document.getElementById("aiReportLoading").style.display = "none";
    document.getElementById("aiReportContent").innerHTML =
      `<div style="color:var(--danger);padding:20px;">Failed to generate report: ${err.message}</div>`;
    document.getElementById("aiReportOutput").style.display = "block";
  } finally {
    document.getElementById("aiGenerateBtn").disabled = false;
  }
};

// ── Copy report to clipboard ─────────────────────────────────
window.copyAIReport = function() {
  const text = window._lastAIReport || "";
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(".ai-output-toolbar .btn-secondary");
    if (btn) { const orig=btn.textContent; btn.textContent="Copied!"; setTimeout(()=>btn.textContent=orig,2000); }
  });
};

// ── Download as .txt ─────────────────────────────────────────
window.downloadAIReport = function() {
  const text = window._lastAIReport || "";
  const blob  = new Blob([text], { type: "text/plain" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  const date  = window._lastReportWeek || new Date().toISOString().split("T")[0];
  a.href = url; a.download = `BuildTrack_Report_${date}.txt`; a.click();
  URL.revokeObjectURL(url);
};

// ── Prepare WhatsApp message ─────────────────────────────────
window.prepareWhatsApp = function() {
  const report = window._lastAIReport || "";
  if (!report) return;

  // Shorten to WhatsApp-friendly summary (first ~600 chars + key stats)
  const data = window._lastReportData || {};
  const summary = report.substring(0, 500).replace(/<[^>]+>/g, "") + "...";

  const waText = `*📊 BuildTrack Weekly Report*\n`
    + `*Week ending:* ${window._lastReportWeek || ""}\n`
    + `*Project:* ${window._lastReportProject || "All"}\n\n`
    + `*Attendance:* ${data.attendance?.present || 0} present / ${data.attendance?.total || 0} total\n`
    + `*Labour Cost:* ₹${(data.totalLabourCost || 0).toLocaleString("en-IN")}\n`
    + `*Weekly Spend:* ₹${(data.totalExpenses || 0).toLocaleString("en-IN")}\n\n`
    + `*Summary:*\n${summary}\n\n`
    + `_Generated by BuildTrack_`;

  window._waMessage = waText;

  // Show preview
  const preview = document.getElementById("waPreview");
  if (preview) {
    preview.innerHTML = `<div class="wa-bubble">${waText.replace(/\n/g,"<br>").replace(/\*(.*?)\*/g,"<strong>$1</strong>").replace(/_(.*?)_/g,"<em>$1</em>")}</div>`;
  }
  document.getElementById("whatsappPanel").style.display = "block";
};

// ── Open WhatsApp with the message ──────────────────────────
window.sendWhatsApp = function() {
  const phone = document.getElementById("waPhone")?.value.replace(/\D/g, "");
  const msg   = encodeURIComponent(window._waMessage || "BuildTrack Weekly Report");
  if (!phone) return alert("Please enter a WhatsApp number.");
  const url = phone
    ? `https://wa.me/${phone}?text=${msg}`
    : `https://wa.me/?text=${msg}`;
  window.open(url, "_blank");
};

// ── Populate project select in AI panel ──────────────────────
export function populateAIReportProjects(projects) {
  const sel = document.getElementById("aiReportProject");
  if (!sel) return;
  sel.innerHTML = `<option value="">All Projects</option>`;
  projects.forEach(p => sel.innerHTML += `<option value="${p.name}">${p.name}</option>`);
}

// ── Helper ───────────────────────────────────────────────────
function setLoadingStep(text) {
  const el = document.getElementById("aiLoadingStep");
  if (el) el.textContent = text;
}

// ── Styles ───────────────────────────────────────────────────
function injectAIReportStyles() {
  if (document.getElementById("aiReportStyles")) return;
  const style = document.createElement("style");
  style.id = "aiReportStyles";
  style.textContent = `
    #aiReportPanel { margin-bottom: 28px; }

    .ai-report-card {
      background: var(--surface-2, #1C1C1F);
      border: 1px solid rgba(245,166,35,0.2);
      border-radius: 20px;
      overflow: hidden;
    }
    .ai-report-header {
      padding: 28px 28px 0;
    }
    .ai-report-title-row { margin-bottom: 22px; }
    .ai-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(245,166,35,0.1);
      border: 1px solid rgba(245,166,35,0.3);
      color: #F5A623;
      font-size: 0.72rem; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase;
      padding: 5px 12px; border-radius: 100px;
      margin-bottom: 12px;
    }
    .ai-report-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.8rem; letter-spacing: 1px;
      color: var(--text, #F0EDE8);
      margin-bottom: 6px;
    }
    .ai-report-sub { color: var(--text-muted, #7A7872); font-size: 0.85rem; }

    .ai-report-controls { padding-bottom: 22px; }
    .ai-control-row { display: flex; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
    .ai-control-row .field-group { min-width: 160px; }

    .ai-generate-btn {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 15px 20px;
      background: linear-gradient(135deg, #F5A623 0%, #f0b83a 100%);
      color: #0A0A0C; border: none; border-radius: 12px;
      font-family: 'DM Sans', sans-serif;
      font-size: 0.95rem; font-weight: 700;
      cursor: pointer; justify-content: center;
      transition: all 0.2s;
      box-shadow: 0 4px 20px rgba(245,166,35,0.25);
    }
    .ai-generate-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(245,166,35,0.4); }
    .ai-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .ai-loading-box {
      flex-direction: column; align-items: center; justify-content: center;
      padding: 48px 28px; gap: 16px;
      display: none;
    }
    .ai-spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(245,166,35,0.15);
      border-top-color: #F5A623;
      border-radius: 50%;
      animation: aiSpin 0.8s linear infinite;
    }
    @keyframes aiSpin { to { transform: rotate(360deg); } }
    .ai-loading-text { font-weight: 600; color: var(--text); font-size: 0.95rem; }
    .ai-loading-sub { color: var(--text-muted); font-size: 0.82rem; }

    .ai-output-box { border-top: 1px solid rgba(255,255,255,0.05); }
    .ai-output-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 28px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      flex-wrap: wrap; gap: 10px;
    }
    .ai-output-label {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.8rem; font-weight: 600;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;
    }
    .ai-report-content {
      padding: 28px;
      color: var(--text, #F0EDE8);
      font-size: 0.9rem; line-height: 1.75;
      font-family: 'DM Sans', sans-serif;
    }
    .ai-rpt-section {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.15rem; letter-spacing: 1px;
      color: #F5A623;
      margin: 22px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(245,166,35,0.15);
    }
    .ai-rpt-bullet {
      padding: 4px 0 4px 14px;
      border-left: 2px solid rgba(245,166,35,0.2);
      margin: 4px 0;
      font-size: 0.87rem;
      color: var(--text-2, #A09D99);
    }

    /* WhatsApp Panel */
    .whatsapp-panel {
      border-top: 1px solid rgba(37,211,102,0.2);
      padding: 24px 28px;
      background: rgba(37,211,102,0.03);
    }
    .whatsapp-header {
      display: flex; align-items: center; gap: 10px;
      font-weight: 700; font-size: 1rem; color: #25D366;
      margin-bottom: 18px;
    }
    .wa-preview { margin: 14px 0; }
    .wa-bubble {
      background: #1a2c1a;
      border: 1px solid rgba(37,211,102,0.2);
      border-radius: 12px; padding: 14px 16px;
      font-size: 0.82rem; line-height: 1.6;
      color: var(--text); max-height: 200px;
      overflow-y: auto; white-space: pre-wrap;
    }
    .wa-send-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 14px; background: #25D366; color: #fff;
      border: none; border-radius: 12px;
      font-family: 'DM Sans', sans-serif;
      font-size: 0.95rem; font-weight: 700;
      cursor: pointer; transition: all 0.2s;
    }
    .wa-send-btn:hover { background: #1db954; transform: translateY(-1px); }

    @media (max-width: 600px) {
      .ai-control-row { flex-direction: column; }
      .ai-report-header, .ai-report-content, .ai-output-toolbar, .whatsapp-panel { padding-left: 18px; padding-right: 18px; }
    }
  `;
  document.head.appendChild(style);
}
