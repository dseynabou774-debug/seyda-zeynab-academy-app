// =============================================================================
// db.js — Couche de persistance locale (IndexedDB), MULTI-ÉLÈVES
//
// Un même téléphone peut maintenant héberger plusieurs profils élèves
// (utile pour une enseignante qui suit plusieurs élèves à des niveaux
// différents depuis son propre appareil). Chaque profil a sa propre
// progression, ses propres badges, diplômes et enregistrements vocaux.
//
// Stores :
//   students   { id (uuid), fullName, ageGroup, createdAt }
//   progress   { key: `${studentId}::${levelId}`, studentId, levelId,
//                completed, percent, stars, updatedAt }
//   badges     { key: `${studentId}::${badgeId}`, studentId, id, unlockedAt }
//   diplomas   { id (certNumber, unique), studentId, levelId, levelTitle,
//                lang, studentName, certNumber, issuedAt, pdfDataUrl }
//   recordings { key: `${studentId}::${levelId}:${letterId}`, studentId,
//                blob, createdAt }
//   settings   { id: "app", language, theme, activeStudentId }
//
// Migration automatique : si l'app a été utilisée en version mono-élève
// (le tout premier profil "Soumara" par ex.), sa progression/ses
// badges/diplômes sont automatiquement rattachés à un profil sous l'id
// "current" lors de la mise à jour, sans perte de données.
// =============================================================================

