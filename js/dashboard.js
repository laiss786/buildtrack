// js/dashboard.js — BuildTrack v3 — Complete (with Firebase Storage uploads)
import { auth, db, storage } from "./firebase.js";
import { requireAuth } from "./auth-guard.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection, getDocs, addDoc, deleteDoc, getDoc,
  query, where, orderBy, limit,
  serverTimestamp, updateDoc, setDoc, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ═══════════════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════════════
let _projects      = [];
let _labourers     = [];
let _currentDocProj = "";
let _currentDocType = "all";
let _currentIssueFilter = "all";
let _currentStorage = "all";
let _currentExpCat  = "";
let _currentUser    = null;
let _uid            = null;

// ═══════════════════════════════════════════════════════
// USER-SCOPED COLLECTION HELPER
// All data lives under /users/{uid}/{collection}
// so each account has completely separate data.
// ═══════════════════════════════════════════════════════
function userCol(name) {
  if (!_uid) throw new Error("User not authenticated");
  return collection(db, "users", _uid, name);
}

function userDoc(name, id) {
  if (!_uid) throw new Error("User not authenticated");
  return doc(db, "users", _uid, name, id);
}

// ═══════════════════════════════════════════════════════
// 0. AUTH GUARD
// Init only runs AFTER Firebase confirms who the user is.
// This prevents _uid being null when loadProjects() fires.
// ═══════════════════════════════════════════════════════
requireAuth((user) => {
  _currentUser = user;
  _uid         = user.uid;

  const el = document.getElementById("userEmail");
  const av = document.getElementById("userInitial");
  if (el) el.innerText = user.email;
  if (av) av.innerText = user.email[0].toUpperCase();

  // Boot the dashboard only after uid is confirmed
  const ad = document.getElementById("attendanceDate");
  if (ad && !ad.value) ad.value = new Date().toISOString().split("T")[0];

  ensureProjects().then(() => loadProjects());
});

// ═══════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════
function toast(msg, type = "success") {
  const c = document.getElementById("toastContainer");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span>${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function fmtNum(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const ICONS = {
  Labour: "👷", Materials: "🧱", Equipment: "🔧",
  Transport: "🚛", Miscellaneous: "📎",
  Cement: "🏗️", Sand: "🪨", Steel: "⚙️", Bricks: "🧱",
  Tools: "🔨", Electrical: "⚡", Plumbing: "🚰", Other: "📦",
};

const SVG_DELETE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

// ═══════════════════════════════════════════════════════
// 1. NAVIGATION
// ═══════════════════════════════════════════════════════
const NAV_TITLES = {
  projects:"PROJECTS", dailyLogs:"SITE JOURNAL", labourers:"LABOURERS",
  attendance:"ATTENDANCE", payroll:"PAYROLL", materials:"MATERIALS & INVENTORY",
  expenses:"EXPENSES", issues:"SITE ISSUES", documents:"DOCUMENT VAULT", reports:"REPORTS",
};

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    item.classList.add("active");
    const id = item.dataset.section;
    document.getElementById(id)?.classList.add("active");
    const tb = document.getElementById("topbarTitle");
    if (tb) tb.textContent = NAV_TITLES[id] || id.toUpperCase();

    if (id === "projects")   loadProjects();
    if (id === "dailyLogs")  initDailyLogs();
    if (id === "labourers")  initLabourers();
    if (id === "attendance") initAttendance();
    if (id === "payroll")    initPayroll();
    if (id === "materials")  initMaterials();
    if (id === "expenses")   initExpenses();
    if (id === "issues")     initIssues();
    if (id === "documents")  initDocuments();
    if (id === "reports")    initReports();
  });
});

window.openModal  = id => { document.getElementById(id).style.display = "flex"; };
window.closeModal = id => { document.getElementById(id).style.display = "none"; };

// ═══════════════════════════════════════════════════════
// SHARED: populate selects from projects cache
// ═══════════════════════════════════════════════════════
async function ensureProjects() {
  if (_projects.length) return _projects;
  const snap = await getDocs(query(userCol("projects"), orderBy("createdAt","desc")));
  _projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return _projects;
}

async function ensureLabourers() {
  if (_labourers.length) return _labourers;
  const snap = await getDocs(userCol("labourers"));
  _labourers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return _labourers;
}

function populateSelect(id, items, valKey, labelKey, placeholder = "Select...") {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(p => { el.innerHTML += `<option value="${p[valKey]}">${p[labelKey]}</option>`; });
}

function populateProjectSelects(...ids) {
  ids.forEach(id => populateSelect(id, _projects, "name", "name", "Select project..."));
}

// ═══════════════════════════════════════════════════════
// 2. PROJECTS
// ═══════════════════════════════════════════════════════
async function loadProjects() {
  _projects = [];
  const grid = document.getElementById("projectsGrid");
  if (!grid) return;
  grid.innerHTML = [1,2,3].map(() =>
    `<div class="project-card"><div class="skeleton" style="height:200px;border-radius:var(--radius);"></div></div>`).join("");

  try {
    const projs = await ensureProjects();
    const active = projs.filter(p => p.status !== "finished");
    const done   = projs.filter(p => p.status === "finished");

    document.getElementById("totalProjectCount").innerText = projs.length;
    document.getElementById("activeSiteCount").innerText   = active.length;
    document.getElementById("completedCount").innerText    = done.length;

    let html = active.map(p => renderProjectCard(p, false)).join("");
    if (done.length) {
      html += `<div class="proj-divider"><span class="proj-divider-label">Completed (${done.length})</span><span class="proj-divider-line"></span></div>`;
      html += done.map(p => renderProjectCard(p, true)).join("");
    }
    grid.innerHTML = html || `<div style="grid-column:1/-1;"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No projects yet</div><div class="empty-sub">Click "New Project" to begin.</div></div></div>`;
  } catch(e) { console.error(e); grid.innerHTML = `<div style="color:var(--danger);grid-column:1/-1;text-align:center;padding:40px;">Failed to load projects.</div>`; }
}

function renderProjectCard(p, isFinished) {
  const daysLeft = p.endDate ? Math.ceil((new Date(p.endDate)-new Date())/(1000*60*60*24)) : null;
  const daysTag  = daysLeft !== null && !isFinished
    ? `<span class="pill ${daysLeft < 0 ? "pill-red" : daysLeft < 14 ? "pill-gold" : "pill-green"}">${daysLeft < 0 ? "Overdue" : daysLeft+"d left"}</span>`
    : "";
  return `
    <div class="project-card ${isFinished?"finished":""}">
      <div class="flex justify-between items-center" style="margin-bottom:14px;">
        <div class="proj-status-badge ${isFinished?"done":"live"}"><span class="dot"></span>${isFinished?"Completed":"Live Site"}</div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${daysTag}
          <button class="btn btn-icon btn-danger btn-sm" onclick="deleteProject('${p.id}')" title="Delete">${SVG_DELETE}</button>
        </div>
      </div>
      <div class="proj-name">${p.name}</div>
      <div class="proj-meta">
        <div>Client: <strong style="color:var(--text);">${p.client}</strong></div>
        ${p.address?`<div style="margin-top:3px;font-size:0.8rem;color:var(--text-3);">📍 ${p.address}</div>`:""}
        ${p.budget?`<div style="margin-top:3px;font-size:0.8rem;">Budget: <strong style="color:var(--gold);">${fmt(p.budget)}</strong></div>`:""}
      </div>
      <div class="proj-footer">
        <div><div class="proj-date-label">Launched</div><div class="proj-date-val">${p.startDate||"—"}</div></div>
        <button class="btn btn-sm ${isFinished?"btn-ghost":"btn-secondary"}" onclick="toggleProjectStatus('${p.id}','${p.status||"active"}')">
          ${isFinished?"Re-activate":"Mark Complete"}
        </button>
      </div>
    </div>`;
}

