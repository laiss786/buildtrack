// js/offline-sync.js — BuildTrack Offline Mode with Auto-Sync
// ─────────────────────────────────────────────────────────────
// Stores pending writes in IndexedDB when offline.
// Auto-syncs to Firestore when connection is restored.
// Works for: attendance, material_usage, daily_logs (site progress notes)
// ─────────────────────────────────────────────────────────────

const OFFLINE_DB_NAME  = "buildtrack_offline";
const OFFLINE_DB_VER   = 1;
const PENDING_STORE    = "pending_writes";

let _offlineDB   = null;
let _isOnline    = navigator.onLine;
let _syncInProgress = false;

// ── IndexedDB Setup ──────────────────────────────────────────
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (_offlineDB) return resolve(_offlineDB);
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        const store = db.createObjectStore(PENDING_STORE, {
          keyPath: "localId",
          autoIncrement: true
        });
        store.createIndex("collection", "collection", { unique: false });
        store.createIndex("syncedAt",   "syncedAt",   { unique: false });
      }
    };
    req.onsuccess = e => { _offlineDB = e.target.result; resolve(_offlineDB); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Queue a pending write ─────────────────────────────────────
export async function queueOfflineWrite(collection, data, docId = null) {
  const db    = await openOfflineDB();
  const entry = {
    collection,
    data:      { ...data, _offlinePending: true },
    docId,            // null = addDoc, string = setDoc/updateDoc
    createdAt: new Date().toISOString(),
    syncedAt:  null
  };
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(PENDING_STORE, "readwrite");
    const store = tx.objectStore(PENDING_STORE);
    const req   = store.add(entry);
    req.onsuccess = () => resolve(req.result);   // returns localId
    req.onerror   = () => reject(req.error);
  });
}

// ── Get all un-synced writes ─────────────────────────────────
export async function getPendingWrites() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(PENDING_STORE, "readonly");
    const store = tx.objectStore(PENDING_STORE);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result.filter(r => !r.syncedAt));
    req.onerror   = () => reject(req.error);
  });
}

// ── Mark a pending write as synced ───────────────────────────
async function markSynced(localId) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(PENDING_STORE, "readwrite");
    const store = tx.objectStore(PENDING_STORE);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve();
      record.syncedAt = new Date().toISOString();
      store.put(record).onsuccess = resolve;
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ── Sync all pending writes to Firestore ─────────────────────
export async function syncPendingWrites(db, uid) {
  if (_syncInProgress || !_isOnline || !uid) return { synced: 0, failed: 0 };
  _syncInProgress = true;

  const pending = await getPendingWrites();
  if (!pending.length) { _syncInProgress = false; return { synced: 0, failed: 0 }; }

  // Import Firestore functions dynamically to avoid circular imports
  const { collection, addDoc, setDoc, doc, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

  let synced = 0, failed = 0;

  for (const entry of pending) {
    try {
      const colRef = collection(db, "users", uid, entry.collection);
      const payload = { ...entry.data };
      // Replace offline placeholders
      delete payload._offlinePending;
      payload.createdAt = serverTimestamp();

      if (entry.docId) {
        await setDoc(doc(db, "users", uid, entry.collection, entry.docId), payload, { merge: true });
      } else {
        await addDoc(colRef, payload);
      }

      await markSynced(entry.localId);
      synced++;
    } catch (err) {
      console.warn("[OfflineSync] Failed to sync entry:", entry.localId, err);
      failed++;
    }
  }

  _syncInProgress = false;
  return { synced, failed };
}

// ── Online / Offline Detection ────────────────────────────────
export function initOfflineSync(firestoreDB, uid, onStatusChange) {
  const updateStatus = (online) => {
    _isOnline = online;
    onStatusChange?.(online);
    updateOfflineBanner(online);

    if (online) {
      // Attempt sync after brief delay (let connection stabilise)
      setTimeout(() => {
        syncPendingWrites(firestoreDB, uid).then(({ synced, failed }) => {
          if (synced > 0) {
            showSyncToast(synced, failed);
          }
        });
      }, 1500);
    }
  };

  window.addEventListener("online",  () => updateStatus(true));
  window.addEventListener("offline", () => updateStatus(false));
  updateStatus(navigator.onLine);
}

// ── UI: Offline Banner ────────────────────────────────────────
function updateOfflineBanner(isOnline) {
  let banner = document.getElementById("offlineBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "offlineBanner";
    banner.innerHTML = `
      <span class="offline-dot"></span>
      <span id="offlineBannerText">You're offline — changes are saved locally and will sync automatically.</span>
      <span id="offlinePendingBadge" class="offline-pending-badge" style="display:none;"></span>
    `;
    document.body.prepend(banner);

    // Inject styles once
    if (!document.getElementById("offlineBannerStyles")) {
      const style = document.createElement("style");
      style.id = "offlineBannerStyles";
      style.textContent = `
        #offlineBanner {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 10px 20px;
          background: #1a1200;
          border-bottom: 1px solid rgba(245,166,35,0.4);
          color: #F5A623;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.82rem;
          font-weight: 500;
          transform: translateY(-100%);
          transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
          pointer-events: none;
        }
        #offlineBanner.visible { transform: translateY(0); }
        .offline-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #F5A623;
          animation: offlinePulse 1.5s ease-in-out infinite;
          flex-shrink: 0;
        }
        .offline-pending-badge {
          background: rgba(245,166,35,0.15);
          border: 1px solid rgba(245,166,35,0.35);
          border-radius: 100px;
          padding: 2px 10px;
          font-size: 0.75rem;
          font-weight: 700;
        }
        @keyframes offlinePulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(0.7); }
        }
        #syncToast {
          position: fixed;
          bottom: 24px; left: 50%;
          transform: translateX(-50%) translateY(20px);
          background: #0D2B1B;
          border: 1px solid rgba(0,196,140,0.35);
          color: #00C48C;
          padding: 12px 22px;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          z-index: 99999;
          opacity: 0;
          transition: all 0.3s ease;
          pointer-events: none;
          white-space: nowrap;
        }
        #syncToast.visible { opacity:1; transform:translateX(-50%) translateY(0); }
      `;
      document.head.appendChild(style);
    }
  }

  if (isOnline) {
    banner.classList.remove("visible");
  } else {
    banner.classList.add("visible");
  }
}

// ── Update pending count badge ────────────────────────────────
export async function refreshPendingBadge() {
  const pending = await getPendingWrites();
  const badge   = document.getElementById("offlinePendingBadge");
  if (!badge) return;
  if (pending.length) {
    badge.textContent = `${pending.length} pending`;
    badge.style.display = "inline";
  } else {
    badge.style.display = "none";
  }
}

// ── Sync success toast ────────────────────────────────────────
function showSyncToast(synced, failed) {
  let toast = document.getElementById("syncToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "syncToast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `✓ ${synced} offline change${synced>1?"s":""} synced to cloud` +
    (failed ? ` · ${failed} failed` : "");
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 3500);
}

// ── Check if currently online ─────────────────────────────────
export function isOnline() { return _isOnline; }

// ── Smart write: if online → Firestore directly; if offline → queue ──
export async function smartAddDoc(colRef, data, firestoreAddDoc, collectionName, queueCb) {
  if (_isOnline) {
    return firestoreAddDoc(colRef, data);
  } else {
    const localId = await queueOfflineWrite(collectionName, data);
    await refreshPendingBadge();
    queueCb?.({ localId, ...data });
    return { id: `offline_${localId}` };
  }
}
