# BuildTrack — Setup Guide
## What's New in This Update

### ✅ 1. Real File Uploads (Documents Section)
Files are now uploaded directly from your device to **Firebase Storage** (cloud), not just links.

### ✅ 2. PWA — Installable as an App
Users can now install BuildTrack to their phone/desktop like a native app.

---

## 🔧 Step 1: Enable Firebase Storage

Your Firebase project already exists (`buildtrack001`). You just need to enable Storage:

1. Go to → https://console.firebase.google.com/project/buildtrack001/storage
2. Click **"Get Started"**
3. Choose **"Start in test mode"** (or production mode — see security rules below)
4. Select your region (e.g. `asia-south1` for India) → Done

### Firebase Storage Security Rules (paste these in the Rules tab):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /documents/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
This ensures each user can only access their own uploaded files.

---

## 🗂️ Step 2: Replace Your Files

Copy these updated files into your project:

| New File | Replaces / New |
|---|---|
| `dashboard.html` | Replaces existing (PWA tags + new doc UI) |
| `dashboard.js` | Replaces existing (file upload + PWA install) |
| `firebase.js` | Replaces existing (adds Storage export) |
| `manifest.json` | **NEW** — put in root folder |
| `service-worker.js` | **NEW** — put in root folder |

Your folder structure should look like:
```
/
├── index.html
├── login.html
├── register.html
├── dashboard.html       ← updated
├── manifest.json        ← NEW
├── service-worker.js    ← NEW
├── icons/
│   ├── icon-72.png      ← NEW (see below)
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   └── icon-512.png
├── css/
│   ├── style.css
│   └── dashboard.css
└── js/
    ├── firebase.js      ← updated
    ├── auth.js
    ├── auth-guard.js
    └── dashboard.js     ← updated
```

---

## 🖼️ Step 3: Create App Icons

**Option A (Easiest — Recommended):**
1. Go to https://maskable.app/editor
2. Upload your logo or create one with the "BT" text on gold background
3. Download all sizes

**Option B:**
1. Go to https://realfavicongenerator.net
2. Upload a 512×512 PNG of your logo
3. Download the package — it includes all icon sizes

**Option C (if you have Node.js):**
```bash
npm install canvas
node generate-icons.js
```

---

## 📲 Step 4: How Users Install the App

### On Android (Chrome):
- Open the site in Chrome
- Tap the 3-dot menu → "Add to Home screen"
- OR wait for the install banner that appears automatically

### On iPhone (Safari):
- Open the site in Safari
- Tap the Share button (box with arrow)
- Scroll down → "Add to Home Screen"
- Tap "Add"

### On Desktop (Chrome/Edge):
- Look for the install icon (⊕) in the browser address bar
- Click it → "Install"
- OR the install banner will appear

---

## 📁 How File Upload Now Works

1. User goes to **Documents** section
2. Clicks drop zone OR drags a file
3. A modal pops up — tag it with name, type, project
4. Click **Save Document** → file uploads to Firebase Storage
5. Progress shows as percentage on the button (e.g. "47%")
6. Done! File is accessible from any device when logged in

**Supported file types:** PDF, JPG, PNG, DOC, DOCX, XLS, XLSX, TXT, ZIP

**Storage limits:** Firebase free tier = **5 GB** storage, **1 GB/day** downloads

---

## ⚙️ Hosting Options

For the PWA to work fully (service worker, install prompt), you need **HTTPS hosting**:

| Option | Cost | Ease |
|---|---|---|
| **Firebase Hosting** | Free | ⭐⭐⭐⭐⭐ Best — already using Firebase |
| Netlify | Free | ⭐⭐⭐⭐ |
| Vercel | Free | ⭐⭐⭐⭐ |

### Deploy to Firebase Hosting (recommended):
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Set public directory to your project folder
firebase deploy
```

---

## ❓ FAQ

**Q: Does it work offline?**
A: The app shell (UI) works offline. Firebase data requires internet. You'll see cached screens when offline.

**Q: Is localStorage used?**
A: No. All data is in Firestore and Storage, so it works across devices.

**Q: Can multiple users use the same account?**
A: Yes — Firebase Auth supports this. Each user's documents are stored under their own UID.

**Q: How do I update the app after installing?**
A: Users get updates automatically when you deploy new code. The service worker handles this.