document.getElementById("projectForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("saveProjBtn");
  btn.disabled = true; btn.textContent = "Launching...";
  try {
    await addDoc(userCol("projects"), {
      name: document.getElementById("projName").value.trim(),
      client: document.getElementById("projClient").value.trim(),
      startDate: document.getElementById("projStart").value,
      endDate: document.getElementById("projEndDate").value || "",
      budget: parseFloat(document.getElementById("projBudget").value)||0,
      area: parseInt(document.getElementById("projArea").value)||0,
      address: document.getElementById("projAddress").value.trim()||"",
      status: "active", createdAt: serverTimestamp()
    });
    _projects = [];
    closeModal("projectModal"); e.target.reset(); toast("Project launched!"); await loadProjects();
  } catch(err) { console.error(err); toast("Failed to save project.","error"); }
  finally { btn.disabled=false; btn.textContent="Launch Project"; }
});

window.deleteProject = async id => {
  if (!confirm("Permanently delete this project and all its data?")) return;
  await deleteDoc(userDoc("projects", id)); _projects=[];
  toast("Project deleted.","error"); loadProjects();
};
window.toggleProjectStatus = async (id, cur) => {
  const next = cur==="active"?"finished":"active";
  await updateDoc(userDoc("projects",id),{status:next}); _projects=[];
  toast(`Project marked ${next}.`); loadProjects();
};

// ═══════════════════════════════════════════════════════
// 3. DAILY LOGS
// ═══════════════════════════════════════════════════════
function initDailyLogs() {
  const di = document.getElementById("logDateInput");
  if (di && !di.value) di.value = new Date().toISOString().split("T")[0];
  ensureProjects().then(() => populateProjectSelects("logProjectSelect"));
  loadDailyLogs("");
  const drop = document.getElementById("logProjectSelect");
  if (drop && !drop.dataset.bound) {
    drop.addEventListener("change", e => loadDailyLogs(e.target.value));
    drop.dataset.bound = "1";
  }
}

async function loadDailyLogs(filter="") {
  const feed = document.getElementById("logsFeed");
  if (!feed) return;
  feed.innerHTML = `<div class="empty-state"><div class="empty-sub">Loading...</div></div>`;
  try {
    const ref = userCol("daily_logs");
    const q = filter
      ? query(ref, where("project","==",filter), orderBy("date","desc"))
      : query(ref, orderBy("date","desc"), limit(60));
    const snap = await getDocs(q);
    if (snap.empty) { feed.innerHTML=`<div class="empty-state"><div class="empty-icon">📓</div><div class="empty-title">No entries yet</div><div class="empty-sub">Post your first journal entry.</div></div>`; return; }
    feed.innerHTML="";
    snap.forEach(d => {
      const log=d.data(), id=d.id;
      const time = log.createdAt ? new Date(log.createdAt.toDate()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "";
      const weatherMap = { Clear:"☀️",Cloudy:"⛅",Rain:"🌧️","Heavy Rain":"⛈️",Hot:"🌡️" };
      const wi = weatherMap[log.weather] || "";
      const el = document.createElement("div");
      el.className="timeline-item"; el.id=`log-${id}`;
      el.innerHTML=`
        <div class="log-card">
          <div class="flex justify-between items-center" style="margin-bottom:10px;">
            <div class="flex gap-2 items-center">
              <span class="log-date-tag">${log.date}</span>
              <span class="log-project-tag">${log.project||"General"}</span>
              ${wi?`<span style="font-size:1rem;">${wi}</span>`:""}
            </div>
            <button class="btn btn-icon btn-danger btn-sm" onclick="deleteLog('${id}')">${SVG_DELETE}</button>
          </div>
          <div class="log-description">${log.description}</div>
          <div class="log-meta">
            <span>👷 ${log.labourersPresent||0} workers</span>
            ${time?`<span>🕒 ${time}</span>`:""}
          </div>
        </div>`;
      feed.appendChild(el);
    });
  } catch(e){ console.error(e); feed.innerHTML=`<div style="color:var(--danger);padding:20px;">Error loading logs.</div>`; }
}

document.getElementById("logForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const project = document.getElementById("logProjectSelect").value;
  if (!project) return toast("Select a project first.","error");
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled=true; btn.textContent="Posting...";
  try {
    await addDoc(userCol("daily_logs"),{
      project, date:document.getElementById("logDateInput").value,
      labourersPresent:parseInt(document.getElementById("labourCount").value)||0,
      description:document.getElementById("logDesc").value,
      weather:document.getElementById("logWeather").value,
      createdAt:serverTimestamp()
    });
    ["logDateInput","labourCount","logDesc"].forEach(i=>document.getElementById(i).value="");
    toast("Entry posted!"); await loadDailyLogs(project);
  } catch(e){ console.error(e); toast("Error: "+e.message,"error"); }
  finally { btn.disabled=false; btn.textContent="Post Entry"; }
});

window.deleteLog = async id => {
  if (!confirm("Delete this entry?")) return;
  await deleteDoc(userDoc("daily_logs",id));
  document.getElementById(`log-${id}`)?.remove();
  toast("Entry deleted.","error");
};

// ═══════════════════════════════════════════════════════
// 4. LABOURERS
// ═══════════════════════════════════════════════════════
async function initLabourers() {
  _labourers = [];
  await ensureProjects();
  populateProjectSelects("labourerProjectFilter");
  await loadLabourerList();
  const si = document.getElementById("labourerSearch");
  if (si && !si.dataset.bound) {
    si.addEventListener("input", filterLabourerTable);
    document.getElementById("labourerProjectFilter")?.addEventListener("change", filterLabourerTable);
    si.dataset.bound="1";
  }
}

async function loadLabourerList() {
  const tbody = document.getElementById("labourersTableBody");
  if (!tbody) return;
  tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-3);">Loading...</td></tr>`;
  try {
    const labs = await ensureLabourers();
    if (!labs.length) { tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-3);">No labourers registered yet.</td></tr>`; updateLabourerStats([]); return; }
    renderLabourerTable(labs);
    updateLabourerStats(labs);
  } catch(e){ console.error(e); }
}

function renderLabourerTable(labs) {
  const tbody = document.getElementById("labourersTableBody");
  if (!tbody) return;
  tbody.innerHTML="";
  labs.forEach(w => {
    const joined = w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString("en-IN") : "—";
    tbody.innerHTML+=`
      <tr data-id="${w.id}" data-project="${w.projectName||""}" data-name="${w.name.toLowerCase()}" data-role="${(w.role||"").toLowerCase()}">
        <td><div style="font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px;">
          <div class="worker-avatar-sm">${w.name[0].toUpperCase()}</div>${w.name}
        </div></td>
        <td><span class="pill pill-neutral">${w.role||"—"}</span></td>
        <td style="color:var(--gold);font-weight:600;">${fmt(w.wagePerDay)}</td>
        <td style="color:var(--text-2);">${w.phone||"—"}</td>
        <td><span class="pill pill-neutral">${w.projectName||"Unassigned"}</span></td>
        <td style="color:var(--text-3);font-size:0.8rem;">${joined}</td>
        <td style="text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;">
            <button class="btn btn-icon btn-secondary btn-sm" onclick="viewLabourer('${w.id}')" title="View profile">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn btn-icon btn-danger btn-sm" onclick="deleteLabourer('${w.id}')">${SVG_DELETE}</button>
          </div>
        </td>
      </tr>`;
  });
}

function filterLabourerTable() {
  const q   = document.getElementById("labourerSearch")?.value.toLowerCase()||"";
  const pf  = document.getElementById("labourerProjectFilter")?.value||"";
  document.querySelectorAll("#labourersTableBody tr[data-id]").forEach(row => {
    const nameMatch = row.dataset.name.includes(q)||row.dataset.role.includes(q);
    const projMatch = !pf || row.dataset.project === pf;
    row.style.display = nameMatch && projMatch ? "" : "none";
  });
}

