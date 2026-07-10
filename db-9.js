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
const DB_VERSION = 8;
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
        if (!db.objectStoreNames.contains("memorization")) db.createObjectStore("memorization", { keyPath: "key" });
        if (!db.objectStoreNames.contains("billing")) db.createObjectStore("billing", { keyPath: "studentId" });
        if (!db.objectStoreNames.contains("families")) db.createObjectStore("families", { keyPath: "id" });
        if (!db.objectStoreNames.contains("registrations")) db.createObjectStore("registrations", { keyPath: "id" });
        if (!db.objectStoreNames.contains("schedule")) db.createObjectStore("schedule", { keyPath: "id" });
        if (!db.objectStoreNames.contains("courseLogs")) db.createObjectStore("courseLogs", { keyPath: "id" });
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

      // oldVersion === 2 : passage au modèle "séances multi-matières".
      // La progression détaillée par ancien niveau (1 = lettres, 2 =
      // prononciation) ne correspond plus au nouveau schéma (progression
      // par séance + matière) ; on repart avec des stores progress/badges
      // vides pour éviter toute donnée incohérente. Les profils élèves,
      // diplômes déjà obtenus et réglages sont conservés intacts.
      if (oldVersion === 2) {
        ["progress", "badges"].forEach((name) => {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        });
        finishFreshSchema();
        return;
      }

      // oldVersion === 3 : ajout du parcours de mémorisation (Ajza'),
      // totalement nouveau — aucune donnée à migrer, juste le nouveau
      // store à créer.
      if (oldVersion === 3) {
        finishFreshSchema();
        return;
      }

      // oldVersion === 4 : ajout du module paiement (facturation, familles),
      // fusionné depuis l'application de paiement existante — nouveau,
      // rien à migrer.
      if (oldVersion === 4) {
        finishFreshSchema();
        return;
      }

      // oldVersion === 5 : ajout de l'espace "Futurs parents" (demandes
      // d'inscription), nouveau — rien à migrer.
      if (oldVersion === 5) {
        finishFreshSchema();
        return;
      }

      // oldVersion === 6 : ajout du module "emploi du temps" (créneaux par
      // élève, détection de conflits).
      // oldVersion === 7 : ajout du calendrier unifié (courseLogs :
      // présences, cours ponctuels, annulations/déplacements ponctuels).
      // oldVersion >= 7 : rien d'autre à faire, schéma déjà à jour.
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
  createStudent: (fullName, ageGroup, extra = {}) => {
    const student = { id: newId("student"), fullName, ageGroup, createdAt: Date.now(), ...extra };
    return idbPut("students", student);
  },
  // NOTE : corrige un bug où updateStudent écrasait la date de création
  // d'origine (createdAt) à chaque modification. Elle est maintenant
  // préservée. extra permet d'ajouter/modifier des champs optionnels
  // (contact parent, notes privées) sans toucher aux appels existants.
  async updateStudent(id, fullName, ageGroup, extra = {}) {
    const existing = await idbGet("students", id);
    return idbPut("students", { ...(existing || {}), id, fullName, ageGroup, ...extra });
  },
  // Supprime définitivement un élève ET toutes les données qui lui sont
  // rattachées (parcours, progression, badges, diplômes, mémorisation,
  // enregistrements vocaux, facturation). Si l'élève était membre d'une
  // famille, il est simplement retiré de la liste des membres (la famille
  // et les autres membres restent intacts).
  async deleteStudentCascade(studentId) {
    const [progress, badges, diplomas, memorization, recordings, families] = await Promise.all([
      idbGetAll("progress"), idbGetAll("badges"), idbGetAll("diplomas"),
      idbGetAll("memorization"), idbGetAll("recordings"), idbGetAll("families"),
    ]);
    await Promise.all([
      ...progress.filter((r) => r.studentId === studentId).map((r) => idbDelete("progress", r.key)),
      ...badges.filter((r) => r.studentId === studentId).map((r) => idbDelete("badges", r.key)),
      ...diplomas.filter((r) => r.studentId === studentId).map((r) => idbDelete("diplomas", r.id)),
      ...memorization.filter((r) => r.studentId === studentId).map((r) => idbDelete("memorization", r.key)),
      ...recordings.filter((r) => r.studentId === studentId).map((r) => idbDelete("recordings", r.key)),
    ]);
    // Facturation individuelle de l'élève
    await idbDelete("billing", studentId).catch(() => {});
    // Retrait de l'élève de toute famille dont il serait membre
    for (const fam of families) {
      if ((fam.memberIds || []).includes(studentId)) {
        fam.memberIds = fam.memberIds.filter((id) => id !== studentId);
        await idbPut("families", fam);
      }
    }
    await idbDelete("students", studentId);
  },
  deleteStudent: (id) => idbDelete("students", id),

  // Décision pédagogique après la Séance 13 (toujours prise par
  // l'enseignante) : null | "reading_continue" | "review" | "deferred" |
  // "memorization_started". Fusionnée avec le profil existant pour ne pas
  // écraser fullName/ageGroup/createdAt.
  async setTrackDecision(studentId, decision) {
    const existing = await idbGet("students", studentId);
    if (!existing) return null;
    return idbPut("students", { ...existing, trackDecision: decision, trackDecisionAt: Date.now() });
  },

  // --- mémorisation du Coran (par élève, par Juz) ---
  // key = `${studentId}::${juzId}`
  getAllMemorization: (studentId) =>
    idbGetAll("memorization").then((rows) => rows.filter((r) => r.studentId === studentId)),
  saveJuzProgress: (studentId, juzId, data) =>
    idbPut("memorization", { key: `${studentId}::${juzId}`, studentId, juzId, updatedAt: Date.now(), ...data }),

  // --- module paiement : facturation par élève ---
  getBilling: (studentId) => idbGet("billing", studentId),
  getAllBilling: () => idbGetAll("billing"),
  saveBilling: (studentId, billing) => idbPut("billing", { ...billing, studentId }),

  // --- module paiement : familles (facturation groupée) ---
  getAllFamilies: () => idbGetAll("families"),
  getFamily: (id) => idbGet("families", id),
  saveFamily: (family) => idbPut("families", family),
  deleteFamily: (id) => idbDelete("families", id),

  // --- vérification publique (QR codes reçus/diplômes) ---
  // Le store "diplomas" a pour clé (keyPath) le certNumber lui-même : accès direct.
  getDiplomaByCertNumber: (certNumber) => idbGet("diplomas", certNumber).catch(() => null),
  // Les paiements/reçus sont embarqués dans les entités de facturation
  // (élève individuel OU famille) : on parcourt les deux stores.
  async findPaymentByReceiptNumber(receiptNumber) {
    const [allBilling, allFamilies] = await Promise.all([idbGetAll("billing"), idbGetAll("families")]);
    for (const b of allBilling) {
      const p = (b.payments || []).find((x) => x.receiptNumber === receiptNumber);
      if (p) return { payment: p, studentId: b.studentId, familyId: null };
    }
    for (const f of allFamilies) {
      const p = (f.payments || []).find((x) => x.receiptNumber === receiptNumber);
      if (p) return { payment: p, studentId: null, familyId: f.id, familyName: f.name };
    }
    return null;
  },

  // --- espace "Futurs parents" : demandes d'inscription ---
  getAllRegistrations: () => idbGetAll("registrations"),
  saveRegistration: (reg) => idbPut("registrations", reg),
  deleteRegistration: (id) => idbDelete("registrations", id),

  // --- progress (par élève, par séance, par matière) ---
  // key = `${studentId}::${sessionId}::${subjectKey}`
  getAllProgress: (studentId) =>
    idbGetAll("progress").then((rows) => rows.filter((r) => r.studentId === studentId)),
  // Tous les enregistrements de progression, tous élèves confondus — pour
  // les statistiques agrégées de l'espace enseignant.
  getAllProgressEveryone: () => idbGetAll("progress"),
  saveSubjectProgress: (studentId, sessionId, subjectKey, data) =>
    idbPut("progress", {
      key: `${studentId}::${sessionId}::${subjectKey}`,
      studentId, sessionId, subjectKey,
      updatedAt: Date.now(),
      ...data,
    }),

  // --- badges (par élève) ---
  getAllBadges: (studentId) =>
    idbGetAll("badges").then((rows) => rows.filter((r) => r.studentId === studentId)),
  unlockBadge: (studentId, id) =>
    idbPut("badges", { key: `${studentId}::${id}`, studentId, id, unlockedAt: Date.now() }),

  // --- diplomas (par élève) ---
  getAllDiplomas: (studentId) =>
    idbGetAll("diplomas").then((rows) => rows.filter((r) => r.studentId === studentId)),
  // Tous les diplômes émis, tous élèves confondus.
  getAllDiplomasEveryone: () => idbGetAll("diplomas"),
  saveDiploma: (diploma) => idbPut("diplomas", diploma),

  // --- recordings (par élève) ---
  saveRecording: (studentId, id, blob) =>
    idbPut("recordings", { key: `${studentId}::${id}`, studentId, blob, createdAt: Date.now() }),
  getRecording: (studentId, id) => idbGet("recordings", `${studentId}::${id}`),

  // --- settings globaux (langue, thème, profil actif) ---
  getSettings: () => idbGet("settings", "app"),
  saveSettings: (settings) => idbPut("settings", { id: "app", ...settings }),

  // --- emploi du temps (créneaux par élève) ---
  getAllScheduleSlots: () => idbGetAll("schedule"),
  saveScheduleSlot: (slot) => idbPut("schedule", slot),
  deleteScheduleSlot: (id) => idbDelete("schedule", id),

  // --- calendrier unifié (occurrences ponctuelles : présences, cours
  // ponctuels hors créneau habituel, annulations/déplacements d'un seul
  // jour sans toucher au créneau récurrent) ---
  getAllCourseLogs: () => idbGetAll("courseLogs"),
  saveCourseLog: (log) => idbPut("courseLogs", log),
  deleteCourseLog: (id) => idbDelete("courseLogs", id),

  // --- sauvegarde / restauration complète (tous les profils) ---
  async exportAll() {
    const [students, progress, badges, diplomas, settings, memorization, billing, families, registrations, schedule, courseLogs] = await Promise.all([
      DB.getAllStudents(),
      idbGetAll("progress"),
      idbGetAll("badges"),
      idbGetAll("diplomas"),
      DB.getSettings(),
      idbGetAll("memorization"),
      idbGetAll("billing"),
      idbGetAll("families"),
      idbGetAll("registrations"),
      idbGetAll("schedule"),
      idbGetAll("courseLogs"),
    ]);
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), students, progress, badges, diplomas, settings, memorization, billing, families, registrations, schedule, courseLogs };
  },
  async importAll(data) {
    if (Array.isArray(data.students)) for (const s of data.students) await idbPut("students", s);
    if (Array.isArray(data.progress)) for (const p of data.progress) await idbPut("progress", p);
    if (Array.isArray(data.badges)) for (const b of data.badges) await idbPut("badges", b);
    if (Array.isArray(data.diplomas)) for (const d of data.diplomas) await idbPut("diplomas", d);
    if (Array.isArray(data.memorization)) for (const m of data.memorization) await idbPut("memorization", m);
    if (Array.isArray(data.billing)) for (const b of data.billing) await idbPut("billing", b);
    if (Array.isArray(data.families)) for (const f of data.families) await idbPut("families", f);
    if (Array.isArray(data.registrations)) for (const r of data.registrations) await idbPut("registrations", r);
    if (Array.isArray(data.schedule)) for (const sc of data.schedule) await idbPut("schedule", sc);
    if (Array.isArray(data.courseLogs)) for (const cl of data.courseLogs) await idbPut("courseLogs", cl);
    if (data.settings) await idbPut("settings", data.settings);
  },
};