const DB_NAME = "seyda_zeynab_academy";
const DB_VERSION = 2;
let _dbPromise = null;

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;
      const oldVersion = e.oldVersion;

      const finishFreshSchema = () => {
        if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
        if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "key" });
        if (!db.objectStoreNames.contains("badges")) db.createObjectStore("badges", { keyPath: "key" });
        if (!db.objectStoreNames.contains("diplomas")) db.createObjectStore("diplomas", { keyPath: "id" });
        if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "key" });
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      };

      if (oldVersion < 1) {
        finishFreshSchema();
        return;
      }

      if (oldVersion === 1) {
        // Migration depuis la version mono-élève : on lit les anciennes
        // données (stores "student" singulier, "progress"/"badges"/
        // "recordings" sans studentId) AVANT de les supprimer, puis on
        // les réécrit sous un studentId fixe "current".
        const LEGACY_STUDENT_ID = "current";
        const legacy = { student: null, progress: [], badges: [], diplomas: [], recordings: [] };

        const readAll = (storeName) => new Promise((res) => {
          if (!db.objectStoreNames.contains(storeName)) return res([]);
          const store = tx.objectStore(storeName);
          const r = store.getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });

        Promise.all([
          readAll("student"),
          readAll("progress"),
          readAll("badges"),
          readAll("diplomas"),
          readAll("recordings"),
        ]).then(([students, progress, badges, diplomas, recordings]) => {
          legacy.student = students.find((s) => s.id === "current") || null;
          legacy.progress = progress;
          legacy.badges = badges;
          legacy.diplomas = diplomas;
          legacy.recordings = recordings;

          ["student", "progress", "badges", "recordings"].forEach((name) => {
            if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
          });
          if (db.objectStoreNames.contains("diplomas")) db.deleteObjectStore("diplomas");

          finishFreshSchema();

          if (legacy.student) {
            tx.objectStore("students").put({
              id: LEGACY_STUDENT_ID,
              fullName: legacy.student.fullName,
              ageGroup: legacy.student.ageGroup,
              createdAt: legacy.student.createdAt || Date.now(),
            });
          }
          legacy.progress.forEach((p) => {
            tx.objectStore("progress").put({
              key: `${LEGACY_STUDENT_ID}::${p.levelId}`,
              studentId: LEGACY_STUDENT_ID,
              levelId: p.levelId,
              completed: p.completed,
              percent: p.percent,
              stars: p.stars,
              updatedAt: p.updatedAt,
            });
          });
          legacy.badges.forEach((b) => {
            tx.objectStore("badges").put({
              key: `${LEGACY_STUDENT_ID}::${b.id}`,
              studentId: LEGACY_STUDENT_ID,
              id: b.id,
              unlockedAt: b.unlockedAt,
            });
          });
          legacy.diplomas.forEach((d) => {
            tx.objectStore("diplomas").put({ ...d, studentId: LEGACY_STUDENT_ID });
          });
          legacy.recordings.forEach((r) => {
            tx.objectStore("recordings").put({
              key: `${LEGACY_STUDENT_ID}::${r.id}`,
              studentId: LEGACY_STUDENT_ID,
              blob: r.blob,
              createdAt: r.createdAt,
            });
          });

          // On marque ce profil comme actif pour ne pas perdre le fil.
          const settingsStore = tx.objectStore("settings");
          const sReq = settingsStore.get("app");
          sReq.onsuccess = () => {
            const existing = sReq.result || { id: "app" };
            settingsStore.put({ ...existing, activeStudentId: LEGACY_STUDENT_ID });
          };
        });
        return;
      }

      // oldVersion >= 2 : rien à faire, schéma déjà à jour.
      finishFreshSchema();
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
  // --- students (profils) ---
  getAllStudents: () => idbGetAll("students"),
  getStudentById: (id) => idbGet("students", id),
  createStudent: (fullName, ageGroup) => {
    const student = { id: newId("student"), fullName, ageGroup, createdAt: Date.now() };
    return idbPut("students", student);
  },
  updateStudent: (id, fullName, ageGroup) =>
    idbPut("students", { id, fullName, ageGroup, createdAt: Date.now() }),
  deleteStudent: (id) => idbDelete("students", id),

  // --- progress (par élève) ---
  getAllProgress: (studentId) =>
    idbGetAll("progress").then((rows) => rows.filter((r) => r.studentId === studentId)),
  saveProgress: (studentId, levelId, data) =>
    idbPut("progress", { key: `${studentId}::${levelId}`, studentId, levelId, updatedAt: Date.now(), ...data }),

  // --- badges (par élève) ---
  getAllBadges: (studentId) =>
    idbGetAll("badges").then((rows) => rows.filter((r) => r.studentId === studentId)),
  unlockBadge: (studentId, id) =>
    idbPut("badges", { key: `${studentId}::${id}`, studentId, id, unlockedAt: Date.now() }),

  // --- diplomas (par élève) ---
  getAllDiplomas: (studentId) =>
    idbGetAll("diplomas").then((rows) => rows.filter((r) => r.studentId === studentId)),
  saveDiploma: (diploma) => idbPut("diplomas", diploma),

  // --- recordings (par élève) ---
  saveRecording: (studentId, id, blob) =>
    idbPut("recordings", { key: `${studentId}::${id}`, studentId, blob, createdAt: Date.now() }),
  getRecording: (studentId, id) => idbGet("recordings", `${studentId}::${id}`),

  // --- settings globaux (langue, thème, profil actif) ---
  getSettings: () => idbGet("settings", "app"),
  saveSettings: (settings) => idbPut("settings", { id: "app", ...settings }),

  // --- sauvegarde / restauration complète (tous les profils) ---
  async exportAll() {
    const [students, progress, badges, diplomas, settings] = await Promise.all([
      DB.getAllStudents(),
      idbGetAll("progress"),
      idbGetAll("badges"),
      idbGetAll("diplomas"),
      DB.getSettings(),
    ]);
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), students, progress, badges, diplomas, settings };
  },
  async importAll(data) {
    if (Array.isArray(data.students)) for (const s of data.students) await idbPut("students", s);
    if (Array.isArray(data.progress)) for (const p of data.progress) await idbPut("progress", p);
    if (Array.isArray(data.badges)) for (const b of data.badges) await idbPut("badges", b);
    if (Array.isArray(data.diplomas)) for (const d of data.diplomas) await idbPut("diplomas", d);
    if (data.settings) await idbPut("settings", data.settings);
  },
};
