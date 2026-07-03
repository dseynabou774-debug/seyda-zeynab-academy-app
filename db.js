// =============================================================================
// db.js — Couche de persistance locale (IndexedDB)
//
// Stores :
//   student    { id: "current", fullName, ageGroup, createdAt }
//   progress   { levelId (key), completed, percent, stars, updatedAt }
//   badges     { id (key), unlockedAt }
//   diplomas   { id (key, uuid), levelId, levelTitle, lang, studentName,
//                certNumber, issuedAt, pdfDataUrl }
//   recordings { id (key, `${levelId}:${letterId}`), blob, createdAt }
//   settings   { id: "app" (key), language, theme }
//
// Cette base est volontairement mono-élève pour l'instant (un profil actif
// par téléphone), ce qui correspond à l'usage attendu (élève + son propre
// appareil). Le passage multi-élèves (utile pour l'espace enseignant) peut
// se faire plus tard en ajoutant un studentId aux clés composées ci-dessus,
// sans casser le schéma.
// =============================================================================

const DB_NAME = "seyda_zeynab_academy";
const DB_VERSION = 1;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("student")) db.createObjectStore("student", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "levelId" });
      if (!db.objectStoreNames.contains("badges")) db.createObjectStore("badges", { keyPath: "id" });
      if (!db.objectStoreNames.contains("diplomas")) db.createObjectStore("diplomas", { keyPath: "id" });
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const idbGet = (store, key) =>
  tx(store).then((s) => new Promise((res, rej) => {
    const r = s.get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  }));

const idbGetAll = (store) =>
  tx(store).then((s) => new Promise((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  }));

const idbPut = (store, value) =>
  tx(store, "readwrite").then((s) => new Promise((res, rej) => {
    const r = s.put(value);
    r.onsuccess = () => res(value);
    r.onerror = () => rej(r.error);
  }));

const idbDelete = (store, key) =>
  tx(store, "readwrite").then((s) => new Promise((res, rej) => {
    const r = s.delete(key);
    r.onsuccess = () => res(true);
    r.onerror = () => rej(r.error);
  }));

const DB = {
  // --- student ---
  getStudent: () => idbGet("student", "current"),
  saveStudent: (fullName, ageGroup) =>
    idbPut("student", { id: "current", fullName, ageGroup, createdAt: Date.now() }),

  // --- progress ---
  getAllProgress: () => idbGetAll("progress"),
  getProgress: (levelId) => idbGet("progress", levelId),
  saveProgress: (levelId, data) =>
    idbPut("progress", { levelId, updatedAt: Date.now(), ...data }),

  // --- badges ---
  getAllBadges: () => idbGetAll("badges"),
  unlockBadge: (id) => idbPut("badges", { id, unlockedAt: Date.now() }),

  // --- diplomas ---
  getAllDiplomas: () => idbGetAll("diplomas"),
  saveDiploma: (diploma) => idbPut("diplomas", diploma),

  // --- recordings ---
  saveRecording: (id, blob) => idbPut("recordings", { id, blob, createdAt: Date.now() }),
  getRecording: (id) => idbGet("recordings", id),

  // --- settings ---
  getSettings: () => idbGet("settings", "app"),
  saveSettings: (settings) => idbPut("settings", { id: "app", ...settings }),

  // --- backup / restore (export complet, hors gros blobs audio enregistrés) ---
  async exportAll() {
    const [student, progress, badges, diplomas, settings] = await Promise.all([
      DB.getStudent(), DB.getAllProgress(), DB.getAllBadges(), DB.getAllDiplomas(), DB.getSettings(),
    ]);
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), student, progress, badges, diplomas, settings };
  },
  async importAll(data) {
    if (data.student) await idbPut("student", data.student);
    if (Array.isArray(data.progress)) for (const p of data.progress) await idbPut("progress", p);
    if (Array.isArray(data.badges)) for (const b of data.badges) await idbPut("badges", b);
    if (Array.isArray(data.diplomas)) for (const d of data.diplomas) await idbPut("diplomas", d);
    if (data.settings) await idbPut("settings", data.settings);
  },
};