function updateLabourerStats(labs) {
  const total = labs.length;
  const daily = labs.reduce((s,w)=>s+(w.wagePerDay||0),0);
  const avg   = total ? Math.round(daily/total) : 0;
  document.getElementById("totalLabourers").innerText = total;
  document.getElementById("dailyWageBill").innerText  = fmt(daily);
  document.getElementById("monthlyWageBill").innerText = fmt(daily*26);
  document.getElementById("avgWage").innerText = fmt(avg);
}

window.openAddLabourerModal = async () => {
  await ensureProjects();
  populateProjectSelects("labourerProjectSelect");
  openModal("labourerModal");
};

window.viewLabourer = async id => {
  const w = _labourers.find(l=>l.id===id);
  if (!w) return;
  alert(`Worker: ${w.name}\nRole: ${w.role||"—"}\nWage: ${fmt(w.wagePerDay)}/day\nPhone: ${w.phone||"—"}\nProject: ${w.projectName||"Unassigned"}\nNotes: ${w.notes||"—"}`);
};

document.getElementById("labourerForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const sel = document.getElementById("labourerProjectSelect");
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled=true; btn.textContent="Saving...";
  try {
    await addDoc(userCol("labourers"),{
      name:    document.getElementById("labourerName").value.trim(),
      role:    document.getElementById("labourerRole").value.trim(),
      wagePerDay: Number(document.getElementById("labourerWage").value)||0,
      phone:   document.getElementById("labourerPhone").value.trim(),
      idLast4: document.getElementById("labourerID").value.trim(),
      notes:   document.getElementById("labourerNotes").value.trim(),
      projectId:   sel?.value||"",
      projectName: sel?.options[sel.selectedIndex]?.text||"Unassigned",
      createdAt: serverTimestamp()
    });
    _labourers=[];
    closeModal("labourerModal"); e.target.reset(); toast("Labourer added!");
    await initLabourers();
  } catch(e){ console.error(e); toast("Failed to add labourer.","error"); }
  finally { btn.disabled=false; btn.textContent="Add Worker"; }
});

window.deleteLabourer = async id => {
  if (!confirm("Remove this worker? Their attendance records will remain.")) return;
  await deleteDoc(userDoc("labourers",id)); _labourers=[];
  toast("Worker removed.","error"); await initLabourers();
};

// ═══════════════════════════════════════════════════════
// 5. ATTENDANCE
// ═══════════════════════════════════════════════════════
async function initAttendance() {
  const di = document.getElementById("attendanceDate");
  if (di && !di.value) di.value = new Date().toISOString().split("T")[0];
  await ensureProjects();
  populateProjectSelects("attendanceProjectFilter","historyProjectFilter");
  await loadAttendanceTiles();
  document.getElementById("attSummaryChips").style.display="flex";
}

async function loadAttendanceTiles() {
  const grid = document.getElementById("attendanceTileGrid");
  if (!grid) return;
  grid.innerHTML=`<div style="color:var(--text-3);">Loading workers...</div>`;
  try {
    const labs = await ensureLabourers();
    const date = document.getElementById("attendanceDate")?.value||"";
    let existing = {};
    if (date) {
      const snap = await getDocs(query(userCol("attendance"), where("date","==",date)));
      snap.forEach(d=>{ existing[d.data().labourerId]=d.data().status; });
    }
    const pf = document.getElementById("attendanceProjectFilter")?.value||"";
    const filtered = pf ? labs.filter(l=>l.projectName===pf) : labs;
    if (!filtered.length) { grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">👷</div><div class="empty-title">No labourers found</div></div>`; return; }
    grid.innerHTML="";
    filtered.forEach(w => {
      const saved = existing[w.id]||"pending";
      const tile = document.createElement("div");
      tile.className=`att-tile ${saved}`;
      tile.dataset.id=w.id; tile.dataset.status=saved;
      tile.innerHTML=`<div class="worker-initial">${w.name[0].toUpperCase()}</div><div class="worker-name">${w.name}</div><div class="att-status-chip">${saved.charAt(0).toUpperCase()+saved.slice(1)}</div>`;
      tile.addEventListener("click",()=>{
        const cycle={pending:"present",present:"absent",absent:"pending"};
        const labels={pending:"Pending",present:"Present",absent:"Absent"};
        const next=cycle[tile.dataset.status];
        tile.dataset.status=next; tile.className=`att-tile ${next}`;
        tile.querySelector(".att-status-chip").textContent=labels[next];
        updateAttSummary();
      });
      grid.appendChild(tile);
    });
    updateAttSummary();
  } catch(e){ console.error(e); }
}

function updateAttSummary() {
  const tiles = document.querySelectorAll(".att-tile");
  let p=0,a=0,pe=0;
  tiles.forEach(t=>{ if(t.dataset.status==="present")p++; else if(t.dataset.status==="absent")a++; else pe++; });
  document.getElementById("presentCount").textContent=p;
  document.getElementById("absentCount").textContent=a;
  document.getElementById("pendingCount").textContent=pe;
}

window.markAll = status => {
  const labels={pending:"Pending",present:"Present",absent:"Absent"};
  document.querySelectorAll(".att-tile").forEach(t=>{
    t.dataset.status=status; t.className=`att-tile ${status}`;
    t.querySelector(".att-status-chip").textContent=labels[status];
  });
  updateAttSummary();
};

window.switchAttTab = (tab, btn) => {
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("attMarkTab").style.display   = tab==="mark"?"block":"none";
  document.getElementById("attHistoryTab").style.display = tab==="history"?"block":"none";
};

document.getElementById("attendanceProjectFilter")?.addEventListener("change", loadAttendanceTiles);
document.getElementById("attendanceDate")?.addEventListener("change", loadAttendanceTiles);

document.getElementById("saveAttendanceBtn")?.addEventListener("click", async () => {
  const date = document.getElementById("attendanceDate")?.value;
  if (!date) return toast("Select a date first.","error");
  const tiles = document.querySelectorAll(".att-tile");
  if (!tiles.length) return;
  const btn = document.getElementById("saveAttendanceBtn");
  btn.disabled=true; btn.textContent="Saving...";
  try {
    const batch = writeBatch(db);
    tiles.forEach(tile=>{
      const ref = doc(db, "users", _uid, "attendance", `${tile.dataset.id}_${date}`);
      batch.set(ref,{ labourerId:tile.dataset.id, date, status:tile.dataset.status, timestamp:serverTimestamp() });
    });
    await batch.commit();
    toast("Attendance saved for "+date+"!");
  } catch(e){ console.error(e); toast("Save failed.","error"); }
  finally { btn.disabled=false; btn.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Save Attendance`; }
});

window.loadAttHistory = async () => {
  const date = document.getElementById("historyDate")?.value;
  const pf   = document.getElementById("historyProjectFilter")?.value||"";
  const box  = document.getElementById("attHistoryTable");
  if (!date) { box.innerHTML=`<div class="empty-state"><div class="empty-title">Select a date</div></div>`; return; }
  box.innerHTML=`<div style="color:var(--text-3);padding:20px;">Loading...</div>`;
  try {
    const labs = await ensureLabourers();
    const snap = await getDocs(query(userCol("attendance"),where("date","==",date)));
    const rec = {}; snap.forEach(d=>{ rec[d.data().labourerId]=d.data().status; });
    const filtered = pf ? labs.filter(l=>l.projectName===pf) : labs;
    const present=filtered.filter(l=>rec[l.id]==="present");
    const absent=filtered.filter(l=>rec[l.id]==="absent");
    const pending=filtered.filter(l=>!rec[l.id]||rec[l.id]==="pending");
    const pct = filtered.length ? Math.round(present.length/filtered.length*100) : 0;
    box.innerHTML=`
      <div style="display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap;">
        <div class="summary-chip chip-present"><span class="dot"></span>${present.length} Present (${pct}%)</div>
        <div class="summary-chip chip-absent"><span class="dot"></span>${absent.length} Absent</div>
        <div class="summary-chip chip-total"><span class="dot"></span>${pending.length} Not Marked</div>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="data-table">
          <thead><tr><th>Worker</th><th>Role</th><th>Project</th><th>Status</th></tr></thead>
          <tbody>
            ${filtered.map(l=>{
              const s=rec[l.id]||"pending";
              const cls=s==="present"?"pill-green":s==="absent"?"pill-red":"pill-neutral";
              return `<tr><td style="font-weight:600;color:var(--text);">${l.name}</td><td>${l.role||"—"}</td><td>${l.projectName||"—"}</td><td><span class="pill ${cls}">${s}</span></td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  } catch(e){ console.error(e); box.innerHTML=`<div style="color:var(--danger);">Error loading history.</div>`; }
};

// ═══════════════════════════════════════════════════════
// 6. PAYROLL
// ═══════════════════════════════════════════════════════
function initPayroll() {
  const sel = document.getElementById("payrollMonth");
  if (sel && !sel.options.length) {
    const now = new Date();
    for (let i=0; i<12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const val = d.toISOString().slice(0,7);
      const lbl = d.toLocaleString("en-IN",{month:"long",year:"numeric"});
      sel.innerHTML += `<option value="${val}">${lbl}</option>`;
    }
  }
  ensureProjects().then(()=>populateProjectSelects("payrollProjectFilter"));
}

window.calculatePayroll = async () => {
  const month = document.getElementById("payrollMonth")?.value;
  const pf    = document.getElementById("payrollProjectFilter")?.value||"";
  if (!month) return toast("Select a month.","error");
  const [y,m] = month.split("-");
  const daysInMonth = new Date(y, m, 0).getDate();
  const list = document.getElementById("payrollList");
  list.innerHTML=`<div style="padding:20px;color:var(--text-3);">Calculating...</div>`;
  try {
    const labs = await ensureLabourers();
    const filtered = pf ? labs.filter(l=>l.projectName===pf) : labs;
    const snap = await getDocs(query(userCol("attendance"),
      where("date",">=",`${month}-01`), where("date","<=",`${month}-${String(daysInMonth).padStart(2,"0")}`)));
    const attMap = {};
    snap.forEach(d=>{ const a=d.data(); if(a.status==="present"){ attMap[a.labourerId]=(attMap[a.labourerId]||0)+1; } });

    let totalPayable=0;
    const rows = filtered.map(w=>{
      const days = attMap[w.id]||0;
      const gross = days*(w.wagePerDay||0);
      totalPayable += gross;
      return { w, days, gross };
    });

    document.getElementById("payrollTotal").innerText  = fmt(totalPayable);
    document.getElementById("payrollPaid").innerText   = fmt(0);
    document.getElementById("payrollPending").innerText = fmt(totalPayable);
    document.getElementById("payrollWorkers").innerText = rows.length;

    if (!rows.length) { list.innerHTML=`<div class="empty-state"><div class="empty-icon">👷</div><div class="empty-title">No workers found for this filter.</div></div>`; return; }

    list.innerHTML = rows.sort((a,b)=>b.gross-a.gross).map(r=>`
      <div class="payroll-row">
        <div><div style="font-weight:600;color:var(--text);">${r.w.name}</div><div style="font-size:0.75rem;color:var(--text-3);">${r.w.role||"Worker"} · ${r.w.projectName||"—"}</div></div>
        <div style="font-weight:600;">${r.days}</div>
        <div style="color:var(--text-2);">${fmt(r.w.wagePerDay)}</div>
        <div style="font-weight:700;color:var(--gold);">${fmt(r.gross)}</div>
        <div style="font-weight:700;color:var(--gold);">${fmt(r.gross)}</div>
        <div><span class="payroll-status-badge pay-pending">Pending</span></div>
      </div>`).join("");
  } catch(e){ console.error(e); list.innerHTML=`<div style="color:var(--danger);">Error calculating payroll.</div>`; }
};

// ═══════════════════════════════════════════════════════
// 7. MATERIALS
// ═══════════════════════════════════════════════════════
async function initMaterials() {
  await ensureProjects();
  populateProjectSelects("matProject","transferProject");
  await loadMaterials();
  await loadMaterialTxns();
  const si = document.getElementById("materialSearch");
  if (si && !si.dataset.bound) {
    si.addEventListener("input", renderMaterialsGrid);
    document.getElementById("materialCategoryFilter")?.addEventListener("change", renderMaterialsGrid);
    si.dataset.bound="1";
  }
}

let _materials = [];

async function loadMaterials() {
  try {
    const snap = await getDocs(query(userCol("materials"), orderBy("createdAt","desc")));
    _materials = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderMaterialsGrid();
    updateMaterialStats();
    const ts = document.getElementById("transferMaterial");
    if (ts) { ts.innerHTML=`<option value="">Select material...</option>`; _materials.forEach(m=>{ ts.innerHTML+=`<option value="${m.id}">${m.name} (${m.location||"shed"})</option>`; }); }
  } catch(e){ console.error(e); }
}

function renderMaterialsGrid() {
  const grid = document.getElementById("materialsGrid");
  if (!grid) return;
  const q  = document.getElementById("materialSearch")?.value.toLowerCase()||"";
  const cf = document.getElementById("materialCategoryFilter")?.value||"";
  const sf = _currentStorage;
  let filtered = _materials.filter(m=>{
    const matchQ  = !q  || m.name.toLowerCase().includes(q);
    const matchC  = !cf || m.category===cf;
    const matchS  = sf==="all" || m.location===sf;
    return matchQ && matchC && matchS;
  });
  if (!filtered.length) { grid.innerHTML=`<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No materials found</div><div class="empty-sub">Add stock using the button above.</div></div>`; return; }

  const groups = {};
  filtered.forEach(m=>{ (groups[m.category||"Other"]||(groups[m.category||"Other"]=[])).push(m); });

  grid.innerHTML = Object.entries(groups).map(([cat,items])=>`
    <div class="material-category" style="margin-bottom:16px;">
      <div class="material-cat-header">
        <div class="material-cat-title">
          <div class="cat-icon" style="background:var(--gold-dim);color:var(--gold);">${ICONS[cat]||"📦"}</div>
          ${cat} <span class="pill pill-neutral" style="margin-left:6px;">${items.length}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-3);">Total: ${items.reduce((s,m)=>s+(m.quantity||0),0)} ${items[0]?.unit||""}</div>
      </div>
      ${items.map(m=>{
        const isLow = m.minStock && m.quantity <= m.minStock;
        const qClass = isLow ? "stock-low" : m.quantity > (m.minStock||0)*3 ? "stock-ok" : "stock-warn";
        return `
          <div class="material-item">
            <div>
              <div class="material-name">${m.name}</div>
              <div class="material-sub">${m.location==="site"?"🏗️ On Site":"🏚️ In Shed"} ${m.projectName?`· ${m.projectName}`:""} ${m.supplier?`· ${m.supplier}`:""}</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              ${isLow?`<span class="pill pill-red">Low Stock</span>`:""}
              <div class="material-qty ${qClass}">${m.quantity} <span>${m.unit||"units"}</span></div>
              <button class="btn btn-icon btn-danger btn-sm" onclick="deleteMaterial('${m.id}')">${SVG_DELETE}</button>
            </div>
          </div>`;
      }).join("")}
    </div>`).join("");
}

function updateMaterialStats() {
  document.getElementById("matTotalItems").innerText = _materials.length;
  document.getElementById("matLowStock").innerText   = _materials.filter(m=>m.minStock&&m.quantity<=m.minStock).length;
  document.getElementById("matInShed").innerText     = _materials.filter(m=>m.location==="shed").length;
  document.getElementById("matOnSite").innerText     = _materials.filter(m=>m.location==="site").length;
}

window.switchStorage = (loc, btn) => {
  document.querySelectorAll(".storage-pill").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); _currentStorage=loc; renderMaterialsGrid();
};

async function loadMaterialTxns() {
  const box = document.getElementById("materialTxnList");
  if (!box) return;
  try {
    const snap = await getDocs(query(userCol("materialTxns"), orderBy("createdAt","desc"), limit(20)));
    if (snap.empty) { box.innerHTML=`<div style="color:var(--text-3);font-size:0.85rem;text-align:center;padding:20px;">No transactions yet.</div>`; return; }
    box.innerHTML="";
    snap.forEach(d=>{
      const t=d.data();
      const badge = t.type==="in"?`<span class="txn-type-badge txn-in">IN</span>`:t.type==="out"?`<span class="txn-type-badge txn-out">OUT</span>`:`<span class="txn-type-badge txn-transfer">TRANSFER</span>`;
      box.innerHTML+=`
        <div class="txn-row">
          <div style="display:flex;align-items:center;gap:10px;">
            ${badge}
            <div><div style="font-size:0.88rem;font-weight:600;color:var(--text);">${t.materialName||"Material"}</div><div style="font-size:0.72rem;color:var(--text-3);">${t.notes||""}</div></div>
          </div>
          <div style="text-align:right;font-weight:700;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:${t.type==="in"?"var(--success)":t.type==="out"?"var(--danger)":"var(--info)"};">
            ${t.type==="in"?"+":"-"}${t.quantity} ${t.unit||""}
          </div>
          <div style="font-size:0.75rem;color:var(--text-3);">${t.date||""}</div>
        </div>`;
    });
  } catch(e){ console.error(e); }
}

document.getElementById("materialForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled=true; btn.textContent="Saving...";
  const sel = document.getElementById("matProject");
  const projName = sel?.options[sel.selectedIndex]?.text||"";
  const qty = parseFloat(document.getElementById("matQty").value)||0;
  const name = document.getElementById("matName").value.trim();
  try {
    const loc = document.getElementById("matLocation").value;
    const existing = _materials.find(m=>m.name.toLowerCase()===name.toLowerCase()&&m.location===loc);
    if (existing) {
      await updateDoc(userDoc("materials",existing.id),{ quantity: (existing.quantity||0)+qty });
    } else {
      await addDoc(userCol("materials"),{
        name, category:document.getElementById("matCategory").value,
        quantity:qty, unit:document.getElementById("matUnit").value,
        location:loc, minStock:parseFloat(document.getElementById("matMinStock").value)||0,
        projectId:sel?.value||"", projectName:projName==="Select project..."?"":projName,
        costPerUnit:parseFloat(document.getElementById("matCostPerUnit").value)||0,
        supplier:document.getElementById("matNotes").value.trim(),
        createdAt:serverTimestamp()
      });
    }
    await addDoc(userCol("materialTxns"),{
      materialName:name, type:"in", quantity:qty,
      unit:document.getElementById("matUnit").value,
      notes:document.getElementById("matNotes").value.trim(),
      date:new Date().toISOString().split("T")[0], createdAt:serverTimestamp()
    });
    closeModal("materialModal"); e.target.reset(); toast("Stock added!");
    _materials=[]; await loadMaterials(); await loadMaterialTxns();
  } catch(err){ console.error(err); toast("Failed.","error"); }
  finally { btn.disabled=false; btn.textContent="Add to Inventory"; }
});

document.getElementById("transferForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const matId = document.getElementById("transferMaterial").value;
  const from  = document.getElementById("transferFrom").value;
  const qty   = parseFloat(document.getElementById("transferQty").value)||0;
  if (!matId||!qty) return toast("Fill all fields.","error");
  const mat = _materials.find(m=>m.id===matId);
  if (!mat) return;
  if ((mat.quantity||0) < qty) return toast("Not enough stock.","error");
  const to = from==="shed"?"site":"shed";
  try {
    await updateDoc(userDoc("materials",matId),{ quantity:(mat.quantity||0)-qty, location:from });
    const dest = _materials.find(m=>m.name.toLowerCase()===mat.name.toLowerCase()&&m.location===to);
    if (dest) { await updateDoc(userDoc("materials",dest.id),{quantity:(dest.quantity||0)+qty}); }
    else { await addDoc(userCol("materials"),{...mat, id:undefined, location:to, quantity:qty, createdAt:serverTimestamp()}); }
    await addDoc(userCol("materialTxns"),{
      materialName:mat.name, type:"transfer", quantity:qty, unit:mat.unit,
      notes:`${from} → ${to}`, date:new Date().toISOString().split("T")[0], createdAt:serverTimestamp()
    });
    closeModal("transferModal"); e.target.reset(); toast(`Transferred ${qty} ${mat.unit} to ${to}.`);
    _materials=[]; await loadMaterials(); await loadMaterialTxns();
  } catch(err){ console.error(err); toast("Transfer failed.","error"); }
});

window.deleteMaterial = async id => {
  if (!confirm("Remove this material?")) return;
  await deleteDoc(userDoc("materials",id)); _materials=[];
  toast("Removed.","error"); await loadMaterials();
};

// ═══════════════════════════════════════════════════════
// 8. EXPENSES
// ═══════════════════════════════════════════════════════
let _expenses = [];

async function initExpenses() {
  await ensureProjects();
  populateProjectSelects("expProject","expProjectFilter");
  const ed = document.getElementById("expDate");
  if (ed && !ed.value) ed.value = new Date().toISOString().split("T")[0];
  await loadExpenses();
  document.querySelectorAll("#expCatFilters .cat-filter-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll("#expCatFilters .cat-filter-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active"); _currentExpCat=btn.dataset.cat;
      renderExpenseRows();
    });
  });
  document.getElementById("expProjectFilter")?.addEventListener("change", renderExpenseRows);
}

async function loadExpenses() {
  try {
    const snap = await getDocs(query(userCol("expenses"), orderBy("createdAt","desc"), limit(200)));
    _expenses = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderExpenseRows();
    updateExpenseStats();
  } catch(e){ console.error(e); }
}

function renderExpenseRows() {
  const box = document.getElementById("expenseRows");
  if (!box) return;
  const pf  = document.getElementById("expProjectFilter")?.value||"";
  const filtered = _expenses.filter(ex=>{
    const catOk  = !_currentExpCat || ex.category===_currentExpCat;
    const projOk = !pf || ex.projectName===pf||ex.project===pf;
    return catOk && projOk;
  });
  if (!filtered.length) { box.innerHTML=`<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No expenses found</div></div>`; return; }
  box.innerHTML = filtered.map(ex=>`
    <div class="expense-row">
      <div class="expense-cat-icon" style="background:var(--surface-3);">${ICONS[ex.category]||"📎"}</div>
      <div>
        <div class="expense-title">${ex.description}</div>
        <div class="expense-meta">${ex.date||""} ${ex.vendor?`· ${ex.vendor}`:""} ${ex.payMode?`· ${ex.payMode}`:""}</div>
      </div>
      <div class="expense-amount">${fmt(ex.amount)}</div>
      <div class="expense-proj-tag">${ex.projectName||ex.project||"General"}</div>
      <button class="btn btn-icon btn-danger btn-sm" onclick="deleteExpense('${ex.id}')">${SVG_DELETE}</button>
    </div>`).join("");
}

function updateExpenseStats() {
  const total = _expenses.reduce((s,e)=>s+(e.amount||0),0);
  const now = new Date(); const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const thisMonth = _expenses.filter(e=>e.date?.startsWith(ym)).reduce((s,e)=>s+(e.amount||0),0);
  const budget = _projects.reduce((s,p)=>s+(p.budget||0),0);
  const remaining = Math.max(0, budget-total);
  const pct = budget ? Math.min(100,Math.round(total/budget*100)) : 0;
  document.getElementById("expTotalSpent").innerText = fmt(total);
  document.getElementById("expThisMonth").innerText  = fmt(thisMonth);
  document.getElementById("expRemaining").innerText  = fmt(remaining);
  document.getElementById("expCount").innerText      = _expenses.length;
  document.getElementById("expBudgetPct").innerText  = pct+"%";
  const bar = document.getElementById("expBudgetBar");
  if (bar) { bar.style.width=pct+"%"; bar.style.background=pct>90?"var(--danger)":pct>70?"var(--warning)":"var(--success)"; }
}

document.getElementById("expenseForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled=true; btn.textContent="Saving...";
  const sel = document.getElementById("expProject");
  const projName = sel?.options[sel.selectedIndex]?.text||"General";
  try {
    await addDoc(userCol("expenses"),{
      description: document.getElementById("expDesc").value.trim(),
      amount:      parseFloat(document.getElementById("expAmount").value)||0,
      date:        document.getElementById("expDate").value,
      category:    document.getElementById("expCategory").value,
      project:     sel?.value||"",
      projectName: projName==="Select project..."?"General":projName,
      vendor:      document.getElementById("expVendor").value.trim(),
      payMode:     document.getElementById("expPayMode").value,
      notes:       document.getElementById("expNotes").value.trim(),
      createdAt:   serverTimestamp()
    });
    closeModal("expenseModal"); e.target.reset(); toast("Expense recorded!");
    await loadExpenses();
  } catch(err){ console.error(err); toast("Failed.","error"); }
  finally { btn.disabled=false; btn.textContent="Record Expense"; }
});

window.deleteExpense = async id => {
  if (!confirm("Delete this expense?")) return;
  await deleteDoc(userDoc("expenses",id));
  _expenses = _expenses.filter(e=>e.id!==id);
  toast("Deleted.","error"); renderExpenseRows(); updateExpenseStats();
};

// ═══════════════════════════════════════════════════════
// 9. SITE ISSUES
// ═══════════════════════════════════════════════════════
let _issues = [];

async function initIssues() {
  await ensureProjects();
  populateProjectSelects("issueProject","issueProjectFilter");
  const id = document.getElementById("issueDate");
  if (id && !id.value) id.value = new Date().toISOString().split("T")[0];
  await loadIssues();
  document.getElementById("issueProjectFilter")?.addEventListener("change", renderIssues);
}

async function loadIssues() {
  try {
    const snap = await getDocs(query(userCol("issues"), orderBy("createdAt","desc")));
    _issues = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderIssues();
    updateIssueStats();
  } catch(e){ console.error(e); }
}

function renderIssues() {
  const box = document.getElementById("issueList");
  if (!box) return;
  const pf = document.getElementById("issueProjectFilter")?.value||"";
  const filtered = _issues.filter(i=>{
    const statusOk = _currentIssueFilter==="all" || i.status===_currentIssueFilter;
    const projOk   = !pf || i.projectName===pf||i.project===pf;
    return statusOk && projOk;
  });
  if (!filtered.length) { box.innerHTML=`<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No issues found</div></div>`; return; }
  box.innerHTML = filtered.map(iss=>{
    const sevCls = {high:"sev-high",medium:"sev-medium",low:"sev-low"}[iss.severity]||"sev-low";
    const stsCls = {open:"iss-open","in-progress":"iss-progress",resolved:"iss-resolved"}[iss.status]||"iss-open";
    return `
      <div class="issue-card">
        <div class="issue-severity ${sevCls}"></div>
        <div>
          <div class="issue-title">${iss.title}</div>
          <div class="issue-meta">${iss.project||""} ${iss.reportedDate?`· ${iss.reportedDate}`:""} ${iss.assignedTo?`· Assigned: ${iss.assignedTo}`:""}</div>
          ${iss.description?`<div style="font-size:0.82rem;color:var(--text-2);margin-top:6px;">${iss.description}</div>`:""}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <span class="issue-status-badge ${stsCls}">${iss.status||"open"}</span>
          <div style="display:flex;gap:6px;">
            ${iss.status!=="resolved"?`<button class="btn btn-sm btn-secondary" onclick="resolveIssue('${iss.id}')">Resolve</button>`:""}
            <button class="btn btn-icon btn-danger btn-sm" onclick="deleteIssue('${iss.id}')">${SVG_DELETE}</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function updateIssueStats() {
  document.getElementById("issueOpenCount").innerText     = _issues.filter(i=>i.status==="open").length;
  document.getElementById("issueProgressCount").innerText = _issues.filter(i=>i.status==="in-progress").length;
  document.getElementById("issueResolvedCount").innerText = _issues.filter(i=>i.status==="resolved").length;
  document.getElementById("issueTotalCount").innerText    = _issues.length;
}

window.filterIssues = (f, btn) => {
  document.querySelectorAll("#issues .tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); _currentIssueFilter=f; renderIssues();
};

document.getElementById("issueForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled=true; btn.textContent="Saving...";
  const sel = document.getElementById("issueProject");
  const projName = sel?.options[sel.selectedIndex]?.text||"";
  try {
    await addDoc(userCol("issues"),{
      title:        document.getElementById("issueTitle").value.trim(),
      severity:     document.getElementById("issueSeverity").value,
      project:      sel?.value||"",
      projectName:  projName==="Select project..."?"":projName,
      description:  document.getElementById("issueDesc").value.trim(),
      reportedDate: document.getElementById("issueDate").value,
      assignedTo:   document.getElementById("issueAssigned").value.trim(),
      status:       "open",
      createdAt:    serverTimestamp()
    });
    closeModal("issueModal"); e.target.reset(); toast("Issue reported!");
    await loadIssues();
  } catch(err){ console.error(err); toast("Failed.","error"); }
  finally { btn.disabled=false; btn.textContent="Report Issue"; }
});

window.resolveIssue = async id => {
  await updateDoc(userDoc("issues",id),{status:"resolved"});
  _issues.find(i=>i.id===id)&&(_issues.find(i=>i.id===id).status="resolved");
  toast("Issue resolved!"); renderIssues(); updateIssueStats();
};

window.deleteIssue = async id => {
  if (!confirm("Delete this issue?")) return;
  await deleteDoc(userDoc("issues",id));
  _issues=_issues.filter(i=>i.id!==id); toast("Deleted.","error");
  renderIssues(); updateIssueStats();
};

// ═══════════════════════════════════════════════════════
// 10. DOCUMENTS — WITH REAL FILE UPLOAD TO FIREBASE STORAGE
// ═══════════════════════════════════════════════════════
let _docs = [];

async function initDocuments() {
  await ensureProjects();
  populateProjectSelects("docProject");

  // Build project sidebar
  const sidebar = document.getElementById("docProjectList");
  if (sidebar) {
    let html=`<div class="doc-proj-item active" data-proj="" onclick="filterDocsByProject('',this)"><span class="doc-proj-dot"></span> All Documents</div>`;
    _projects.forEach(p=>{ html+=`<div class="doc-proj-item" data-proj="${p.name}" onclick="filterDocsByProject('${p.name}',this)"><span class="doc-proj-dot"></span>${p.name}</div>`; });
    sidebar.innerHTML=html;
  }
  await loadDocuments();
  setupDocumentUploadZone();
}

async function loadDocuments() {
  try {
    const snap = await getDocs(query(userCol("documents"), orderBy("createdAt","desc")));
    _docs = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderDocGrid();
  } catch(e){ console.error(e); }
}

function renderDocGrid() {
  const grid = document.getElementById("docGrid");
  if (!grid) return;
  const filtered = _docs.filter(d=>{
    const pOk = !_currentDocProj || d.projectName===_currentDocProj||d.project===_currentDocProj;
    const tOk = _currentDocType==="all" || d.type===_currentDocType;
    return pOk && tOk;
  });
  if (!filtered.length) { grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">📂</div><div class="empty-title">No documents yet</div><div class="empty-sub">Upload using the drop zone above.</div></div>`; return; }
  grid.innerHTML = filtered.map(d=>{
    const ext = d.fileName ? d.fileName.split(".").pop().toLowerCase() : (d.url||"").split(".").pop().split("?")[0].toLowerCase();
    const iconClass = ext==="pdf"?"doc-icon-pdf":["jpg","jpeg","png","webp","gif"].includes(ext)?"doc-icon-img":["xls","xlsx","csv"].includes(ext)?"doc-icon-xls":["doc","docx"].includes(ext)?"doc-icon-doc":"doc-icon-misc";
    const icon = ext==="pdf"?"📄":["jpg","jpeg","png"].includes(ext)?"🖼️":["xls","xlsx"].includes(ext)?"📊":["doc","docx"].includes(ext)?"📝":"📎";
    const typeLabel = {bill:"Bill",blueprint:"Blueprint",permit:"Permit",contract:"Contract",other:"Other"}[d.type]||"Doc";
    const sizeLabel = d.fileSize ? `· ${fmtBytes(d.fileSize)}` : "";
    return `
      <div class="doc-card" onclick="openDoc('${d.url}')">
        <div class="doc-icon-wrap ${iconClass}">${icon}</div>
        <div class="doc-name">${d.name}</div>
        <div class="doc-meta">${typeLabel} ${d.projectName?`· ${d.projectName}`:""} ${sizeLabel}</div>
        <div class="doc-meta" style="margin-top:4px;color:var(--text-3);">${d.notes||""}</div>
        <button class="btn btn-icon btn-danger btn-sm" style="margin-top:10px;" onclick="event.stopPropagation();deleteDoc('${d.id}','${d.storagePath||""}')">${SVG_DELETE}</button>
      </div>`;
  }).join("");
}

// ── DOCUMENT UPLOAD ZONE ──────────────────────────────
function setupDocumentUploadZone() {
  const dz = document.getElementById("docDropZone");
  const fi = document.getElementById("docFileInput");
  if (!dz || !fi || dz.dataset.bound) return;
  dz.dataset.bound = "1";

  dz.addEventListener("dragover", e=>{ e.preventDefault(); dz.classList.add("dragging"); });
  dz.addEventListener("dragleave", ()=>dz.classList.remove("dragging"));
  dz.addEventListener("drop", e=>{ e.preventDefault(); dz.classList.remove("dragging"); startUploadFlow(e.dataTransfer.files); });
  fi.addEventListener("change", ()=>{ startUploadFlow(fi.files); fi.value=""; });
}

// ── UPLOAD FLOW: open quick-tag modal, then upload ────
function startUploadFlow(files) {
  if (!files || !files.length) return;
  const file = files[0]; // upload one at a time; loop for multi

  // Pre-fill modal
  document.getElementById("docName").value  = file.name.replace(/\.[^/.]+$/,"");
  document.getElementById("docUrl").value   = ""; // will be filled after upload

  // Show upload-mode modal (hide URL field, show file info)
  showUploadModal(file);
}

function showUploadModal(file) {
  const urlGroup = document.getElementById("docUrlGroup");
  const fileInfo = document.getElementById("docFileInfo");
  const fileInfoText = document.getElementById("docFileInfoText");

  if (urlGroup)   urlGroup.style.display = "none";
  if (fileInfo)   fileInfo.style.display = "flex";
  if (fileInfoText) fileInfoText.textContent = `${file.name} (${fmtBytes(file.size)})`;

  // Store pending file on the form element
  document.getElementById("docForm")._pendingFile = file;

  openModal("docModal");
}

function resetDocModal() {
  const urlGroup = document.getElementById("docUrlGroup");
  const fileInfo = document.getElementById("docFileInfo");
  if (urlGroup) urlGroup.style.display = "";
  if (fileInfo) fileInfo.style.display = "none";
  if (document.getElementById("docForm")) {
    document.getElementById("docForm")._pendingFile = null;
  }
}

// ── SUBMIT: upload file OR save link ─────────────────
document.getElementById("docForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const sel = document.getElementById("docProject");
  const projName = sel?.options[sel.selectedIndex]?.text||"General";
  const pendingFile = e.target._pendingFile;

  btn.disabled = true;
  btn.textContent = pendingFile ? "Uploading..." : "Saving...";

  try {
    let downloadURL = "";
    let storagePath = "";
    let fileSize    = 0;
    let fileName    = "";

    if (pendingFile) {
      // ── UPLOAD TO FIREBASE STORAGE ──
      if (!_currentUser) throw new Error("Not logged in.");

      const safeFileName = `${Date.now()}_${pendingFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      storagePath = `users/${_uid}/documents/${safeFileName}`;
      const sRef = storageRef(storage, storagePath);

      // Show progress
      btn.textContent = "0%";
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(sRef, pendingFile, {
          contentType: pendingFile.type || "application/octet-stream"
        });
        task.on("state_changed",
          snap => {
            const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
            btn.textContent = `${pct}%`;
          },
          reject,
          async () => {
            downloadURL = await getDownloadURL(task.snapshot.ref);
            resolve();
          }
        );
      });

      fileSize = pendingFile.size;
      fileName = pendingFile.name;
    } else {
      // Link mode (URL entered manually)
      downloadURL = document.getElementById("docUrl").value.trim();
      if (!downloadURL) throw new Error("Please enter a URL.");
    }

    await addDoc(userCol("documents"),{
      name:        document.getElementById("docName").value.trim(),
      type:        document.getElementById("docType").value,
      project:     sel?.value||"",
      projectName: projName==="Select project..."?"General":projName,
      url:         downloadURL,
      storagePath,
      fileSize,
      fileName,
      notes:       document.getElementById("docNotes").value.trim(),
      createdAt:   serverTimestamp()
    });

    closeModal("docModal");
    resetDocModal();
    e.target.reset();
    toast("Document saved! ✅");
    await loadDocuments();
  } catch(err){
    console.error(err);
    toast("Upload failed: " + (err.message||"unknown error"), "error");
  } finally {
    btn.disabled=false;
    btn.textContent="Save Document";
    e.target._pendingFile = null;
  }
});

// ── CLOSE modal → reset ───────────────────────────────
window.closeModal = id => {
  document.getElementById(id).style.display = "none";
  if (id === "docModal") resetDocModal();
};

window.filterDocsByProject = (proj, el) => {
  document.querySelectorAll(".doc-proj-item").forEach(e=>e.classList.remove("active"));
  el?.classList.add("active"); _currentDocProj=proj; renderDocGrid();
};
window.filterDocsByType = (type, btn) => {
  document.querySelectorAll("#documents .tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); _currentDocType=type; renderDocGrid();
};
window.openDoc = url => { if(url) window.open(url,"_blank"); };

window.deleteDoc = async (id, path) => {
  if (!confirm("Remove this document? This cannot be undone.")) return;
  try {
    // Delete from Storage if we have the path
    if (path) {
      const sRef = storageRef(storage, path);
      await deleteObject(sRef).catch(()=>{}); // ignore if already gone
    }
    await deleteDoc(userDoc("documents",id));
    _docs=_docs.filter(d=>d.id!==id);
    toast("Document removed.","error");
    renderDocGrid();
  } catch(err){ console.error(err); toast("Delete failed.","error"); }
};

// ── Manual URL Modal (+ Upload Document button) ───────
window.openDocModal = () => {
  resetDocModal();
  const urlGroup = document.getElementById("docUrlGroup");
  if (urlGroup) urlGroup.style.display = "";
  openModal("docModal");
};

// ═══════════════════════════════════════════════════════
// 11. REPORTS
// ═══════════════════════════════════════════════════════
async function initReports() {
  await ensureProjects();
  const sel = document.getElementById("reportProjectSelect");
  if (sel) { sel.innerHTML=`<option value="">All Projects</option>`; _projects.forEach(p=>sel.innerHTML+=`<option value="${p.name}">${p.name}</option>`); }
  loadReports("");
}

window.loadReports = async (projFilter="") => {
  try {
    const expSnap = await getDocs(query(userCol("expenses"), ...(projFilter?[where("projectName","==",projFilter)]:[])));
    const exps = expSnap.docs.map(d=>d.data());
    const totalExp = exps.reduce((s,e)=>s+(e.amount||0),0);
    document.getElementById("rptExpense").innerText = fmt(totalExp);

    const d30 = new Date(); d30.setDate(d30.getDate()-30);
    const attSnap = await getDocs(query(userCol("attendance"), where("date",">=",d30.toISOString().split("T")[0])));
    const attRecords = attSnap.docs.map(d=>d.data());
    const pct = attRecords.length ? Math.round(attRecords.filter(a=>a.status==="present").length/attRecords.length*100) : 0;
    document.getElementById("rptAttRate").innerText = pct+"%";

    const logSnap = await getDocs(userCol("daily_logs"));
    document.getElementById("rptLogs").innerText = logSnap.size;

    const issueSnap = await getDocs(query(userCol("issues"), where("status","==","open")));
    document.getElementById("rptIssues").innerText = issueSnap.size;

    const labs = await ensureLabourers();
    const workerAtt = {};
    attRecords.forEach(a=>{ if(!workerAtt[a.labourerId]) workerAtt[a.labourerId]={present:0,total:0}; workerAtt[a.labourerId].total++; if(a.status==="present") workerAtt[a.labourerId].present++; });
    const wl = document.getElementById("rptWorkerList");
    if (wl) {
      const sorted = labs.sort((a,b)=>{
        const pa = workerAtt[a.id]?.present||0, pb=workerAtt[b.id]?.present||0;
        return pb-pa;
      }).slice(0,8);
      wl.innerHTML = sorted.map(w=>{
        const rec = workerAtt[w.id]||{present:0,total:1};
        const p = rec.total ? Math.round(rec.present/rec.total*100) : 0;
        return `<div class="worker-row"><div class="worker-avatar-sm">${w.name[0]}</div><div><div class="worker-row-name">${w.name}</div><div class="worker-row-sub">${w.role||"Worker"}</div></div><div class="attendance-pct ${p>=80?"pct-high":p>=60?"pct-medium":"pct-low"}">${p}%</div></div>`;
      }).join("") || `<div class="empty-state"><div class="empty-sub">No attendance data yet.</div></div>`;
    }

    const catTotals = {};
    exps.forEach(e=>{ catTotals[e.category]=(catTotals[e.category]||0)+(e.amount||0); });
    const el = document.getElementById("rptExpCategoryList");
    if (el) {
      const sorted = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
      const max = sorted[0]?.[1]||1;
      el.innerHTML = sorted.map(([cat,amt])=>`
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:5px;"><span>${ICONS[cat]||"📎"} ${cat}</span><strong style="color:var(--gold);">${fmt(amt)}</strong></div>
          <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.round(amt/max*100)}%;background:var(--gold);"></div></div>
        </div>`).join("") || `<div class="empty-state"><div class="empty-sub">No expense data.</div></div>`;
    }

    const issAll = await getDocs(query(userCol("issues"), orderBy("createdAt","desc"), limit(5)));
    const il = document.getElementById("rptIssueList");
    if (il) {
      if (issAll.empty) { il.innerHTML=`<div class="empty-state"><div class="empty-sub">No issues logged.</div></div>`; }
      else {
        il.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">`;
        issAll.forEach(d=>{ const i=d.data(); il.innerHTML+=`<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">${i.title}</span><span class="pill ${i.status==="resolved"?"pill-green":i.status==="in-progress"?"pill-gold":"pill-red"}">${i.status||"open"}</span></div>`; });
        il.innerHTML+="</div>";
      }
    }
  } catch(e){ console.error(e); }
};

// ═══════════════════════════════════════════════════════
// 12. LOGOUT
// ═══════════════════════════════════════════════════════
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if (!confirm("Logout of BuildTrack?")) return;
  // Clear all cached data before logout so next user starts clean
  _projects  = [];
  _labourers = [];
  _uid       = null;
  _currentUser = null;
  await signOut(auth);
  window.location.href = "index.html";
});

// ═══════════════════════════════════════════════════════
// 13. PWA — Install Popup (beautiful modal)
// ═══════════════════════════════════════════════════════
let _deferredInstallPrompt = null;

const _isIOS    = /iphone|ipad|ipod/i.test(navigator.userAgent);
const _isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const _isInstalled = window.matchMedia('(display-mode: standalone)').matches
                  || window.navigator.standalone === true;

// Dismissed this session? Don't nag again
let _installDismissed = sessionStorage.getItem('bt_install_dismissed') === '1';

function openInstallPopup() {
  if (_isInstalled || _installDismissed) return;
  const popup = document.getElementById('installPopup');
  if (!popup) return;

  // Show correct CTA based on platform
  if (_deferredInstallPrompt) {
    document.getElementById('installPopupBtn').style.display = 'flex';
  } else if (_isIOS && _isSafari) {
    document.getElementById('installIosGuide').style.display = 'block';
  } else {
    document.getElementById('installOtherGuide').style.display = 'block';
  }

  popup.style.display = 'flex';
  requestAnimationFrame(() => popup.classList.add('visible'));
}

function closeInstallPopup() {
  const popup = document.getElementById('installPopup');
  if (!popup) return;
  popup.classList.remove('visible');
  setTimeout(() => { popup.style.display = 'none'; }, 280);
  _installDismissed = true;
  sessionStorage.setItem('bt_install_dismissed', '1');
}

// Chrome/Edge/Android — capture native prompt
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // Show popup after 8 seconds (let user settle in first)
  if (!_isInstalled && !_installDismissed) {
    setTimeout(openInstallPopup, 8000);
  }
});

// iOS Safari — show popup after 12 seconds
if (_isIOS && _isSafari && !_isInstalled && !_installDismissed) {
  setTimeout(openInstallPopup, 12000);
}

// Wire up popup buttons after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('installPopupBtn')?.addEventListener('click', async () => {
    if (!_deferredInstallPrompt) return;
    _deferredInstallPrompt.prompt();
    const { outcome } = await _deferredInstallPrompt.userChoice;
    _deferredInstallPrompt = null;
    closeInstallPopup();
    if (outcome === 'accepted') toast('BuildTrack installed! 🎉', 'success');
  });

  document.getElementById('installPopupClose')?.addEventListener('click', closeInstallPopup);
  document.getElementById('installPopupLater')?.addEventListener('click', closeInstallPopup);

  // Click outside to dismiss
  document.getElementById('installPopup')?.addEventListener('click', function(e) {
    if (e.target === this) closeInstallPopup();
  });
});

// Keep old installApp global for any legacy calls
window.installApp = async () => {
  if (_deferredInstallPrompt) {
    _deferredInstallPrompt.prompt();
    const { outcome } = await _deferredInstallPrompt.userChoice;
    _deferredInstallPrompt = null;
    if (outcome === 'accepted') toast('BuildTrack installed! 🎉', 'success');
  }
};

window.dismissInstallBanner = closeInstallPopup;

// Hide popup once installed
window.addEventListener('appinstalled', () => {
  closeInstallPopup();
  toast('BuildTrack installed! Find it on your home screen 🎉', 'success');
});

// ── Register Service Worker ────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(reg => console.log("[SW] Registered:", reg.scope))
      .catch(err => console.warn("[SW] Registration failed:", err));
  });
}

// ═══════════════════════════════════════════════════════
// 14. INIT — moved into requireAuth above to prevent
// _uid being null when Firestore is first queried.
// ═══════════════════════════════════════════════════════
