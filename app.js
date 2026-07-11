// =============================================================================
// app.js — Cœur applicatif : état, routeur, rendu des écrans, moteurs
// d'exercices. Organisation par SÉANCES : chaque séance a 5 onglets
// (coran, athkars, fiqh, exercices, evaluation). La séance suivante ne se
// débloque que lorsque les 5 onglets de la séance en cours sont validés.
// =============================================================================

const BADGES = SESSIONS.map((s) => ({ id: `session_${s.id}`, sessionId: s.id }));

const STATE = {
  route: "#/onboarding",
  students: [],        // tous les profils élèves sur ce téléphone
  activeStudentId: null,
  student: null,        // = students.find(s => s.id === activeStudentId)
  settings: { language: "fr", theme: "light" },
  progress: {},   // { [sessionId]: { [subjectKey]: {completed, subSteps?} } } — profil actif
  badges: [],     // [{id, unlockedAt}] — pour le profil actif
  diplomas: [],   // — pour le profil actif
  memorization: {}, // { [juzId]: {completed} } — parcours Ajza', profil actif
  registrations: [], registrationsLoaded: false, // demandes d'inscription (espace Futurs parents)
  // état transitoire d'exercice/écran en cours
  runtime: {},
};

const $app = () => document.getElementById("app");

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function openModal(innerHtml) {
  closeModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "modalBackdrop";
  backdrop.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
}
function closeModal() {
  document.getElementById("modalBackdrop")?.remove();
}

// Fenêtre de confirmation générique avant toute suppression définitive.
function openConfirmModal(title, message, onConfirm) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div style="text-align:center">
      <div class="star8" style="margin:0 auto 14px;--s:52px;background:var(--color-danger);color:#fff">🗑️</div>
      <h3 class="display" style="margin-bottom:8px">${title}</h3>
      <p class="subject-note" style="margin-bottom:20px">${message}</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn" id="confirmDeleteBtn" style="background:var(--color-danger)">${t("confirmDelete")}</button>
        <button class="btn secondary" id="cancelDeleteBtn">${t("cancel")}</button>
      </div>
    </div>
  `);
  document.getElementById("cancelDeleteBtn").addEventListener("click", closeModal);
  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    document.getElementById("confirmDeleteBtn").textContent = "…";
    await onConfirm();
  });
}

// -----------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------
async function boot() {
  const savedSettings = await DB.getSettings();
  if (savedSettings) STATE.settings = { language: savedSettings.language, theme: savedSettings.theme, activeStudentId: savedSettings.activeStudentId || null, payment: savedSettings.payment, lastExportedAt: savedSettings.lastExportedAt || null };
  STATE.settings.payment = { ...defaultPaymentSettings(), ...(STATE.settings.payment || {}) };
  // Migration : les 4 textes personnalisés du reçu (citation, auteur,
  // remerciement, souhait) étaient autrefois une simple chaîne unique,
  // toujours affichée dans la même langue quel que soit le reçu généré.
  // On les convertit en objet {fr, en, it}, en gardant l'ancien texte
  // personnalisé côté FR (langue par défaut d'origine), sans rien perdre.
  ["receiptQuote", "receiptQuoteAuthor", "receiptThanks", "receiptWish"].forEach((key) => {
    const val = STATE.settings.payment[key];
    if (typeof val === "string") {
      STATE.settings.payment[key] = { ...defaultPaymentSettings()[key], fr: val || defaultPaymentSettings()[key].fr };
    }
  });
  STATE.settings.discover = migrateDiscoverContent(STATE.settings.discover);
  applyTheme();

  await loadStudentsAndActiveData(STATE.settings.activeStudentId);

  window.addEventListener("hashchange", route);
  const initialHash = location.hash;
  const isPublicInitial = initialHash === "#/discover" || initialHash === "#/discover/register" || initialHash.startsWith("#/verify/");
  STATE.route = isPublicInitial ? initialHash : (STATE.student ? (initialHash || "#/home") : "#/onboarding");
  location.hash = STATE.route;
  route();

  if ("serviceWorker" in navigator) {
    // Détecte qu'une NOUVELLE version du service worker a pris le contrôle
    // (mise à jour déployée) et recharge la page une seule fois pour que
    // l'utilisateur voie immédiatement la nouvelle version, au lieu de
    // rester bloqué sur l'ancienne jusqu'à la fermeture manuelle de l'app.
    // hadController = false lors de la toute première installation, donc
    // on ne force AUCUN rechargement au premier lancement (comportement
    // normal préservé) — seulement lors des mises à jour ultérieures.
    const hadController = !!navigator.serviceWorker.controller;
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || swRefreshing) return;
      swRefreshing = true;
      try { toast(t("swUpdateReady")); } catch (e) {}
      setTimeout(() => window.location.reload(), 600);
    });
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  // Vérification périodique des cours proches, pour les notifications
  // locales (uniquement pendant que l'app est ouverte — voir limite
  // expliquée dans schedule.js).
  try {
    const [slots, logs] = await Promise.all([DB.getAllScheduleSlots(), DB.getAllCourseLogs()]);
    STATE.scheduleSlots = STATE.scheduleSlots || slots;
    STATE.courseLogs = STATE.courseLogs || logs;
    checkUpcomingNotifications(STATE.scheduleSlots, STATE.courseLogs);
    setInterval(() => {
      if (STATE.scheduleSlots && STATE.courseLogs) checkUpcomingNotifications(STATE.scheduleSlots, STATE.courseLogs);
    }, 60000);
  } catch (e) { /* ignore */ }
}

function defaultPaymentSettings() {
  return {
    academyName: "Seyda Zeynab Academy", teacherName: "",
    whatsapp: "+221764279847", phone: "", email: "", address: "", website: "",
    receiptQuote: { fr: "La science est une lumière, apprends-la et transmets-la.", en: "Knowledge is a light, learn it and pass it on.", it: "La scienza è una luce, imparala e trasmettila." },
    receiptQuoteAuthor: { fr: "Prophète Muhammad ﷺ", en: "Prophet Muhammad ﷺ", it: "Profeta Muhammad ﷺ" },
    receiptThanks: { fr: "Merci pour votre confiance.", en: "Thank you for your trust.", it: "Grazie per la vostra fiducia." },
    receiptWish: { fr: "Qu'Allah facilite ton apprentissage et t'accorde la réussite.", en: "May Allah ease your learning and grant you success.", it: "Che Allah faciliti il tuo apprendimento e ti conceda il successo." },
    currencies: ["FCFA", "USD", "EUR"],
    paymentMethods: ["Wave", "Orange Money", "Espèces", "Virement bancaire", "PayPal", "Western Union"],
  };
}
async function savePaymentSettings() {
  await DB.saveSettings(STATE.settings);
}

// Recharge la liste des profils, choisit/valide le profil actif, et recharge
// toutes les données (progression, badges, diplômes) propres à ce profil.
async function loadStudentsAndActiveData(preferredActiveId) {
  STATE.students = await DB.getAllStudents();
  let activeId = preferredActiveId;
  if (!activeId || !STATE.students.find((s) => s.id === activeId)) {
    activeId = STATE.students[0]?.id || null;
  }
  STATE.activeStudentId = activeId;
  STATE.settings.activeStudentId = activeId;
  STATE.student = STATE.students.find((s) => s.id === activeId) || null;

  STATE.progress = {};
  STATE.badges = [];
  STATE.diplomas = [];
  STATE.memorization = {};
  STATE.billingEntities = [];
  STATE.billingEntitiesLoaded = false;
  if (STATE.student) {
    const rows = await DB.getAllProgress(activeId);
    rows.forEach((r) => {
      STATE.progress[r.sessionId] = STATE.progress[r.sessionId] || {};
      STATE.progress[r.sessionId][r.subjectKey] = r;
    });
    STATE.badges = await DB.getAllBadges(activeId);
    STATE.diplomas = await DB.getAllDiplomas(activeId);
    const juzRows = await DB.getAllMemorization(activeId);
    juzRows.forEach((r) => { STATE.memorization[r.juzId] = r; });
  }
}

async function switchActiveStudent(studentId) {
  STATE.settings.activeStudentId = studentId;
  await DB.saveSettings(STATE.settings);
  await loadStudentsAndActiveData(studentId);
  go("#/home");
  toast(STATE.student?.fullName || "");
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", STATE.settings.theme === "dark" ? "dark" : "light");
}

function go(hash) { location.hash = hash; route(); }

function route() {
  const hash = location.hash || "#/home";
  STATE.route = hash;
  const isPublicRoute = hash === "#/discover" || hash === "#/discover/register" || hash.startsWith("#/verify/");
  if (!STATE.student && hash !== "#/onboarding" && !isPublicRoute) { location.hash = "#/onboarding"; return; }

  if (hash === "#/onboarding") return renderOnboarding();
  if (hash === "#/discover") return renderPublicShell(renderDiscoverScreen());
  if (hash === "#/discover/register") return renderPublicShell(renderDiscoverRegisterForm());
  const verifyMatch = hash.match(/^#\/verify\/([a-zA-Z]+)\/(.+)$/);
  if (verifyMatch) return renderPublicShell(renderVerifyScreen(verifyMatch[1], decodeURIComponent(verifyMatch[2])));
  if (hash === "#/registrations") return renderShell(renderRegistrationsList());
  if (hash === "#/schedule") return renderShell(renderScheduleScreen());
  if (hash === "#/teacher") return renderShell(renderTeacherHub());
  if (hash === "#/teacher/students") return renderShell(renderTeacherStudents());
  if (hash === "#/teacher/progress") return renderShell(renderTeacherProgress());
  if (hash === "#/teacher/stats") return renderShell(renderTeacherStats());
  const scheduleStudentMatch = hash.match(/^#\/schedule\/student\/(.+)$/);
  if (scheduleStudentMatch) return renderShell(renderStudentScheduleDetail(decodeURIComponent(scheduleStudentMatch[1])));
  if (hash === "#/home") return renderShell(renderHome());
  if (hash === "#/progress") return renderShell(renderProgress());
  if (hash === "#/diplomas") return renderShell(renderDiplomas());
  if (hash === "#/settings") return renderShell(renderSettings());
  if (hash === "#/memorization") return renderShell(renderMemorizationScreen());
  if (hash === "#/payments") return renderShell(renderPaymentsList());
  if (hash === "#/payments/finance") return renderShell(renderFinanceOverview());
  if (hash === "#/payments/history") return renderShell(renderPaymentsHistory());
  if (hash === "#/families") return renderShell(renderFamiliesManager());
  const paymentMatch = hash.match(/^#\/payment\/(.+)$/);
  if (paymentMatch) return renderShell(renderPaymentDetail(decodeURIComponent(paymentMatch[1])));
  const sessionMatch = hash.match(/^#\/session\/(\d+)$/);
  if (sessionMatch) return renderShell(renderSessionScreen(Number(sessionMatch[1])));
  return renderShell(renderHome());
}

// -----------------------------------------------------------------------
// Shell (topbar + bottom nav) commun à tous les écrans "logués"
// -----------------------------------------------------------------------
// Shell "public" (sans barre de navigation ni sélecteur de profil) pour les
// pages accessibles sans profil élève : l'espace "Futurs parents".
function renderPublicShell(mainHtml) {
  $app().innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark"><img src="logo-header.png" alt="" /></div>
        <div class="brand-name">${t("appName")}<small>${t("tagline")}</small></div>
      </div>
      <div class="topbar-actions">
        <button class="icon-btn" id="themeToggle">${STATE.settings.theme === "dark" ? "☀" : "☾"}</button>
      </div>
    </div>
    <main>${mainHtml}</main>
  `;
  document.getElementById("themeToggle").addEventListener("click", async () => {
    STATE.settings.theme = STATE.settings.theme === "dark" ? "light" : "dark";
    applyTheme();
    await DB.saveSettings(STATE.settings);
    route();
  });
  $app().querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => go(el.dataset.go))
  );
  if (STATE.route === "#/discover") attachDiscoverScreenHandlers();
  if (STATE.route === "#/discover/register") attachDiscoverRegisterHandlers();
}

function renderShell(mainHtml) {
  const paymentsActive = STATE.route === "#/payments" || STATE.route === "#/families" || STATE.route.startsWith("#/payment/");
  const nav = [
    { hash: "#/home", icon: "◐", label: t("nav_home") },
    { hash: "#/progress", icon: "◆", label: t("nav_progress") },
    { hash: "#/diplomas", icon: "❖", label: t("nav_diplomas") },
    { hash: "#/payments", icon: "💳", label: t("nav_payments"), active: paymentsActive },
    { hash: "#/settings", icon: "⚙", label: t("nav_settings") },
  ];
  $app().innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark"><img src="logo-header.png" alt="" /></div>
        <div class="brand-name">${t("appName")}<small>${t("tagline")}</small></div>
      </div>
      <div class="topbar-actions">
        <button class="icon-btn" id="studentSwitchBtn" title="${t("switchStudent")}">👤</button>
        <button class="icon-btn" id="themeToggle">${STATE.settings.theme === "dark" ? "☀" : "☾"}</button>
      </div>
    </div>
    ${STATE.students.length > 1 ? `<div class="active-student-pill" id="studentSwitchBtn2">👤 ${STATE.student?.fullName || ""}</div>` : ""}
    <main>${mainHtml}</main>
    <nav class="bottom-nav">
      ${nav.map((n) => `
        <button class="nav-btn ${(n.active || STATE.route === n.hash) ? "active" : ""}" data-go="${n.hash}">
          <span class="ic">${n.icon}</span><span>${n.label}</span>
        </button>`).join("")}
    </nav>
  `;
  document.getElementById("themeToggle").addEventListener("click", async () => {
    STATE.settings.theme = STATE.settings.theme === "dark" ? "light" : "dark";
    applyTheme();
    await DB.saveSettings(STATE.settings);
    route();
  });
  document.getElementById("studentSwitchBtn").addEventListener("click", openStudentSwitcherModal);
  document.getElementById("studentSwitchBtn2")?.addEventListener("click", openStudentSwitcherModal);
  $app().querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => go(el.dataset.go))
  );
  if (STATE.route === "#/home") { attachHomeHandlers(); attachBackupReminderBannerHandler(); }
  if (STATE.route === "#/progress") attachProgressHandlers();
  if (STATE.route === "#/diplomas") attachDiplomaHandlers();
  if (STATE.route === "#/settings") { attachSettingsHandlers(); attachBackupReminderBannerHandler(); }
  if (STATE.route === "#/memorization") attachMemorizationHandlers();
  if (STATE.route === "#/payments") attachPaymentsListHandlers();
  if (STATE.route === "#/payments/history") attachPaymentsHistoryHandlers();
  if (STATE.route === "#/families") attachFamiliesManagerHandlers();
  if (STATE.route === "#/registrations") attachRegistrationsListHandlers();
  if (STATE.route === "#/schedule") attachScheduleScreenHandlers();
  if (STATE.route === "#/teacher/students") attachTeacherStudentsHandlers();
  const scheduleStudentMatch = STATE.route.match(/^#\/schedule\/student\/(.+)$/);
  if (scheduleStudentMatch) attachStudentScheduleDetailHandlers(decodeURIComponent(scheduleStudentMatch[1]));
  const paymentMatch = STATE.route.match(/^#\/payment\/(.+)$/);
  if (paymentMatch) attachPaymentDetailHandlers(decodeURIComponent(paymentMatch[1]));
  const sessionMatch = STATE.route.match(/^#\/session\/(\d+)$/);
  if (sessionMatch) attachSessionHandlers(Number(sessionMatch[1]));
}

function openStudentSwitcherModal() {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("switchStudent")}</h3>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${STATE.students.map((s) => `
        <button class="btn ${s.id === STATE.activeStudentId ? "" : "secondary"}" data-switch-id="${s.id}" style="display:flex;align-items:center;gap:10px;text-align:left">
          ${avatarHtml(s.fullName, s.photo, 28)}
          <span>${s.id === STATE.activeStudentId ? "✓ " : ""}${s.fullName}</span>
        </button>
      `).join("")}
      <button class="btn gold" id="addStudentBtn">+ ${t("addStudent")}</button>
    </div>
  `);
  document.querySelectorAll("[data-switch-id]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      closeModal();
      await switchActiveStudent(btn.dataset.switchId);
    })
  );
  document.getElementById("addStudentBtn").addEventListener("click", () => {
    closeModal();
    openAddStudentModal();
  });
}

function openAddStudentModal() {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("addStudent")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("fullName")}</label>
      <input id="newStudentName" placeholder="${t("fullNamePlaceholder")}" />
    </div>
    <div class="field" style="margin-bottom:16px">
      <label>${t("ageGroup")}</label>
      <select id="newStudentAge">
        <option value="child">${t("ageChild")}</option>
        <option value="adult">${t("ageAdult")}</option>
      </select>
    </div>
    <button class="btn gold block" id="confirmAddStudentBtn">${t("createProfile")}</button>
  `);
  document.getElementById("confirmAddStudentBtn").addEventListener("click", async () => {
    const fullName = document.getElementById("newStudentName").value.trim();
    const ageGroup = document.getElementById("newStudentAge").value;
    if (!fullName) { toast(t("fullName") + " ?"); return; }
    const student = await DB.createStudent(fullName, ageGroup);
    closeModal();
    await switchActiveStudent(student.id);
  });
}

function renderOnboarding() {
  document.getElementById("app").innerHTML = `
    <div class="onboard-wrap">
      <div class="onboard-mark"><img src="logo-header.png" alt="" /></div>
      <div style="text-align:center">
        <h1 class="display" style="margin:0 0 6px">${t("onboardTitle")}</h1>
        <p style="color:var(--color-ink-soft);font-size:14px;margin:0">${t("onboardSub")}</p>
      </div>
      <div class="lang-row">
        ${["fr", "en", "it"].map((l) => `<button data-lang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
      </div>
      <div class="field">
        <label>${t("fullName")}</label>
        <input id="fullName" placeholder="${t("fullNamePlaceholder")}" />
      </div>
      <div class="field">
        <label>${t("ageGroup")}</label>
        <select id="ageGroup">
          <option value="child">${t("ageChild")}</option>
          <option value="adult">${t("ageAdult")}</option>
        </select>
      </div>
      <button class="btn block" id="createProfileBtn">${t("createProfile")}</button>
    </div>
  `;
  document.querySelectorAll("[data-lang]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      STATE.settings.language = btn.dataset.lang;
      await DB.saveSettings(STATE.settings);
      renderOnboarding();
    })
  );
  document.getElementById("createProfileBtn").addEventListener("click", async () => {
    const fullName = document.getElementById("fullName").value.trim();
    const ageGroup = document.getElementById("ageGroup").value;
    if (!fullName) { toast(t("fullName") + " ?"); return; }
    const student = await DB.createStudent(fullName, ageGroup);
    await switchActiveStudent(student.id);
  });
}

// -----------------------------------------------------------------------
// Progression par séance / matière — fonctions utilitaires
// -----------------------------------------------------------------------
function subjectProgress(sessionId, subjectKey) {
  return STATE.progress[sessionId]?.[subjectKey] || {};
}
function isSubjectCompleted(sessionId, subjectKey) {
  return !!subjectProgress(sessionId, subjectKey).completed;
}
function isSessionCompleted(sessionId) {
  return SUBJECT_TABS.every((tab) => isSubjectCompleted(sessionId, tab.key));
}
function sessionLocked(sessionId) {
  const prev = SESSIONS.find((s) => s.id === sessionId - 1);
  return prev ? !isSessionCompleted(prev.id) : false;
}
function completedSubjectsCount(sessionId) {
  return SUBJECT_TABS.filter((tab) => isSubjectCompleted(sessionId, tab.key)).length;
}

async function markSubjectProgress(sessionId, subjectKey, data) {
  const studentId = STATE.activeStudentId;
  const existing = subjectProgress(sessionId, subjectKey);
  const merged = { ...existing, ...data };
  await DB.saveSubjectProgress(studentId, sessionId, subjectKey, merged);
  STATE.progress[sessionId] = STATE.progress[sessionId] || {};
  STATE.progress[sessionId][subjectKey] = merged;
  return merged;
}

// -----------------------------------------------------------------------
// Mémorisation du Coran (Ajza') — parcours indépendant, validation
// toujours manuelle par l'enseignante.
// -----------------------------------------------------------------------
function isJuzCompleted(juzId) {
  return !!STATE.memorization[juzId]?.completed;
}
function allJuzCompleted() {
  return JUZ_LIST.every((j) => isJuzCompleted(j.id));
}

async function toggleJuzDone(juzId) {
  const wasDone = isJuzCompleted(juzId);
  const merged = await DB.saveJuzProgress(STATE.activeStudentId, juzId, { completed: !wasDone });
  STATE.memorization[juzId] = merged;

  if (!wasDone) {
    const badgeId = `juz_${juzId}`;
    if (!STATE.badges.find((b) => b.id === badgeId)) {
      await DB.unlockBadge(STATE.activeStudentId, badgeId);
      STATE.badges.push({ id: badgeId, unlockedAt: Date.now() });
    }
    const doneCount = JUZ_LIST.filter((j) => isJuzCompleted(j.id)).length;
    for (const milestone of [5, 10, 15, 20, 25]) {
      if (doneCount === milestone) {
        const msBadge = `juz_milestone_${milestone}`;
        if (!STATE.badges.find((b) => b.id === msBadge)) {
          await DB.unlockBadge(STATE.activeStudentId, msBadge);
          STATE.badges.push({ id: msBadge, unlockedAt: Date.now() });
        }
      }
    }
    if (allJuzCompleted()) {
      await onKhatmCompleted();
      return;
    }
  }
  renderShell(renderMemorizationScreen());
  toast(!wasDone ? t("subjectDone") : t("subjectUnmarked"));
}

async function onKhatmCompleted() {
  const badgeId = "khatm_al_quran";
  if (!STATE.badges.find((b) => b.id === badgeId)) {
    await DB.unlockBadge(STATE.activeStudentId, badgeId);
    STATE.badges.push({ id: badgeId, unlockedAt: Date.now() });
  }
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="empty-state khatm-celebration" style="padding:10px 0 4px">
      <div class="star8 done" style="margin:0 auto 14px;--s:60px">✓</div>
      <h2 class="display">${t("khatmComplete")}</h2>
      <p>${t("khatmCompleteMsg")}</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px">
        <button class="btn gold" id="getKhatmDiplomaBtn">🏆 ${t("getKhatmDiploma")}</button>
        <button class="btn secondary" id="khatmContinueBtn">${t("continueJourney")}</button>
      </div>
    </div>
  `);
  document.getElementById("khatmContinueBtn").addEventListener("click", () => { closeModal(); renderShell(renderMemorizationScreen()); });
  document.getElementById("getKhatmDiplomaBtn").addEventListener("click", () => openKhatmLangPicker());
}

function openKhatmLangPicker() {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center">${t("diplomaLangChoose")}</h3>
    <div class="lang-row">
      ${["fr", "en", "it"].map((l) => `<button data-klang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
    </div>
    <button class="btn gold block" id="confirmKhatmBtn">🏆 ${t("getKhatmDiploma")}</button>
  `);
  let chosen = STATE.settings.language;
  document.querySelectorAll("[data-klang]").forEach((btn) =>
    btn.addEventListener("click", () => {
      chosen = btn.dataset.klang;
      document.querySelectorAll("[data-klang]").forEach((b) => b.classList.toggle("active", b === btn));
    })
  );
  document.getElementById("confirmKhatmBtn").addEventListener("click", async () => {
    document.getElementById("confirmKhatmBtn").textContent = "…";
    const diploma = await createKhatmDiploma(chosen);
    STATE.diplomas.push(diploma);
    closeModal();
    go("#/home");
    toast(t("khatmComplete"));
    setTimeout(() => downloadFile(diploma.pdfDataUrl, `Khatm_Al_Quran_${diploma.certNumber}.pdf`), 300);
  });
}

function renderMemorizationScreen() {
  const doneCount = JUZ_LIST.filter((j) => isJuzCompleted(j.id)).length;
  const pct = Math.round((doneCount / JUZ_LIST.length) * 100);
  const items = JUZ_LIST.map((juz) => {
    const done = isJuzCompleted(juz.id);
    return `
      <button class="path-item" data-juz="${juz.id}" style="background:var(--color-surface);box-shadow:var(--shadow-card)">
        <div class="star8 ${done ? "done" : "active"}">${done ? "✓" : juz.id}</div>
        <div class="meta">
          <div class="title arabic" style="font-size:15px">${juz.name_ar}</div>
          <div class="sub">${juzLabel(juz)}</div>
        </div>
        <div class="chev">›</div>
      </button>`;
  }).join("");

  return `
    <div class="session-header">
      <h2 class="display">${t("memorizationTrack")}</h2>
      <button class="btn secondary" data-go="#/home" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>${t("juzValidated")}</b><span>${doneCount}/${JUZ_LIST.length}</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%;background:var(--color-accent)"></div></div>
    </div>
    <p class="subject-note" style="margin-bottom:14px">${t("memorizationIntro")}</p>
    <div class="path">${items}</div>
  `;
}

function attachMemorizationHandlers() {
  document.querySelectorAll("[data-juz]").forEach((btn) =>
    btn.addEventListener("click", () => openJuzModal(Number(btn.dataset.juz)))
  );
}

function openJuzModal(juzId) {
  const juz = JUZ_LIST.find((j) => j.id === juzId);
  const done = isJuzCompleted(juzId);
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div style="text-align:center">
      <div class="star8 ${done ? "done" : "active"}" style="margin:0 auto 14px;--s:56px">${done ? "✓" : juz.id}</div>
      <h3 class="display arabic" style="margin-bottom:4px">${juz.name_ar}</h3>
      <p class="subject-note" style="margin-bottom:18px">${juzLabel(juz)}</p>
      <button class="btn ${done ? "secondary" : "gold"} block" id="toggleJuzBtn">
        ${done ? "✓ " + t("markedDone") : t("markAsDone")}
      </button>
      ${done ? `<div class="unmark-hint">${t("tapToUnmark")}</div>` : ""}
      ${done ? `<button class="btn secondary block" id="getJuzDiplomaBtn" style="margin-top:14px">🏅 ${t("getDiploma")}</button>` : ""}
    </div>
  `);
  document.getElementById("toggleJuzBtn").addEventListener("click", async () => {
    closeModal();
    await toggleJuzDone(juzId);
  });
  document.getElementById("getJuzDiplomaBtn")?.addEventListener("click", () => openJuzDiplomaLangPicker(juz));
}

function openJuzDiplomaLangPicker(juz) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center">${t("diplomaLangChoose")}</h3>
    <div class="lang-row">
      ${["fr", "en", "it"].map((l) => `<button data-jlang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
    </div>
    <button class="btn gold block" id="confirmJuzDiplomaBtn">🏅 ${t("getDiploma")}</button>
  `);
  let chosen = STATE.settings.language;
  document.querySelectorAll("[data-jlang]").forEach((btn) =>
    btn.addEventListener("click", () => {
      chosen = btn.dataset.jlang;
      document.querySelectorAll("[data-jlang]").forEach((b) => b.classList.toggle("active", b === btn));
    })
  );
  document.getElementById("confirmJuzDiplomaBtn").addEventListener("click", async () => {
    document.getElementById("confirmJuzDiplomaBtn").textContent = "…";
    const diploma = await createDiplomaForJuz(juz, chosen);
    STATE.diplomas.push(diploma);
    closeModal();
    toast(t("levelComplete"));
    setTimeout(() => downloadDiploma(diploma), 300);
  });
}

// -----------------------------------------------------------------------
// Home / Parcours (liste des séances)
// -----------------------------------------------------------------------
function renderHome() {
  const totalCompleted = SESSIONS.filter((s) => isSessionCompleted(s.id)).length;
  const overallPct = Math.round((totalCompleted / SESSIONS.length) * 100);

  const pathItems = SESSIONS.map((session) => {
    const locked = sessionLocked(session.id);
    const completed = isSessionCompleted(session.id);
    const done = completedSubjectsCount(session.id);
    const icon = completed ? "✓" : locked ? "🔒" : session.id;
    const sub = locked ? t("locked") : `${done}/${SUBJECT_TABS.length} ${t("subjectsDone")}`;
    return `
      <button class="path-item" data-session="${session.id}" data-locked="${locked}">
        <div class="star8 ${completed ? "done" : locked ? "" : "active"}">${icon}</div>
        <div class="meta">
          <div class="title">${sessionTitle(session)}</div>
          <div class="sub">${sub}</div>
        </div>
        <div class="chev">›</div>
      </button>`;
  }).join("");

  return `
    ${renderBackupReminderBanner()}
    <div class="hero-card">
      <div class="greeting">${t("greeting")},</div>
      <div class="name" style="display:flex;align-items:center;gap:10px">${avatarHtml(STATE.student?.fullName || "", STATE.student?.photo, 40)}${STATE.student?.fullName || ""}</div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${overallPct}%"></div></div>
      <div class="hero-stats">
        <div><b>${totalCompleted}/${SESSIONS.length}</b>${t("sessionsCompleted")}</div>
        <div><b>${STATE.badges.length}</b>${t("badgesEarned")}</div>
        <div><b>${STATE.diplomas.length}</b>${t("diplomasEarned")}</div>
      </div>
    </div>
    <div class="section-title">${t("yourJourney")}</div>
    <div class="path">${pathItems}</div>
    ${renderTrackDecisionSection(totalCompleted)}
  `;
}

function renderTrackDecisionSection(totalCompleted) {
  if (totalCompleted < SESSIONS.length) return "";
  const decision = STATE.student?.trackDecision || null;

  if (decision === "memorization_started") {
    const doneJuz = JUZ_LIST.filter((j) => isJuzCompleted(j.id)).length;
    const pct = Math.round((doneJuz / JUZ_LIST.length) * 100);
    return `
      <div class="section-title">${t("memorizationTrack")}</div>
      <button class="path-item" data-go-memorization="1" style="background:var(--color-surface);box-shadow:var(--shadow-card)">
        <div class="star8 ${doneJuz === JUZ_LIST.length ? "done" : "active"}">📖</div>
        <div class="meta">
          <div class="title">${t("memorizationTrack")}</div>
          <div class="sub">${doneJuz}/${JUZ_LIST.length} ${t("juzValidated")} (${pct}%)</div>
        </div>
        <div class="chev">›</div>
      </button>
    `;
  }

  const decisionLabels = {
    reading_continue: t("decisionReadingContinue"),
    review: t("decisionReview"),
    deferred: t("decisionDeferred"),
  };

  return `
    <div class="section-title">${t("readingTrackComplete")}</div>
    <div class="card" style="text-align:center">
      ${decision
        ? `<p class="subject-note" style="margin:0 0 12px">${t("currentDecision")} : <b>${decisionLabels[decision]}</b></p>`
        : `<p class="subject-note" style="margin:0 0 12px">${t("decisionNeeded")}</p>`}
      <button class="btn gold block" id="openTrackDecisionBtn">${decision ? t("reviewDecision") : t("makeDecision")}</button>
    </div>
  `;
}

function openTrackDecisionModal() {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:6px">${t("makeDecision")}</h3>
    <p class="subject-note" style="text-align:center;margin-bottom:16px">${t("decisionIntro")}</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn gold" data-decision="memorization_started">${t("decisionMemorization")}</button>
      <button class="btn secondary" data-decision="reading_continue">${t("decisionReadingContinue")}</button>
      <button class="btn secondary" data-decision="review">${t("decisionReview")}</button>
      <button class="btn secondary" data-decision="deferred">${t("decisionDeferred")}</button>
    </div>
  `);
  document.querySelectorAll("[data-decision]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const decision = btn.dataset.decision;
      await DB.setTrackDecision(STATE.activeStudentId, decision);
      STATE.student.trackDecision = decision;
      closeModal();
      go("#/home");
      toast(t("decisionSaved"));
    })
  );
}

function attachHomeHandlers() {
  document.querySelectorAll(".path-item[data-session]").forEach((el) =>
    el.addEventListener("click", () => {
      const locked = el.dataset.locked === "true";
      const session = SESSIONS.find((s) => s.id === Number(el.dataset.session));
      if (locked) { toast(t("sessionLockedMsg", sessionTitle(session))); return; }
      go(`#/session/${session.id}`);
    })
  );
  document.querySelector("[data-go-memorization]")?.addEventListener("click", () => go("#/memorization"));
  document.getElementById("openTrackDecisionBtn")?.addEventListener("click", openTrackDecisionModal);
}

// -----------------------------------------------------------------------
// Écran de séance — barre à 5 onglets + contenu de la matière active
// -----------------------------------------------------------------------
function renderSessionScreen(sessionId) {
  const session = SESSIONS.find((s) => s.id === sessionId);
  if (!session) return renderHome();
  if (sessionLocked(sessionId)) {
    setTimeout(() => go("#/home"), 0);
    return "";
  }

  if (!STATE.runtime.session || STATE.runtime.session.sessionId !== sessionId) {
    const firstIncomplete = SUBJECT_TABS.find((tab) => !isSubjectCompleted(sessionId, tab.key));
    STATE.runtime.session = { sessionId, activeTab: firstIncomplete ? firstIncomplete.key : "coran" };
  }
  const activeTab = STATE.runtime.session.activeTab;
  const subject = session.subjects[activeTab];

  const tabsHtml = SUBJECT_TABS.map((tab) => {
    const done = isSubjectCompleted(sessionId, tab.key);
    return `
      <button class="subject-tab ${activeTab === tab.key ? "active" : ""} ${done ? "done" : ""}" data-tab="${tab.key}">
        <span class="ic">${tab.icon}</span>
        <span>${subjectTabLabel(tab)}</span>
        ${done ? '<span class="tick">✓</span>' : ""}
      </button>`;
  }).join("");

  return `
    <div class="session-header">
      <h2 class="display">${sessionTitle(session)}</h2>
      <button class="btn secondary" data-go="#/home" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <div class="subject-tabs">${tabsHtml}</div>
    <div id="subjectContent">${renderSubjectContent(session, activeTab, subject)}</div>
  `;
}

function renderSubjectContent(session, tabKey, subject) {
  const done = isSubjectCompleted(session.id, tabKey);
  const title = subjectTitle(subject);
  const genericTab = tabKey === "exercices" || tabKey === "evaluation";
  const displayTitle = title || (genericTab ? subjectTabLabel(SUBJECT_TABS.find((t2) => t2.key === tabKey)) : null);

  if (tabKey === "coran" && subject.engine === "letters-combo") {
    return renderLettersComboMenu(session.id);
  }

  return `
    <div class="card subject-card">
      <div class="subject-icon">${SUBJECT_TABS.find((t2) => t2.key === tabKey).icon}</div>
      ${displayTitle ? `<h3 class="display">${displayTitle}</h3>` : `<h3 class="display" style="color:var(--color-ink-soft)">${t("toDefine")}</h3>`}
      <p class="subject-note">${displayTitle ? t("subjectLiveNote") : t("subjectToDefineNote")}</p>
      <button class="btn ${done ? "secondary" : "gold"} block" id="markDoneBtn">
        ${done ? "✓ " + t("markedDone") : t("markAsDone")}
      </button>
      ${done ? `<div class="unmark-hint">${t("tapToUnmark")}</div>` : ""}
    </div>
  `;
}

function renderLettersComboMenu(sessionId) {
  const done = isSubjectCompleted(sessionId, "coran");
  const p = subjectProgress(sessionId, "coran");
  const subSteps = p.subSteps || {};
  const steps = [
    { key: "recognition", label: t("stepRecognition"), done: !!subSteps.recognition },
    { key: "pronunciation", label: t("stepPronunciation"), done: !!subSteps.pronunciation },
  ];
  return `
    <div class="card subject-card" style="text-align:left">
      <p class="subject-note" style="margin-bottom:14px">${t("coranComboIntro")}</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${steps.map((st) => `
          <button class="path-item" data-substep="${st.key}" style="background:var(--color-surface-2)">
            <div class="star8 ${st.done ? "done" : "active"}">${st.done ? "✓" : "•"}</div>
            <div class="meta"><div class="title">${st.label}</div></div>
            <div class="chev">›</div>
          </button>
        `).join("")}
      </div>
      <div style="margin-top:18px;border-top:1px solid var(--color-surface-2);padding-top:16px;text-align:center">
        <p class="subject-note" style="margin:0 0 10px">${t("orMarkManually")}</p>
        <button class="btn ${done ? "secondary" : "gold"} block" id="manualToggleCoranBtn">
          ${done ? "✓ " + t("markedDone") : t("markAsDone")}
        </button>
        ${done ? `<div class="unmark-hint">${t("tapToUnmark")}</div>` : ""}
      </div>
    </div>
  `;
}

function attachSessionHandlers(sessionId) {
  document.querySelectorAll(".subject-tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.session = { sessionId, activeTab: btn.dataset.tab };
      renderShell(renderSessionScreen(sessionId));
    })
  );
  document.getElementById("markDoneBtn")?.addEventListener("click", async () => {
    const activeTab = STATE.runtime.session.activeTab;
    await toggleSubjectDone(sessionId, activeTab);
  });
  document.getElementById("manualToggleCoranBtn")?.addEventListener("click", async () => {
    await toggleSubjectDone(sessionId, "coran");
  });
  document.querySelectorAll("[data-substep]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const step = btn.dataset.substep;
      const root = document.getElementById("subjectContent");
      if (step === "recognition") {
        root.innerHTML = `<div id="engineRoot"></div>`;
        startFlashcardQuizEngine((percent) => onCoranSubStepDone(sessionId, "recognition", percent));
      } else {
        root.innerHTML = `<div id="engineRoot"></div>`;
        startListenRepeatEngine((percent) => onCoranSubStepDone(sessionId, "pronunciation", percent), "s1_pron");
      }
    })
  );
}

async function onCoranSubStepDone(sessionId, stepKey, percent) {
  const existing = subjectProgress(sessionId, "coran");
  const subSteps = { ...(existing.subSteps || {}), [stepKey]: true };
  const bothDone = !!subSteps.recognition && !!subSteps.pronunciation;
  await markSubjectProgress(sessionId, "coran", { subSteps, completed: bothDone, percent });
  if (bothDone && isSessionCompleted(sessionId)) {
    await onSessionCompleted(sessionId);
  } else {
    STATE.runtime.session = { sessionId, activeTab: "coran" };
    renderShell(renderSessionScreen(sessionId));
    toast(t("subjectDone"));
  }
}

// Bascule "Acquis" / "Non acquis" pour une matière — utilisable à tout
// moment par l'enseignante, sur n'importe quelle matière de n'importe
// quelle séance, avec ou sans contenu pédagogique déjà renseigné. Cocher
// les 5 matières d'une séance débloque automatiquement la suivante ;
// décocher une matière reverrouille automatiquement les séances
// suivantes (recalcul dynamique, aucune action supplémentaire requise).
async function toggleSubjectDone(sessionId, subjectKey) {
  const wasDone = isSubjectCompleted(sessionId, subjectKey);
  await markSubjectProgress(sessionId, subjectKey, { completed: !wasDone });

  if (!wasDone && isSessionCompleted(sessionId)) {
    await onSessionCompleted(sessionId);
    return;
  }

  if (!wasDone) {
    const nextTab = SUBJECT_TABS.find((tab) => !isSubjectCompleted(sessionId, tab.key));
    STATE.runtime.session = { sessionId, activeTab: nextTab ? nextTab.key : subjectKey };
  } else {
    STATE.runtime.session = { sessionId, activeTab: subjectKey };
  }
  renderShell(renderSessionScreen(sessionId));
  toast(!wasDone ? t("subjectDone") : t("subjectUnmarked"));
}


// =============================================================================
// MOTEUR 1 — Flashcards + Quiz (reconnaissance des 28 lettres arabes)
// onComplete(percent) est appelé à la fin du quiz.
// =============================================================================
function startFlashcardQuizEngine(onComplete) {
  STATE.runtime.fc = { index: 0, flipped: false, onComplete };
  renderFlashcard();
}

function renderFlashcard() {
  const rt = STATE.runtime.fc;
  const letter = LETTERS[rt.index];
  const root = document.getElementById("engineRoot");
  if (!root) return;
  root.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-counter">${rt.index + 1} / ${LETTERS.length}</div>
      <div class="flashcard" id="fcCard">
        ${rt.flipped ? `
          <div class="name">${letterName(letter)}</div>
          <div class="translit">${t("transliteration")} : ${letter.translit}</div>
          <div class="hint">${t("flip")}</div>
        ` : `
          <div class="letter arabic">${letter.char}</div>
          <div class="hint">${t("flip")}</div>
        `}
      </div>
      <div class="flash-controls">
        <button class="btn secondary" id="fcPrev" ${rt.index === 0  ? "disabled" : ""}>‹ ${t("previous")}</button>
        <button class="btn" id="fcNext">${rt.index === LETTERS.length - 1 ? t("quizTitle") : t("next")} ›</button>
      </div>
    </div>
  `;
  document.getElementById("fcCard").addEventListener("click", () => { rt.flipped = !rt.flipped; renderFlashcard(); });
  document.getElementById("fcPrev").addEventListener("click", () => { rt.index = Math.max(0, rt.index - 1); rt.flipped = false; renderFlashcard(); });
  document.getElementById("fcNext").addEventListener("click", () => {
    if (rt.index === LETTERS.length - 1) { startLetterQuiz(); return; }
    rt.index++; rt.flipped = false; renderFlashcard();
  });
}

function startLetterQuiz() {
  const questions = shuffle([...LETTERS]).slice(0, 10).map((letter) => {
    const distractors = shuffle(LETTERS.filter((l) => l.id !== letter.id)).slice(0, 3);
    const options = shuffle([letter, ...distractors]);
    return { letter, options };
  });
  STATE.runtime.quiz = { questions, index: 0, correct: 0, answered: false, onComplete: STATE.runtime.fc.onComplete };
  renderQuizQuestion();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function renderQuizQuestion() {
  const rt = STATE.runtime.quiz;
  const root = document.getElementById("engineRoot");
  if (rt.index >= rt.questions.length) { rt.onComplete(Math.round((rt.correct / rt.questions.length) * 100)); return; }
  const q = rt.questions[rt.index];
  root.innerHTML = `
    <div class="quiz-question">
      <div class="flash-counter">${t("quizTitle")} — ${rt.index + 1}/${rt.questions.length}</div>
      <div class="prompt-letter arabic">${q.letter.char}</div>
      <div style="font-size:13px;color:var(--color-ink-soft)">${t("whichLetterIsThis")}</div>
    </div>
    <div class="quiz-options">
      ${q.options.map((opt) => `<button class="quiz-option" data-id="${opt.id}">${letterName(opt)}</button>`).join("")}
    </div>
    <div class="quiz-feedback" id="quizFeedback"></div>
  `;
  root.querySelectorAll(".quiz-option").forEach((btn) =>
    btn.addEventListener("click", () => onQuizAnswer(btn, q))
  );
}

function onQuizAnswer(btn, q) {
  const rt = STATE.runtime.quiz;
  if (rt.answered) return;
  rt.answered = true;
  const chosenId = btn.dataset.id;
  const isCorrect = chosenId === q.letter.id;
  if (isCorrect) rt.correct++;
  document.querySelectorAll(".quiz-option").forEach((b) => {
    b.disabled = true;
    if (b.dataset.id === q.letter.id) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  document.getElementById("quizFeedback").textContent = isCorrect ? t("correct") : t("incorrect");
  setTimeout(() => { rt.answered = false; rt.index++; renderQuizQuestion(); }, 900);
}

// =============================================================================
// MOTEUR 2 — Écoute & répétition (prononciation des 28 lettres arabes)
// onComplete(percent) est appelé à la fin. recordingNamespace évite les
// collisions entre enregistrements de différentes séances/matières.
// =============================================================================
function startListenRepeatEngine(onComplete, recordingNamespace) {
  STATE.runtime.lr = { index: 0, recorded: {}, mediaRecorder: null, chunks: [], recording: false, onComplete, ns: recordingNamespace };
  renderListenRepeat();
}

function renderListenRepeat() {
  const rt = STATE.runtime.lr;
  const letter = LETTERS[rt.index];
  const root = document.getElementById("engineRoot");
  const hasRecording = !!rt.recorded[letter.id];
  root.innerHTML = `
    <div class="flash-counter" style="text-align:center;margin-bottom:6px">${rt.index + 1} / ${LETTERS.length}</div>
    <div class="card listen-card">
      <div class="listen-letter arabic">${letter.char}</div>
      <div class="name">${letterName(letter)}</div>
      <div class="audio-row">
        <button class="btn gold" id="playBtn">🔊 ${t("playAudio")}</button>
      </div>
      <div id="audioMissingNote"></div>
      <audio id="letterAudio" preload="none">
        ${audioSourcesFor(letter.id).map((src) => `<source src="${src}">`).join("")}
      </audio>

      <div class="audio-row" style="margin-top:22px">
        <button class="record-btn ${rt.recording ? "recording" : ""}" id="recordBtn">${rt.recording ? "■" : "🎤"}</button>
      </div>
      <div style="font-size:12px;color:var(--color-ink-soft)">${rt.recording ? t("stopRecording") : t("record")}</div>
      ${hasRecording ? `<button class="btn secondary" id="playRecBtn" style="margin-top:12px">▶ ${t("playRecording")}</button>` : ""}
    </div>
    <div class="flash-controls" style="margin-top:18px">
      <button class="btn secondary" id="lrPrev" ${rt.index === 0 ? "disabled" : ""}>‹ ${t("previous")}</button>
      <button class="btn" id="lrNext">${rt.index === LETTERS.length - 1 ? t("finishLevel") : t("next")} ›</button>
    </div>
  `;

  document.getElementById("playBtn").addEventListener("click", () => {
    const audioEl = document.getElementById("letterAudio");
    document.getElementById("audioMissingNote").innerHTML = "";
    audioEl.play().catch(() => {
      document.getElementById("audioMissingNote").innerHTML = `<div class="audio-missing-note">${t("audioMissing")}</div>`;
    });
  });
  document.getElementById("letterAudio").addEventListener("error", () => {
    document.getElementById("audioMissingNote").innerHTML = `<div class="audio-missing-note">${t("audioMissing")}</div>`;
  });

  document.getElementById("recordBtn").addEventListener("click", () => toggleRecording(letter));
  document.getElementById("playRecBtn")?.addEventListener("click", async () => {
    const rec = await DB.getRecording(STATE.activeStudentId, `${rt.ns}:${letter.id}`);
    if (rec?.blob) new Audio(URL.createObjectURL(rec.blob)).play();
  });

  document.getElementById("lrPrev").addEventListener("click", () => { rt.index = Math.max(0, rt.index - 1); renderListenRepeat(); });
  document.getElementById("lrNext").addEventListener("click", () => {
    if (rt.index === LETTERS.length - 1) { rt.onComplete(100); return; }
    rt.index++; renderListenRepeat();
  });
}

async function toggleRecording(letter) {
  const rt = STATE.runtime.lr;
  if (!rt.recording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rt.chunks = [];
      rt.mediaRecorder = new MediaRecorder(stream);
      rt.mediaRecorder.ondataavailable = (e) => rt.chunks.push(e.data);
      rt.mediaRecorder.onstop = async () => {
        const blob = new Blob(rt.chunks, { type: "audio/webm" });
        await DB.saveRecording(STATE.activeStudentId, `${rt.ns}:${letter.id}`, blob);
        rt.recorded[letter.id] = true;
        stream.getTracks().forEach((tr) => tr.stop());
        renderListenRepeat();
      };
      rt.mediaRecorder.start();
      rt.recording = true;
      renderListenRepeat();
    } catch (e) {
      toast(t("audioMissing"));
    }
  } else {
    rt.mediaRecorder.stop();
    rt.recording = false;
  }
}

// -----------------------------------------------------------------------
// Fin de séance : badge + proposition de diplôme (quand les 5 matières
// sont validées)
// -----------------------------------------------------------------------
async function onSessionCompleted(sessionId) {
  const session = SESSIONS.find((s) => s.id === sessionId);
  const studentId = STATE.activeStudentId;
  const badgeId = `session_${sessionId}`;
  if (!STATE.badges.find((b) => b.id === badgeId)) {
    await DB.unlockBadge(studentId, badgeId);
    STATE.badges.push({ id: badgeId, unlockedAt: Date.now() });
  }
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="empty-state" style="padding:10px 0 4px">
      <div class="star8 done" style="margin:0 auto 14px">✓</div>
      <h2 class="display">${t("levelComplete")}</h2>
      <p>${t("levelCompleteMsg")}</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px">
        <button class="btn gold" id="getDiplomaBtn">🏅 ${t("getDiploma")}</button>
        <button class="btn secondary" id="continueBtn">${t("continueJourney")}</button>
      </div>
    </div>
  `);
  document.getElementById("continueBtn").addEventListener("click", () => { closeModal(); go("#/home"); });
  document.getElementById("getDiplomaBtn").addEventListener("click", () => openDiplomaLangPicker(session));
}

function openDiplomaLangPicker(session) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center">${t("diplomaLangChoose")}</h3>
    <div class="lang-row">
      ${["fr", "en", "it"].map((l) => `<button data-dlang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
    </div>
    <button class="btn gold block" id="confirmDiplomaBtn">🏅 ${t("getDiploma")}</button>
  `);
  let chosen = STATE.settings.language;
  document.querySelectorAll("[data-dlang]").forEach((btn) =>
    btn.addEventListener("click", () => {
      chosen = btn.dataset.dlang;
      document.querySelectorAll("[data-dlang]").forEach((b) => b.classList.toggle("active", b === btn));
    })
  );
  document.getElementById("confirmDiplomaBtn").addEventListener("click", async () => {
    document.getElementById("confirmDiplomaBtn").textContent = "…";
    const diploma = await createDiplomaForSession(session, chosen);
    STATE.diplomas.push(diploma);
    closeModal();
    go("#/home");
    toast(t("levelComplete"));
    setTimeout(() => downloadDiploma(diploma), 300);
  });
}

// -----------------------------------------------------------------------
// Progrès & badges
// -----------------------------------------------------------------------
function renderProgress() {
  const totalCompleted = SESSIONS.filter((s) => isSessionCompleted(s.id)).length;
  const overallPct = Math.round((totalCompleted / SESSIONS.length) * 100);
  const badgeGrid = BADGES.map((b) => {
    const unlocked = STATE.badges.some((ub) => ub.id === b.id);
    const session = SESSIONS.find((s) => s.id === b.sessionId);
    return `
      <div class="badge ${unlocked ? "unlocked" : ""}">
        <div class="star8 ${unlocked ? "done" : ""}">${unlocked ? "✓" : session.id}</div>
        <span>${sessionTitle(session)}</span>
      </div>`;
  }).join("");

  return `
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <b>${t("sessionsCompleted")}</b><span>${totalCompleted}/${SESSIONS.length}</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${overallPct}%;background:var(--color-primary)"></div></div>
    </div>
    <button class="btn gold block" id="openBulletinBtn" style="margin-bottom:20px">📋 ${t("generateBulletin")}</button>
    <div class="section-title">${t("badges_title")}</div>
    <div class="badge-grid">${badgeGrid}</div>
  `;
}
function attachProgressHandlers() {
  document.getElementById("openBulletinBtn")?.addEventListener("click", openBulletinModal);
}

function openBulletinModal() {
  const reachable = SESSIONS.filter((s) => !sessionLocked(s.id));
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("generateBulletin")}</h3>

    <div class="field" style="margin-bottom:14px">
      <label>${t("bulletinType")}</label>
      <select id="bulletinType">
        <option value="cumulative">${t("bulletinCumulative")}</option>
        <option value="session">${t("bulletinSession")}</option>
      </select>
    </div>
    <div class="field" id="bulletinSessionField" style="margin-bottom:14px;display:none">
      <label>${t("chooseSession")}</label>
      <select id="bulletinSessionId">
        ${reachable.map((s) => `<option value="${s.id}">${sessionTitle(s)}</option>`).join("")}
      </select>
    </div>

    <div class="lang-row">
      ${["fr", "en", "it"].map((l) => `<button data-blang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
    </div>

    <div class="field" style="margin:14px 0 14px">
      <label>${t("teacherComment")}</label>
      <textarea id="bulletinComment" rows="3" placeholder="${t("teacherCommentPlaceholder")}"
        style="padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:14px;font-family:inherit;resize:vertical"></textarea>
    </div>
    <div class="field" style="margin:0 0 18px">
      <label>${t("observationsGenerales")}</label>
      <textarea id="bulletinObservations" rows="3" placeholder="${t("observationsPlaceholder")}"
        style="padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:14px;font-family:inherit;resize:vertical"></textarea>
    </div>

    <button class="btn gold block" id="confirmBulletinBtn">📋 ${t("generateBulletin")}</button>
  `);

  let chosenLang = STATE.settings.language;
  document.getElementById("bulletinType").addEventListener("change", (e) => {
    document.getElementById("bulletinSessionField").style.display = e.target.value === "session" ? "block" : "none";
  });
  document.querySelectorAll("[data-blang]").forEach((btn) =>
    btn.addEventListener("click", () => {
      chosenLang = btn.dataset.blang;
      document.querySelectorAll("[data-blang]").forEach((b) => b.classList.toggle("active", b === btn));
    })
  );
  document.getElementById("confirmBulletinBtn").addEventListener("click", async () => {
    const type = document.getElementById("bulletinType").value;
    const sessionId = type === "session" ? Number(document.getElementById("bulletinSessionId").value) : null;
    const comment = document.getElementById("bulletinComment").value.trim();
    const observations = document.getElementById("bulletinObservations").value.trim();
    document.getElementById("confirmBulletinBtn").textContent = "…";
    const { dataUrl, pngDataUrl, filename, studentName } = await generateBulletin(type, sessionId, chosenLang, comment, observations);
    closeModal();
    openModal(`
      <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
      <h3 class="display" style="text-align:center;margin-bottom:14px">${studentName}</h3>
      <button class="btn secondary block" id="bullDownloadPdfBtn" style="margin-bottom:10px">⬇ ${t("downloadPDF")}</button>
      ${pngDataUrl ? `<button class="btn gold block" id="bullDownloadPngBtn" style="margin-bottom:10px">⬇ ${t("downloadPNG")}</button>` : ""}
      <button class="btn secondary block" id="bullShareBtn">📤 ${t("shareReceipt")}</button>
    `);
    document.getElementById("bullDownloadPdfBtn").addEventListener("click", () => { downloadFile(dataUrl, `${filename}.pdf`); closeModal(); });
    document.getElementById("bullDownloadPngBtn")?.addEventListener("click", () => { downloadFile(pngDataUrl, `${filename}.png`); closeModal(); });
    document.getElementById("bullShareBtn").addEventListener("click", async () => { await shareFile(dataUrl, `${filename}.pdf`, `${t("generateBulletin")} — ${studentName}`); closeModal(); });
  });
}

// -----------------------------------------------------------------------
// Diplômes
// -----------------------------------------------------------------------
function renderDiplomas() {
  if (!STATE.diplomas.length) {
    return `<div class="empty-state"><div class="star8">❖</div><p>${t("diplomas_empty")}</p></div>`;
  }
  const categories = [
    { key: "session", label: t("categoryReading"), icon: "🏅" },
    { key: "juz", label: t("categoryJuz"), icon: "📖" },
    { key: "khatm", label: t("categoryKhatm"), icon: "🏆" },
  ];
  const grouped = categories.map((cat) => ({
    ...cat,
    diplomas: STATE.diplomas.filter((d) => (d.category || "session") === cat.key).sort((a, b) => b.issuedAt - a.issuedAt),
  })).filter((g) => g.diplomas.length);

  return grouped.map((g) => `
    <div class="section-title">${g.label}</div>
    ${g.diplomas.map((d) => `
      <div class="diploma-item" data-id="${d.id}">
        <div class="icon">${g.icon}</div>
        <div class="meta">
          <div class="title">${d.levelTitle}</div>
          <div class="sub">${d.studentName} · ${new Date(d.issuedAt).toLocaleDateString()}</div>
        </div>
        <button class="icon-btn" data-dl="${d.id}">⬇</button>
      </div>
    `).join("")}
  `).join("");
}
function attachDiplomaHandlers() {
  document.querySelectorAll("[data-dl]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const d = STATE.diplomas.find((x) => x.id === btn.dataset.dl);
      if (d) openDiplomaFormatModal(d);
    })
  );
}

function openDiplomaFormatModal(diploma) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${diploma.levelTitle}</h3>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn secondary block" id="dDownloadPdfBtn">⬇ ${t("downloadPDF")}</button>
      <button class="btn gold block" id="dDownloadPngBtn">⬇ ${t("downloadPNG")}</button>
      <button class="btn secondary block" id="dShareBtn">📤 ${t("shareReceipt")}</button>
    </div>
  `);
  document.getElementById("dDownloadPdfBtn").addEventListener("click", () => {
    downloadDiploma(diploma);
    closeModal();
  });
  document.getElementById("dDownloadPngBtn").addEventListener("click", () => {
    if (!downloadDiplomaPng(diploma)) toast(t("pngUnavailable"));
    else closeModal();
  });
  document.getElementById("dShareBtn").addEventListener("click", async () => {
    await shareDiploma(diploma);
    closeModal();
  });
}

// -----------------------------------------------------------------------
// Réglages
// -----------------------------------------------------------------------
// Bannière d'alerte affichée si aucune sauvegarde n'a jamais été faite, ou
// si la dernière sauvegarde commence à dater — pour éviter une perte totale
// de données en cas de manipulation risquée (vidage du stockage du
// navigateur, changement de téléphone, désinstallation...).
function renderBackupReminderBanner() {
  const last = STATE.settings.lastExportedAt;
  const daysSince = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (last && daysSince < 3) return "";
  const msg = last ? t("backupReminderStale", daysSince) : t("backupReminderNever");
  return `
    <div class="card" style="margin-bottom:16px;border:1px solid var(--color-accent);background:rgba(200,155,60,0.12)">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="font-size:20px">⚠️</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${t("backupReminderTitle")}</div>
          <div style="font-size:12.5px;color:var(--color-ink-soft);margin-bottom:10px">${msg}</div>
          <button class="btn gold" id="bannerExportBtn" style="padding:8px 16px;font-size:12.5px">⬇ ${t("exportData")}</button>
        </div>
      </div>
    </div>
  `;
}
function attachBackupReminderBannerHandler() {
  document.getElementById("bannerExportBtn")?.addEventListener("click", async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seyda_zeynab_backup_${Date.now()}.json`;
    a.click();
    STATE.settings.lastExportedAt = Date.now();
    await DB.saveSettings(STATE.settings);
    toast(t("backupSavedToast"));
    renderShell(STATE.route === "#/settings" ? renderSettings() : renderHome());
  });
}

function renderSettings() {
  return `
    ${renderBackupReminderBanner()}
    <div class="section-title">${t("myStudents")}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px">
      ${STATE.students.map((s) => `
        <div class="path-item" style="background:var(--color-surface);box-shadow:var(--shadow-card)">
          <button data-select-student="${s.id}" style="all:unset;display:flex;align-items:center;gap:14px;flex:1;cursor:pointer">
            <div class="star8 ${s.id === STATE.activeStudentId ? "done" : ""}">${s.id === STATE.activeStudentId ? "✓" : "👤"}</div>
            <div class="meta"><div class="title">${s.fullName}</div></div>
          </button>
          <button class="icon-btn" data-delete-student-settings="${s.id}" data-name="${s.fullName}">🗑️</button>
        </div>
      `).join("")}
    </div>
    <button class="btn secondary block" id="addStudentSettingsBtn" style="margin-bottom:20px">+ ${t("addStudent")}</button>

    <div class="section-title">${t("settings_language")}</div>
    <div class="lang-row">
      ${["fr", "en", "it"].map((l) => `<button data-setlang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
    </div>

    <div class="section-title">${t("settings_theme")}</div>
    <div class="lang-row">
      <button data-settheme="light" class="${STATE.settings.theme !== "dark" ? "active" : ""}">${t("theme_light")}</button>
      <button data-settheme="dark" class="${STATE.settings.theme === "dark" ? "active" : ""}">${t("theme_dark")}</button>
    </div>

    <div class="section-title">${t("settings_backup")}</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn secondary block" id="exportBtn">⬇ ${t("exportData")}</button>
      <label class="btn secondary block" style="text-align:center;cursor:pointer">
        ⬆ ${t("importData")}
        <input type="file" id="importInput" accept="application/json" style="display:none" />
      </label>
    </div>

    <div class="section-title">${t("academySettings")}</div>
    <button class="btn secondary block" id="openPaymentSettingsBtn" style="margin-bottom:20px">💳 ${t("academySettings")}</button>

    <div class="section-title">${t("discoverSpace")}</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
      <button class="btn secondary block" data-go="#/discover">👀 ${t("previewDiscover")}</button>
      <button class="btn secondary block" data-go="#/registrations">📋 ${t("nav_registrations")}</button>
      <button class="btn secondary block" id="editDiscoverBtn">✏️ ${t("editDiscoverContent")}</button>
      <button class="btn secondary block" id="editCountryPricingBtn">💰 ${t("editCountryPricing")}</button>
    </div>

    <div class="section-title">${t("teacherSpace")}</div>
    <button class="btn secondary block" data-go="#/teacher" style="margin-bottom:20px">🗂️ ${t("teacherHubTitle")}</button>
  `;
}
function attachSettingsHandlers() {
  document.getElementById("openPaymentSettingsBtn").addEventListener("click", openPaymentSettingsModal);
  document.getElementById("editDiscoverBtn").addEventListener("click", openEditDiscoverModal);
  document.getElementById("editCountryPricingBtn").addEventListener("click", openEditCountryPricingModal);
  document.querySelectorAll("[data-select-student]").forEach((btn) =>
    btn.addEventListener("click", () => switchActiveStudent(btn.dataset.selectStudent))
  );
  document.querySelectorAll("[data-delete-student-settings]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const studentId = btn.dataset.deleteStudentSettings;
      const name = btn.dataset.name;
      openConfirmModal(
        t("deleteStudentTitle"),
        t("deleteStudentMsg", name),
        async () => {
          const wasActive = studentId === STATE.activeStudentId;
          await DB.deleteStudentCascade(studentId);
          closeModal();
          toast(t("deleted"));
          if (wasActive) {
            await loadStudentsAndActiveData(null);
            go(STATE.student ? "#/home" : "#/onboarding");
          } else {
            await loadStudentsAndActiveData(STATE.activeStudentId);
            route();
          }
        }
      );
    })
  );
  document.getElementById("addStudentSettingsBtn").addEventListener("click", openAddStudentModal);
  document.querySelectorAll("[data-setlang]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      STATE.settings.language = btn.dataset.setlang;
      await DB.saveSettings(STATE.settings);
      route();
    })
  );
  document.querySelectorAll("[data-settheme]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      STATE.settings.theme = btn.dataset.settheme;
      applyTheme();
      await DB.saveSettings(STATE.settings);
      route();
    })
  );
  document.getElementById("exportBtn").addEventListener("click", async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seyda_zeynab_backup_${Date.now()}.json`;
    a.click();
    STATE.settings.lastExportedAt = Date.now();
    await DB.saveSettings(STATE.settings);
    toast(t("backupSavedToast"));
  });
  document.getElementById("importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      await DB.importAll(data);
      toast("OK");
      location.reload();
    } catch (err) { toast("Erreur / Error"); }
  });
}

function openEditDiscoverModal() {
  const draft = JSON.parse(JSON.stringify(STATE.settings.discover));
  const flags = { fr: "🇫🇷", en: "🇬🇧", it: "🇮🇹", ar: "🇸🇦" };
  let activeLang = STATE.settings.language && DISCOVER_LANGS.includes(STATE.settings.language) ? STATE.settings.language : "fr";

  function readCurrentTabIntoDraft() {
    draft.description[activeLang] = document.getElementById("dDescription").value.trim();
    draft.subjects[activeLang] = document.getElementById("dSubjects").value.split("\n").map((s) => s.trim()).filter(Boolean);
    draft.courseFlow[activeLang] = document.getElementById("dFlow").value.trim();
    draft.scheduleSlots[activeLang] = document.getElementById("dSlots").value.split("\n").map((s) => s.trim()).filter(Boolean).map((label) => ({ label, available: true }));
    draft.rules[activeLang] = document.getElementById("dRules").value.split("\n").map((s) => s.trim()).filter(Boolean);
    draft.faq[activeLang] = document.getElementById("dFaq").value.split("\n").map((s) => s.trim()).filter(Boolean).map((line) => {
      const [q, a] = line.split("|").map((s) => s.trim());
      return { q: q || "", a: a || "" };
    });
  }

  function renderModal() {
    const d = draft;
    const ta = "style=\"padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:14px;font-family:inherit;resize:vertical;width:100%\"";
    openModal(`
      <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
      <h3 class="display" style="text-align:center;margin-bottom:10px">${t("editDiscoverContent")}</h3>
      <div style="display:flex;gap:6px;margin-bottom:14px;justify-content:center;flex-wrap:wrap">
        ${DISCOVER_LANGS.map((l) => `<button class="btn secondary" data-lang-tab="${l}" style="padding:8px 14px;font-size:13px;${l === activeLang ? "background:var(--color-primary);color:#fff" : ""}">${flags[l]} ${l.toUpperCase()}</button>`).join("")}
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("sectionAbout", activeLang)}</label>
        <textarea id="dDescription" rows="3" ${ta}>${d.description[activeLang] || ""}</textarea>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("sectionSubjects", activeLang)} (${t("oneLinePerItem")})</label>
        <textarea id="dSubjects" rows="4" ${ta}>${(d.subjects[activeLang] || []).join("\n")}</textarea>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("sectionFlow", activeLang)}</label>
        <textarea id="dFlow" rows="3" ${ta}>${d.courseFlow[activeLang] || ""}</textarea>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("sectionSchedule", activeLang)} (${t("oneLinePerItem")})</label>
        <textarea id="dSlots" rows="3" ${ta}>${(d.scheduleSlots[activeLang] || []).map((s) => s.label).join("\n")}</textarea>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("sectionRules", activeLang)} (${t("oneLinePerItem")})</label>
        <textarea id="dRules" rows="4" ${ta}>${(d.rules[activeLang] || []).join("\n")}</textarea>
      </div>
      <div class="field" style="margin-bottom:18px">
        <label>${dt("sectionFaq", activeLang)} (${t("formatFaq")})</label>
        <textarea id="dFaq" rows="4" ${ta}>${(d.faq[activeLang] || []).map((f) => `${f.q} | ${f.a}`).join("\n")}</textarea>
      </div>
      <button class="btn gold block" id="confirmDiscoverEditBtn">${t("savePaymentSettingsBtn")}</button>
    `);
    document.querySelectorAll("[data-lang-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        readCurrentTabIntoDraft();
        activeLang = btn.dataset.langTab;
        renderModal();
      })
    );
    document.getElementById("confirmDiscoverEditBtn").addEventListener("click", async () => {
      readCurrentTabIntoDraft();
      STATE.settings.discover = draft;
      await DB.saveSettings(STATE.settings);
      closeModal();
      toast("OK");
    });
  }
  renderModal();
}

// Édition des tarifs par pays (Sénégal/France/États-Unis/Italie), en texte
// simple : une ligne d'en-tête par pays (CODE >>> Nom >>> Devise), suivie
// d'une ligne par formule (Nom >>> Montant >>> Fréquence >>> Description).
// Les noms/descriptions de formules ne sont volontairement PAS traduits
// automatiquement (l'enseignante les rédige elle-même), contrairement au
// reste du contenu qui suit la langue choisie par le visiteur.
function openEditCountryPricingModal() {
  const c = STATE.settings.discover;
  const lines = [];
  DISCOVER_COUNTRIES.forEach((cc) => {
    const cd = c.countries[cc] || { label: cc, currency: "", plans: [] };
    lines.push(`${cc} >>> ${cd.label} >>> ${cd.currency}`);
    cd.plans.forEach((p) => lines.push(`${p.name} >>> ${p.amount} >>> ${p.frequency} >>> ${p.description}`));
    lines.push("");
  });
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:10px">${t("editCountryPricing")}</h3>
    <p class="subject-note" style="margin-bottom:10px;font-size:12.5px">${t("formatCountries")}</p>
    <textarea id="dCountries" rows="18" style="padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:12.5px;font-family:monospace;resize:vertical;width:100%">${lines.join("\n")}</textarea>
    <button class="btn gold block" id="confirmCountryPricingBtn" style="margin-top:14px">${t("savePaymentSettingsBtn")}</button>
  `);
  document.getElementById("confirmCountryPricingBtn").addEventListener("click", async () => {
    const raw = document.getElementById("dCountries").value.split("\n");
    const countries = {};
    let currentCode = null;
    raw.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const parts = line.split(">>>").map((s) => s.trim());
      if (parts.length === 3 && /^[A-Za-z]{2}$/.test(parts[0])) {
        currentCode = parts[0].toUpperCase();
        countries[currentCode] = { label: parts[1] || currentCode, currency: parts[2] || "", plans: [] };
      } else if (currentCode && parts.length >= 3) {
        countries[currentCode].plans.push({
          name: parts[0] || "", amount: parts[1] || "", frequency: parts[2] || "", description: parts[3] || "",
        });
      }
    });
    if (Object.keys(countries).length === 0) { toast(t("invalidFormat")); return; }
    STATE.settings.discover.countries = countries;
    await DB.saveSettings(STATE.settings);
    closeModal();
    toast("OK");
  });
}

function openPaymentSettingsModal() {
  const ps = STATE.settings.payment;
  let activeLang = STATE.settings.language && ["fr", "en", "it"].includes(STATE.settings.language) ? STATE.settings.language : "fr";
  const flags = { fr: "🇫🇷", en: "🇬🇧", it: "🇮🇹" };
  const draftTexts = {
    receiptQuote: { ...ps.receiptQuote },
    receiptQuoteAuthor: { ...ps.receiptQuoteAuthor },
    receiptThanks: { ...ps.receiptThanks },
    receiptWish: { ...ps.receiptWish },
  };

  function readCurrentTabIntoDraft() {
    draftTexts.receiptQuote[activeLang] = document.getElementById("psQuote").value.trim();
    draftTexts.receiptQuoteAuthor[activeLang] = document.getElementById("psQuoteAuthor").value.trim();
    draftTexts.receiptThanks[activeLang] = document.getElementById("psThanks").value.trim();
    draftTexts.receiptWish[activeLang] = document.getElementById("psWish").value.trim();
  }

  function renderModal() {
    openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("academySettings")}</h3>

    <div class="field" style="margin-bottom:12px">
      <label>${t("academyWhatsapp")}</label>
      <input id="psWhatsapp" value="${ps.whatsapp || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("academyPhone")}</label>
      <input id="psPhone" value="${ps.phone || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("academyEmail")}</label>
      <input id="psEmail" value="${ps.email || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("academyAddress")}</label>
      <input id="psAddress" value="${ps.address || ""}" />
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("academyWebsite")}</label>
      <input id="psWebsite" value="${ps.website || ""}" />
    </div>

    <div class="section-title" style="margin-top:0">${t("receiptTexts")}</div>
    <p class="subject-note" style="font-size:12px;margin-bottom:10px">${t("receiptTextsPerLangNote")}</p>
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${["fr", "en", "it"].map((l) => `<button class="btn secondary" data-ps-lang-tab="${l}" style="padding:8px 14px;font-size:13px;${l === activeLang ? "background:var(--color-primary);color:#fff" : ""}">${flags[l]} ${l.toUpperCase()}</button>`).join("")}
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("receiptQuoteLabel")}</label>
      <input id="psQuote" value="${draftTexts.receiptQuote[activeLang] || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("receiptQuoteAuthorLabel")}</label>
      <input id="psQuoteAuthor" value="${draftTexts.receiptQuoteAuthor[activeLang] || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("receiptThanksLabel")}</label>
      <input id="psThanks" value="${draftTexts.receiptThanks[activeLang] || ""}" />
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("receiptWishLabel")}</label>
      <input id="psWish" value="${draftTexts.receiptWish[activeLang] || ""}" />
    </div>

    <div class="section-title" style="margin-top:0">${t("currenciesLabel")}</div>
    <div class="field" style="margin-bottom:18px">
      <input id="psCurrencies" value="${ps.currencies.join(", ")}" placeholder="FCFA, USD, EUR" />
    </div>
    <div class="section-title" style="margin-top:0">${t("paymentMethodsLabel")}</div>
    <div class="field" style="margin-bottom:18px">
      <input id="psMethods" value="${ps.paymentMethods.join(", ")}" placeholder="Wave, Orange Money, Espèces" />
    </div>

    <button class="btn gold block" id="confirmPaymentSettingsBtn">${t("savePaymentSettingsBtn")}</button>
  `);
    document.querySelectorAll("[data-ps-lang-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        readCurrentTabIntoDraft();
        activeLang = btn.dataset.psLangTab;
        renderModal();
      })
    );
    document.getElementById("confirmPaymentSettingsBtn").addEventListener("click", async () => {
      readCurrentTabIntoDraft();
      Object.assign(STATE.settings.payment, {
        whatsapp: document.getElementById("psWhatsapp").value.trim(),
        phone: document.getElementById("psPhone").value.trim(),
        email: document.getElementById("psEmail").value.trim(),
        address: document.getElementById("psAddress").value.trim(),
        website: document.getElementById("psWebsite").value.trim(),
        receiptQuote: draftTexts.receiptQuote,
        receiptQuoteAuthor: draftTexts.receiptQuoteAuthor,
        receiptThanks: draftTexts.receiptThanks,
        receiptWish: draftTexts.receiptWish,
        currencies: document.getElementById("psCurrencies").value.split(",").map((s) => s.trim()).filter(Boolean),
        paymentMethods: document.getElementById("psMethods").value.split(",").map((s) => s.trim()).filter(Boolean),
      });
      await savePaymentSettings();
      closeModal();
      toast("OK");
    });
  }
  renderModal();
}

// =============================================================================
// MODULE PAIEMENT — fusionné depuis l'application de paiement existante.
// Liste des paiements (élèves + familles), fiche de facturation détaillée,
// gestion des familles. Le calcul (cycles, pauses, statut) vit dans
// billing.js ; la génération des reçus vit dans receipt.js.
// =============================================================================

async function ensureBillingEntitiesLoaded() {
  if (STATE.billingEntitiesLoaded) return;
  STATE.billingEntities = await loadAllBillingEntities();
  STATE.billingEntitiesLoaded = true;
}
function invalidateBillingCache() {
  STATE.billingEntitiesLoaded = false;
}

function renderPaymentsList() {
  if (!STATE.billingEntitiesLoaded) {
    ensureBillingEntitiesLoaded().then(() => { if (STATE.route === "#/payments") renderShell(renderPaymentsList()); });
    return `<div class="empty-state"><div class="star8">💳</div><p>…</p></div>`;
  }
  const entities = STATE.billingEntities;
  const unbilledStudents = STATE.students.filter((s) => !entities.some((e) => e.kind === "individual" && e.refId === s.id));

  const withStatus = entities.map((e) => ({ e, st: computeBillingStatus(e) }));
  const countUpToDate = withStatus.filter(({ st }) => st.status === "paid").length;
  const countLate = withStatus.filter(({ st }) => st.status === "unpaid" || st.status === "partial").length;
  const countPaused = withStatus.filter(({ st }) => st.status === "paused").length;

  const statusFilter = STATE.runtime.paymentsStatusFilter || "all";
  const countryFilter = STATE.runtime.paymentsCountryFilter || "all";
  const search = (STATE.runtime.paymentsSearch || "").trim().toLowerCase();

  const statusOrder = { unpaid: 0, partial: 1, pending: 2, paused: 3, paid: 4 };
  let filtered = withStatus.slice();
  if (statusFilter !== "all") filtered = filtered.filter(({ st }) => st.status === statusFilter);
  if (countryFilter !== "all") filtered = filtered.filter(({ e }) => (e.country || "") === countryFilter);
  if (search) filtered = filtered.filter(({ e }) => e.name.toLowerCase().includes(search));
  filtered.sort((a, b) => (statusOrder[a.st.status] ?? 9) - (statusOrder[b.st.status] ?? 9));

  const statusChips = [
    ["all", t("filterAll")], ["paid", billingStatusLabel("paid")], ["partial", billingStatusLabel("partial")],
    ["unpaid", billingStatusLabel("unpaid")], ["paused", billingStatusLabel("paused")], ["pending", billingStatusLabel("pending")],
  ];
  const countriesPresent = DISCOVER_COUNTRIES.filter((cc) => entities.some((e) => e.country === cc));

  const rows = filtered
    .map(({ e, st }) => `
      <button class="path-item" data-entity="${e.id}" style="background:var(--color-surface);box-shadow:var(--shadow-card)">
        <div class="star8 ${st.status === "paid" ? "done" : st.status === "unpaid" ? "" : "active"}">${e.kind === "family" ? "👪" : "👤"}</div>
        <div class="meta">
          <div class="title" style="display:flex;align-items:center;gap:8px">${e.kind === "individual" ? avatarHtml(e.name, studentPhotoById(e.refId), 24) : ""}${e.name}${e.country ? ` <span style="font-size:11px;color:var(--color-ink-soft)">· ${STATE.settings.discover.countries[e.country]?.label || e.country}</span>` : ""}</div>
          <div class="sub">${e.amount} ${e.currency} · <span class="pay-status pay-status-${st.status}">${billingStatusLabel(st.status)}</span></div>
        </div>
        <div class="chev">›</div>
      </button>`).join("");

  const unbilledHtml = unbilledStudents.length ? `
    <div class="section-title">${t("billingIndividual")}</div>
    ${unbilledStudents.map((s) => `
      <button class="path-item" data-setup-billing="${s.id}" style="background:var(--color-surface-2)">
        <div class="star8">👤</div>
        <div class="meta"><div class="title">${s.fullName}</div><div class="sub">${t("saveBilling")}</div></div>
        <div class="chev">›</div>
      </button>`).join("")}
  ` : "";

  return `
    <div class="section-title">${t("paymentsTitle")}</div>
    <div class="card" style="display:flex;justify-content:space-around;text-align:center;margin-bottom:16px">
      <div><div style="font-size:20px;font-weight:700;color:var(--color-success)">${countUpToDate}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statUpToDate")}</div></div>
      <div><div style="font-size:20px;font-weight:700;color:var(--color-danger)">${countLate}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statLate")}</div></div>
      <div><div style="font-size:20px;font-weight:700">${countPaused}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statPaused")}</div></div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
      <button class="btn gold block" id="quickPaymentBtn">⚡ ${t("quickPayment")}</button>
      <div style="display:flex;gap:8px">
        <button class="btn secondary" data-go="#/payments/finance" style="flex:1;padding:9px;font-size:12.5px">📊 ${t("financeOverview")}</button>
        <button class="btn secondary" data-go="#/payments/history" style="flex:1;padding:9px;font-size:12.5px">🕘 ${t("paymentsHistory")}</button>
      </div>
    </div>

    <div class="field" style="margin-bottom:12px">
      <input id="paymentsSearchInput" placeholder="🔎 ${t("paymentsSearchPlaceholder")}" value="${STATE.runtime.paymentsSearch || ""}" />
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${countriesPresent.length ? "8px" : "16px"}">
      ${statusChips.map(([key, label]) => `<button class="btn secondary" data-status-filter="${key}" style="padding:6px 12px;font-size:12px;${statusFilter === key ? "background:var(--color-primary);color:#fff" : ""}">${label}</button>`).join("")}
    </div>
    ${countriesPresent.length ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn secondary" data-country-filter="all" style="padding:6px 12px;font-size:12px;${countryFilter === "all" ? "background:var(--color-accent);color:#fff" : ""}">${t("filterAll")}</button>
        ${countriesPresent.map((cc) => `<button class="btn secondary" data-country-filter="${cc}" style="padding:6px 12px;font-size:12px;${countryFilter === cc ? "background:var(--color-accent);color:#fff" : ""}">${STATE.settings.discover.countries[cc]?.label || cc}</button>`).join("")}
      </div>
    ` : ""}

    ${rows || `<div class="empty-state"><div class="star8">💳</div><p>${t("noBillingEntities")}</p></div>`}
    ${unbilledHtml}
    <button class="btn secondary block" id="manageFamiliesBtn" style="margin-top:20px">👪 ${t("manageFamilies")}</button>
  `;
}
function attachPaymentsListHandlers() {
  document.querySelectorAll("[data-entity]").forEach((btn) =>
    btn.addEventListener("click", () => go(`#/payment/${encodeURIComponent(btn.dataset.entity)}`))
  );
  document.querySelectorAll("[data-setup-billing]").forEach((btn) =>
    btn.addEventListener("click", () => go(`#/payment/${encodeURIComponent("s_" + btn.dataset.setupBilling)}`))
  );
  document.getElementById("manageFamiliesBtn")?.addEventListener("click", () => go("#/families"));
  document.getElementById("quickPaymentBtn")?.addEventListener("click", openQuickPaymentPicker);
  document.getElementById("paymentsSearchInput")?.addEventListener("input", (e) => {
    STATE.runtime.paymentsSearch = e.target.value;
    renderShell(renderPaymentsList());
    attachPaymentsListHandlers();
  });
  document.querySelectorAll("[data-status-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.paymentsStatusFilter = btn.dataset.statusFilter;
      renderShell(renderPaymentsList());
      attachPaymentsListHandlers();
    })
  );
  document.querySelectorAll("[data-country-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.paymentsCountryFilter = btn.dataset.countryFilter;
      renderShell(renderPaymentsList());
      attachPaymentsListHandlers();
    })
  );
}

// Paiement rapide : choisir directement un élève/famille déjà facturé pour
// enregistrer un paiement en 2 taps, sans passer par sa fiche complète.
function openQuickPaymentPicker() {
  const entities = STATE.billingEntities.slice().sort((a, b) => a.name.localeCompare(b.name));
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("quickPayment")}</h3>
    <div class="field" style="margin-bottom:18px">
      <label>${t("quickPaymentChoose")}</label>
      <select id="qpEntity">
        <option value="">—</option>
        ${entities.map((e) => `<option value="${e.id}">${e.name} (${e.amount} ${e.currency})</option>`).join("")}
      </select>
    </div>
    <button class="btn gold block" id="qpConfirmBtn">${t("continueBtn")}</button>
  `);
  document.getElementById("qpConfirmBtn").addEventListener("click", () => {
    const entity = entities.find((e) => e.id === document.getElementById("qpEntity").value);
    if (!entity) { toast(t("scheduleMissingFields")); return; }
    closeModal();
    openRecordPaymentModal(entity);
  });
}

// =============================================================================
// TABLEAU FINANCIER — vue d'ensemble des revenus (#/payments/finance)
// =============================================================================
function computeFinanceOverview(entities) {
  const byCurrency = {};
  const byCountry = {};
  const nowMonth = periodKeyOf(new Date());
  entities.forEach((e) => {
    const st = computeBillingStatus(e);
    const cur = e.currency || "?";
    byCurrency[cur] = byCurrency[cur] || { collected: 0, collectedThisMonth: 0, pending: 0 };
    byCurrency[cur].collected += st.totalPaid;
    byCurrency[cur].pending += Math.max(0, st.totalDue - st.totalPaid);
    (e.payments || []).forEach((p) => {
      if (p.coversMonth === nowMonth) byCurrency[cur].collectedThisMonth += Number(p.amount) || 0;
    });
    if (e.country) {
      byCountry[e.country] = byCountry[e.country] || 0;
      byCountry[e.country] += st.totalPaid;
    }
  });
  return { byCurrency, byCountry };
}

function renderFinanceOverview() {
  if (!STATE.billingEntitiesLoaded) {
    ensureBillingEntitiesLoaded().then(() => { if (STATE.route === "#/payments/finance") renderShell(renderFinanceOverview()); });
    return `<div class="empty-state"><div class="star8">📊</div><p>…</p></div>`;
  }
  const { byCurrency, byCountry } = computeFinanceOverview(STATE.billingEntities);
  const currencies = Object.keys(byCurrency);
  const countries = Object.keys(byCountry);

  return `
    <div class="session-header">
      <h2 class="display">${t("financeOverview")}</h2>
      <button class="btn secondary" data-go="#/payments" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    ${currencies.length === 0 ? `<div class="empty-state"><p>${t("noBillingEntities")}</p></div>` : currencies.map((cur) => `
      <div class="card" style="margin-bottom:14px">
        <h3 class="display" style="margin-bottom:12px;font-size:16px">${cur}</h3>
        <div style="display:flex;justify-content:space-around;text-align:center">
          <div><div style="font-size:18px;font-weight:700;color:var(--color-success)">${byCurrency[cur].collectedThisMonth}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("financeThisMonth")}</div></div>
          <div><div style="font-size:18px;font-weight:700">${byCurrency[cur].collected}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("financeTotalCollected")}</div></div>
          <div><div style="font-size:18px;font-weight:700;color:var(--color-danger)">${byCurrency[cur].pending}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("financePending")}</div></div>
        </div>
      </div>
    `).join("")}
    ${countries.length ? `
      <div class="card">
        <h3 class="display" style="margin-bottom:12px;font-size:16px">${t("financeByCountry")}</h3>
        ${countries.map((cc) => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-surface-2);font-size:14px">
            <span>${STATE.settings.discover.countries[cc]?.label || cc}</span>
            <span style="font-weight:600">${byCountry[cc]}</span>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

// =============================================================================
// HISTORIQUE DES PAIEMENTS — tous les paiements, tous élèves confondus,
// triés du plus récent au plus ancien (#/payments/history)
// =============================================================================
function renderPaymentsHistory() {
  if (!STATE.billingEntitiesLoaded) {
    ensureBillingEntitiesLoaded().then(() => { if (STATE.route === "#/payments/history") renderShell(renderPaymentsHistory()); });
    return `<div class="empty-state"><div class="star8">🕘</div><p>…</p></div>`;
  }
  const search = (STATE.runtime.historySearch || "").trim().toLowerCase();
  const allPayments = [];
  STATE.billingEntities.forEach((e) => {
    (e.payments || []).forEach((p) => allPayments.push({ ...p, entityName: e.name }));
  });
  allPayments.sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? 1 : -1));
  const filtered = search
    ? allPayments.filter((p) => p.entityName.toLowerCase().includes(search) || (p.receiptNumber || "").toLowerCase().includes(search))
    : allPayments;

  return `
    <div class="session-header">
      <h2 class="display">${t("paymentsHistory")}</h2>
      <button class="btn secondary" data-go="#/payments" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <div class="field" style="margin-bottom:14px">
      <input id="historySearchInput" placeholder="🔎 ${t("paymentsSearchPlaceholder")}" value="${STATE.runtime.historySearch || ""}" />
    </div>
    ${filtered.length === 0 ? `<div class="empty-state"><p>${t("noBillingEntities")}</p></div>` : filtered.map((p) => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${p.entityName}</div>
            <div style="font-size:12px;color:var(--color-ink-soft)">${fmtMoneyDate(p.date)} · ${p.method || "—"} · ${p.receiptNumber || ""}</div>
          </div>
          <div style="font-weight:700">${p.amount} ${p.currency}</div>
        </div>
      </div>
    `).join("")}
  `;
}
function attachPaymentsHistoryHandlers() {
  document.getElementById("historySearchInput")?.addEventListener("input", (e) => {
    STATE.runtime.historySearch = e.target.value;
    renderShell(renderPaymentsHistory());
    attachPaymentsHistoryHandlers();
  });
}

function renderPaymentDetail(entityId) {
  if (!STATE.billingEntitiesLoaded) {
    ensureBillingEntitiesLoaded().then(() => { if (STATE.route === `#/payment/${entityId}`) renderShell(renderPaymentDetail(entityId)); });
    return `<div class="empty-state"><div class="star8">💳</div><p>…</p></div>`;
  }
  let entity = STATE.billingEntities.find((e) => e.id === entityId);
  if (!entity) {
    // Élève pas encore facturé : on construit une entité "brouillon" locale.
    const studentId = entityId.replace(/^s_/, "");
    const student = STATE.students.find((s) => s.id === studentId);
    if (!student) { setTimeout(() => go("#/payments"), 0); return ""; }
    const skeleton = newBillingSkeleton(studentId);
    entity = { kind: "individual", id: entityId, refId: studentId, name: student.fullName, members: [student], ...skeleton };
  }
  const st = computeBillingStatus(entity);

  const paymentsHtml = entity.payments.length
    ? [...entity.payments].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).map((p) => `
        <div class="diploma-item" data-payment="${p.id}">
          <div class="icon">💳</div>
          <div class="meta">
            <div class="title">${p.amount} ${p.currency} — ${p.coversMonth}</div>
            <div class="sub">${fmtMoneyDate(p.date)} · ${p.method || "—"}</div>
          </div>
          <button class="icon-btn" data-receipt="${p.id}">🧾</button>
          <button class="icon-btn" data-delete-payment="${p.id}" style="margin-left:6px">🗑️</button>
        </div>`).join("")
    : `<p class="subject-note">${t("noPaymentsYet")}</p>`;

  return `
    <div class="session-header">
      <h2 class="display">${entity.name}</h2>
      <button class="btn secondary" data-go="#/payments" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>${billingStatusLabel(st.status)}</b><span>${entity.amount} ${entity.currency} / mois</span>
      </div>
      <div class="hero-stats" style="color:var(--color-ink);margin-top:10px">
        <div><b>${st.monthsPaid}</b>${t("monthsPaid")}</div>
        <div><b>${st.monthsUnpaid}</b>${t("monthsUnpaid")}</div>
        <div><b>${st.totalPaid}</b>${t("totalPaid")}</div>
      </div>
    </div>

    <button class="btn gold block" id="recordPaymentBtn" style="margin-bottom:10px">💳 ${t("recordPayment")}</button>
    <button class="btn secondary block" id="editBillingBtn" style="margin-bottom:10px">✏️ ${t("saveBilling")}</button>
    <button class="btn secondary block" id="managePauseBtn" style="margin-bottom:10px">${entity.pause?.active ? "⏸ " + t("pauseActive") : "⏸ " + t("activatePauseBtn")}</button>
    <button class="btn secondary block" id="markUpToDateBtn" style="margin-bottom:20px">✅ ${t("markUpToDateBtn")}</button>

    <div class="section-title">${t("paymentHistory")}</div>
    ${paymentsHtml}

    ${entity.kind === "individual" ? `
      <div class="section-title">${t("dangerZone")}</div>
      <button class="btn block" id="deleteStudentBtn" style="background:var(--color-danger);margin-bottom:20px">🗑️ ${t("deleteStudentBtn")}</button>
    ` : ""}
  `;
}
function attachPaymentDetailHandlers(entityId) {
  const entity = STATE.billingEntities.find((e) => e.id === entityId) || (() => {
    const studentId = entityId.replace(/^s_/, "");
    const student = STATE.students.find((s) => s.id === studentId);
    return student ? { kind: "individual", id: entityId, refId: studentId, name: student.fullName, members: [student], ...newBillingSkeleton(studentId) } : null;
  })();
  if (!entity) return;

  document.getElementById("recordPaymentBtn")?.addEventListener("click", () => openRecordPaymentModal(entity));
  document.getElementById("editBillingBtn")?.addEventListener("click", () => openEditBillingModal(entity));
  document.getElementById("managePauseBtn")?.addEventListener("click", () => openPauseModal(entity));
  document.getElementById("markUpToDateBtn")?.addEventListener("click", () => {
    openConfirmModal(t("markUpToDateTitle"), t("markUpToDateMsg"), async () => {
      entity.startDate = todayISO();
      await saveEntityBilling(entity);
      invalidateBillingCache();
      closeModal();
      toast(t("markUpToDateToast"));
      go(`#/payment/${encodeURIComponent(entity.id)}`);
    });
  });
  document.querySelectorAll("[data-receipt]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const payment = entity.payments.find((p) => p.id === btn.dataset.receipt);
      if (payment) openReceiptLangModal(entity, payment);
    })
  );
  document.querySelectorAll("[data-delete-payment]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const payment = entity.payments.find((p) => p.id === btn.dataset.deletePayment);
      if (!payment) return;
      openConfirmModal(
        t("deletePaymentTitle"),
        t("deletePaymentMsg", `${payment.amount} ${payment.currency}`),
        async () => {
          entity.payments = entity.payments.filter((p) => p.id !== payment.id);
          await saveEntityBilling(entity);
          invalidateBillingCache();
          closeModal();
          go(`#/payment/${encodeURIComponent(entity.id)}`);
          toast(t("deleted"));
        }
      );
    })
  );
  document.getElementById("deleteStudentBtn")?.addEventListener("click", () => {
    openConfirmModal(
      t("deleteStudentTitle"),
      t("deleteStudentMsg", entity.name),
      async () => {
        const wasActive = entity.refId === STATE.activeStudentId;
        await DB.deleteStudentCascade(entity.refId);
        closeModal();
        toast(t("deleted"));
        if (wasActive) {
          await loadStudentsAndActiveData(null);
          go(STATE.student ? "#/home" : "#/onboarding");
        } else {
          await loadStudentsAndActiveData(STATE.activeStudentId);
          go("#/payments");
        }
      }
    );
  });
}

function openEditBillingModal(entity) {
  const currencies = STATE.settings.payment.currencies;
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("billingIndividual")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingAmount")}</label>
      <input id="billAmount" type="number" value="${entity.amount || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingCurrency")}</label>
      <select id="billCurrency">${currencies.map((c) => `<option value="${c}" ${c === entity.currency ? "selected" : ""}>${c}</option>`).join("")}</select>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingCountry")}</label>
      <select id="billCountry">
        <option value="">—</option>
        ${DISCOVER_COUNTRIES.map((cc) => `<option value="${cc}" ${entity.country === cc ? "selected" : ""}>${STATE.settings.discover.countries[cc]?.label || cc}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingDueDay")}</label>
      <input id="billDueDay" type="number" min="1" max="28" value="${entity.dueDay || 5}" />
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("billingStartDate")}</label>
      <input id="billStartDate" type="date" value="${entity.startDate || todayISO()}" />
    </div>
    <button class="btn gold block" id="confirmBillingBtn">${t("saveBilling")}</button>
  `);
  document.getElementById("confirmBillingBtn").addEventListener("click", async () => {
    entity.amount = Number(document.getElementById("billAmount").value) || 0;
    entity.currency = document.getElementById("billCurrency").value;
    entity.country = document.getElementById("billCountry").value || "";
    entity.dueDay = Number(document.getElementById("billDueDay").value) || 5;
    entity.startDate = document.getElementById("billStartDate").value || todayISO();
    await saveEntityBilling(entity);
    invalidateBillingCache();
    closeModal();
    go(`#/payment/${encodeURIComponent(entity.id)}`);
    toast("OK");
  });
}

function openRecordPaymentModal(entity) {
  const methods = STATE.settings.payment.paymentMethods;
  const nowMonth = periodKeyOf(new Date());
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("recordPayment")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("paymentAmount")}</label>
      <input id="payAmount" type="number" value="${entity.amount || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("paymentCoversMonth")}</label>
      <input id="payMonth" type="month" value="${nowMonth}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("paymentDate")}</label>
      <input id="payDate" type="date" value="${todayISO()}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("paymentMethod")}</label>
      <select id="payMethod">${methods.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("paymentComment")}</label>
      <input id="payComment" placeholder="" />
    </div>
    <button class="btn gold block" id="confirmPaymentBtn">${t("confirmPayment")}</button>
  `);
  document.getElementById("confirmPaymentBtn").addEventListener("click", async () => {
    const data = {
      amount: Number(document.getElementById("payAmount").value) || 0,
      currency: entity.currency,
      date: document.getElementById("payDate").value || todayISO(),
      coversMonth: document.getElementById("payMonth").value || periodKeyOf(new Date()),
      method: document.getElementById("payMethod").value,
      comment: document.getElementById("payComment").value.trim(),
    };
    const payment = recordPayment(entity, entity.refId, data);
    await saveEntityBilling(entity);
    invalidateBillingCache();
    closeModal();
    go(`#/payment/${encodeURIComponent(entity.id)}`);
    toast(t("confirmPayment"));
    openReceiptLangModal(entity, payment);
  });
}

function openPauseModal(entity) {
  const active = entity.pause?.active;
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("pauseManagement")}</h3>
    ${active ? `
      <p class="subject-note" style="text-align:center;margin-bottom:16px">${t("pauseActive")} : ${fmtMoneyDate(entity.pause.startDate)}${entity.pause.endDate ? " → " + fmtMoneyDate(entity.pause.endDate) : ""}</p>
      <button class="btn gold block" id="deactivatePauseBtn">${t("deactivatePauseBtn")}</button>
    ` : `
      <div class="field" style="margin-bottom:12px">
        <label>${t("pauseStart")}</label>
        <input id="pauseStartInput" type="date" value="${todayISO()}" />
      </div>
      <div class="field" style="margin-bottom:18px">
        <label>${t("pauseEnd")}</label>
        <input id="pauseEndInput" type="date" />
      </div>
      <button class="btn gold block" id="activatePauseConfirmBtn">${t("activatePauseBtn")}</button>
    `}
  `);
  document.getElementById("deactivatePauseBtn")?.addEventListener("click", async () => {
    deactivatePause(entity);
    await saveEntityBilling(entity);
    invalidateBillingCache();
    closeModal();
    go(`#/payment/${encodeURIComponent(entity.id)}`);
  });
  document.getElementById("activatePauseConfirmBtn")?.addEventListener("click", async () => {
    const start = document.getElementById("pauseStartInput").value || todayISO();
    const end = document.getElementById("pauseEndInput").value || null;
    activatePause(entity, start, end);
    await saveEntityBilling(entity);
    invalidateBillingCache();
    closeModal();
    go(`#/payment/${encodeURIComponent(entity.id)}`);
  });
}

function openReceiptLangModal(entity, payment) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("receiptLang")}</h3>
    <div class="lang-row">
      ${["fr", "en", "it"].map((l) => `<button data-rlang="${l}" class="${STATE.settings.language === l ? "active" : ""}">${l.toUpperCase()}</button>`).join("")}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px">
      <button class="btn gold block" id="rDownloadPngBtn">⬇ ${t("downloadPNG")}</button>
      <button class="btn secondary block" id="rDownloadPdfBtn">⬇ ${t("downloadPDF")}</button>
      <button class="btn secondary block" id="rShareBtn">📤 ${t("shareReceipt")}</button>
    </div>
  `);
  let lang = STATE.settings.language;
  document.querySelectorAll("[data-rlang]").forEach((btn) =>
    btn.addEventListener("click", () => {
      lang = btn.dataset.rlang;
      document.querySelectorAll("[data-rlang]").forEach((b) => b.classList.toggle("active", b === btn));
    })
  );
  const filenameBase = `Recu_${entity.name.replace(/\s+/g, "_")}_${payment.coversMonth}`;
  document.getElementById("rDownloadPngBtn").addEventListener("click", async () => {
    const canvas = await drawReceiptCanvas(entity, payment, lang);
    downloadReceiptPNG(canvas, `${filenameBase}.png`);
  });
  document.getElementById("rDownloadPdfBtn").addEventListener("click", async () => {
    const canvas = await drawReceiptCanvas(entity, payment, lang);
    downloadReceiptPDF(canvas, `${filenameBase}.pdf`);
  });
  document.getElementById("rShareBtn").addEventListener("click", async () => {
    const canvas = await drawReceiptCanvas(entity, payment, lang);
    await shareReceiptPNG(canvas, `${filenameBase}.png`, `Reçu — ${entity.name} (${payment.amount} ${payment.currency})`);
  });
}

// ---- Familles ----
function renderFamiliesManager() {
  if (!STATE.billingEntitiesLoaded) {
    ensureBillingEntitiesLoaded().then(() => { if (STATE.route === "#/families") renderShell(renderFamiliesManager()); });
    return `<div class="empty-state"><div class="star8">👪</div><p>…</p></div>`;
  }
  const families = STATE.billingEntities.filter((e) => e.kind === "family");
  return `
    <div class="session-header">
      <h2 class="display">${t("manageFamilies")}</h2>
      <button class="btn secondary" data-go="#/payments" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    ${families.length ? families.map((f) => `
      <div class="diploma-item" data-family="${f.refId}">
        <div class="icon">👪</div>
        <div class="meta">
          <div class="title">${f.name}</div>
          <div class="sub">${f.members.map((m) => m.fullName).join(", ")}</div>
        </div>
        <button class="icon-btn" data-delete-family="${f.refId}">🗑</button>
      </div>
    `).join("") : `<p class="subject-note">${t("noFamiliesYet")}</p>`}
    <button class="btn gold block" id="createFamilyBtn" style="margin-top:16px">+ ${t("createFamily")}</button>
  `;
}
function attachFamiliesManagerHandlers() {
  document.getElementById("createFamilyBtn")?.addEventListener("click", () => openFamilyModal(null));
  document.querySelectorAll("[data-family]").forEach((el) =>
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-family]")) return;
      const fam = STATE.billingEntities.find((x) => x.kind === "family" && x.refId === el.dataset.family);
      if (fam) go(`#/payment/${encodeURIComponent(fam.id)}`);
    })
  );
  document.querySelectorAll("[data-delete-family]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const famId = btn.dataset.deleteFamily;
      const fam = STATE.billingEntities.find((x) => x.kind === "family" && x.refId === famId);
      openConfirmModal(
        t("deleteFamilyTitle"),
        t("deleteFamilyMsg", fam ? fam.name : ""),
        async () => {
          await DB.deleteFamily(famId);
          invalidateBillingCache();
          closeModal();
          renderShell(renderFamiliesManager());
          toast(t("deleted"));
        }
      );
    })
  );
}
function openFamilyModal(existingFamilyId) {
  const currencies = STATE.settings.payment.currencies;
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("createFamily")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("familyName")}</label>
      <input id="famName" placeholder="ex. Famille Diallo" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingAmount")}</label>
      <input id="famAmount" type="number" value="0" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingCurrency")}</label>
      <select id="famCurrency">${currencies.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingDueDay")}</label>
      <input id="famDueDay" type="number" min="1" max="28" value="5" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("billingStartDate")}</label>
      <input id="famStartDate" type="date" value="${todayISO()}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("familyMembers")}</label>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto">
        ${STATE.students.map((s) => `
          <label style="display:flex;align-items:center;gap:8px;font-size:14px">
            <input type="checkbox" value="${s.id}" class="fam-member-check" /> ${s.fullName}
          </label>
        `).join("")}
      </div>
    </div>
    <button class="btn gold block" id="confirmFamilyBtn">${t("createFamily")}</button>
  `);
  document.getElementById("confirmFamilyBtn").addEventListener("click", async () => {
    const name = document.getElementById("famName").value.trim();
    if (!name) { toast(t("familyName") + " ?"); return; }
    const memberIds = [...document.querySelectorAll(".fam-member-check:checked")].map((c) => c.value);
    const family = {
      id: newId("fam"), name,
      amount: Number(document.getElementById("famAmount").value) || 0,
      currency: document.getElementById("famCurrency").value,
      dueDay: Number(document.getElementById("famDueDay").value) || 5,
      startDate: document.getElementById("famStartDate").value || todayISO(),
      memberIds, payments: [], history: [], pausedMonths: [], pause: { active: false },
    };
    await DB.saveFamily(family);
    // Marquer les élèves membres comme facturés via cette famille (pour ne
    // pas les faire apparaître aussi en facturation individuelle).
    for (const sid of memberIds) {
      const existing = await DB.getBilling(sid);
      await DB.saveBilling(sid, { ...(existing || newBillingSkeleton(sid)), mode: "family", familyId: family.id });
    }
    invalidateBillingCache();
    closeModal();
    go("#/families");
    toast("OK");
  });
}

// =============================================================================
// PAGE PUBLIQUE DE VÉRIFICATION — accessible en scannant le QR code d'un
// reçu, d'un diplôme ou d'un bulletin (lien #/verify/type/numero). Le lien
// ne contient QUE le type et le numéro (voir buildVerifyUrl dans
// diploma.js) : les détails complets (nom, date, montant...) sont
// recherchés dans la base locale de CET appareil. Sur l'appareil de
// l'enseignante (où le document a été créé), les détails s'affichent
// automatiquement. Sur un autre téléphone (ex. celui d'un parent), seul le
// numéro peut être confirmé, l'app étant 100% locale/hors-ligne (pas de
// serveur central) — c'est indiqué honnêtement à l'écran dans ce cas.
// =============================================================================
async function lookupVerifyData(type, num) {
  try {
    if (type === "diploma" || type === "khatm") {
      const d = await DB.getDiplomaByCertNumber(num);
      if (!d) return null;
      return { name: d.studentName, title: d.levelTitle, date: new Date(d.issuedAt).toLocaleDateString() };
    }
    if (type === "receipt") {
      const found = await DB.findPaymentByReceiptNumber(num);
      if (!found) return null;
      let name = found.familyName || null;
      if (!name && found.studentId) {
        const s = await DB.getStudentById(found.studentId);
        name = s ? s.fullName : null;
      }
      return {
        name, amount: found.payment.amount, currency: found.payment.currency,
        date: fmtMoneyDate ? fmtMoneyDate(found.payment.date) : found.payment.date,
        coversMonth: found.payment.coversMonth,
      };
    }
    return null; // bulletins : non stockés localement, pas de fiche à retrouver
  } catch (e) {
    return null;
  }
}

function renderVerifyResult(type, num, data) {
  const typeLabels = {
    diploma: t("verifyTypeDiploma"), khatm: t("verifyTypeKhatm"),
    bulletin: t("verifyTypeBulletin"), receipt: t("verifyTypeReceipt"),
  };
  const typeLabel = typeLabels[type] || type;

  if (!data) {
    return `
      <div style="max-width:480px;margin:0 auto;padding:24px 20px;text-align:center">
        <div class="star8" style="margin:0 auto 16px;--s:64px;background:var(--color-accent);color:#fff">✓</div>
        <h2 class="display" style="margin-bottom:6px">${t("verifyFormatValid")}</h2>
        <p class="subject-note" style="margin-bottom:8px">${typeLabel} — Seyda Zeynab Academy</p>
        <p style="margin-bottom:24px;font-weight:600">${t("verifyNumber")} : ${num}</p>
        <p class="subject-note">${t("verifyNoLocalRecord")}</p>
      </div>
    `;
  }

  const rows = [[t("verifyNumber"), num], [t("verifyName"), data.name || "—"]];
  if (data.title) rows.push([t("verifyLevel"), data.title]);
  if (data.date) rows.push([t("verifyDate"), data.date]);
  if (data.amount != null) rows.push([t("verifyAmount"), `${data.amount} ${data.currency || ""}`.trim()]);
  if (data.coversMonth) rows.push([t("verifyMonth"), data.coversMonth]);

  return `
    <div style="max-width:480px;margin:0 auto;padding:24px 20px;text-align:center">
      <div class="star8" style="margin:0 auto 16px;--s:64px;background:var(--color-success);color:#fff">✓</div>
      <h2 class="display" style="margin-bottom:6px">${t("verifyAuthentic")}</h2>
      <p class="subject-note" style="margin-bottom:24px">${typeLabel} — Seyda Zeynab Academy</p>
      <div style="text-align:left;background:var(--color-surface);border-radius:16px;padding:6px 20px">
        ${rows.map(([label, value]) => `
          <div style="display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.08)">
            <span class="subject-note" style="flex-shrink:0">${label}</span>
            <span style="font-weight:600;text-align:right">${value}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderVerifyScreen(type, num) {
  if (!num) {
    return `
      <div style="max-width:480px;margin:0 auto;padding:24px 20px;text-align:center">
        <div class="star8" style="margin:0 auto 16px;--s:64px;background:var(--color-danger);color:#fff">✕</div>
        <h2 class="display" style="margin-bottom:10px">${t("verifyInvalidTitle")}</h2>
        <p class="subject-note">${t("verifyInvalidMsg")}</p>
      </div>
    `;
  }
  const cacheKey = `${type}:${num}`;
  if (STATE.runtime && STATE.runtime.verifyCache && STATE.runtime.verifyCache.key === cacheKey) {
    return renderVerifyResult(type, num, STATE.runtime.verifyCache.data);
  }
  STATE.runtime = STATE.runtime || {};
  lookupVerifyData(type, num).then((data) => {
    STATE.runtime.verifyCache = { key: cacheKey, data };
    if (STATE.route.startsWith("#/verify/")) renderPublicShell(renderVerifyScreen(type, num));
  });
  return `
    <div style="max-width:480px;margin:60px auto;padding:0 20px;text-align:center">
      <div class="star8" style="margin:0 auto 16px">⏳</div>
      <p class="subject-note">${t("verifyLoading")}</p>
    </div>
  `;
}

// =============================================================================
// ESPACE "FUTURS PARENTS" — page publique de présentation + formulaire
// d'inscription + liste des demandes côté enseignante. Accessible sans
// profil élève (lien partageable par WhatsApp vers #/discover).
// =============================================================================

function renderDiscoverScreen() {
  const c = STATE.settings.discover;
  STATE.runtime.discoverLang = STATE.runtime.discoverLang || guessDiscoverLang();
  STATE.runtime.discoverCountry = STATE.runtime.discoverCountry || guessDiscoverCountry();
  const lang = STATE.runtime.discoverLang;
  const country = STATE.runtime.discoverCountry;
  const isRtl = lang === "ar";
  const countryData = c.countries[country] || c.countries.SN;

  return `
    <div dir="${isRtl ? "rtl" : "ltr"}" class="${isRtl ? "rtl-content" : ""}">
      <div class="lang-switch" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${DISCOVER_LANGS.map((l) => `
          <button class="btn secondary ${l === lang ? "active-lang" : ""}" data-discover-lang="${l}" style="padding:8px 14px;font-size:13px;${l === lang ? "background:var(--color-primary);color:#fff" : ""}">${l.toUpperCase()}</button>
        `).join("")}
      </div>

      <div class="discover-hero">
        <img src="logo-header.png" alt="" class="discover-hero-logo" />
        <h1 class="display">${STATE.settings.payment.academyName || t("appName")}</h1>
        <p class="subject-note">${dt("heroTagline", lang)}</p>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="display" style="margin-bottom:8px">${dt("sectionAbout", lang)}</h3>
        <p style="font-size:14px;line-height:1.6">${c.description[lang] || c.description.fr}</p>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="display" style="margin-bottom:8px">${dt("sectionSubjects", lang)}</h3>
        <ul style="margin:0;padding-${isRtl ? "right" : "left"}:18px;font-size:14px;line-height:1.8">
          ${(c.subjects[lang] || c.subjects.fr).map((s) => `<li>${s}</li>`).join("")}
        </ul>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="display" style="margin-bottom:8px">${dt("sectionFlow", lang)}</h3>
        <p style="font-size:14px;line-height:1.6">${c.courseFlow[lang] || c.courseFlow.fr}</p>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="display" style="margin-bottom:12px">${dt("sectionPlans", lang)}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${DISCOVER_COUNTRIES.map((cc) => `
            <button class="btn secondary" data-discover-country="${cc}" style="padding:6px 12px;font-size:12.5px;${cc === country ? "background:var(--color-accent);color:#fff" : ""}">${c.countries[cc]?.label || cc}</button>
          `).join("")}
        </div>
        ${countryData.plans.map((p) => `
          <div style="padding:12px 0;border-bottom:1px solid var(--color-surface-2)">
            <div style="display:flex;justify-content:space-between;font-weight:600">
              <span>${p.name}</span><span>${p.amount} ${countryData.currency} ${p.frequency}</span>
            </div>
            <div style="font-size:12.5px;color:var(--color-ink-soft);margin-top:4px">${p.description}</div>
          </div>
        `).join("")}
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="display" style="margin-bottom:10px">${dt("sectionSchedule", lang)}</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(c.scheduleSlots[lang] || c.scheduleSlots.fr).map((s) => `
            <p style="font-size:14px;line-height:1.5;margin:0">${s.label}</p>
          `).join("")}
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 class="display" style="margin-bottom:8px">${dt("sectionRules", lang)}</h3>
        <ul style="margin:0;padding-${isRtl ? "right" : "left"}:18px;font-size:14px;line-height:1.8">
          ${(c.rules[lang] || c.rules.fr).map((r) => `<li>${r}</li>`).join("")}
        </ul>
      </div>

      <div class="card" style="margin-bottom:22px">
        <h3 class="display" style="margin-bottom:10px">${dt("sectionFaq", lang)}</h3>
        ${(c.faq[lang] || c.faq.fr).map((item) => `
          <div style="padding:10px 0;border-bottom:1px solid var(--color-surface-2)">
            <div style="font-weight:600;font-size:14px">${item.q}</div>
            <div style="font-size:13px;color:var(--color-ink-soft);margin-top:4px">${item.a}</div>
          </div>
        `).join("")}
      </div>

      <button class="btn gold block" id="discoverRegisterBtn" style="margin-bottom:12px">📝 ${dt("ctaRegister", lang)}</button>
      ${STATE.student ? `
        <button class="btn secondary block" id="discoverShareBtn" style="margin-bottom:12px">📤 ${dt("shareViaWhatsapp", lang)}</button>
        <button class="btn secondary block" id="discoverCopyBtn">🔗 ${dt("copyLink", lang)}</button>
        <button class="btn secondary block" data-go="#/settings" style="margin-top:12px">${t("previous")}</button>
      ` : ""}
    </div>
  `;
}
function attachDiscoverScreenHandlers() {
  document.getElementById("discoverRegisterBtn").addEventListener("click", () => go("#/discover/register"));
  document.querySelectorAll("[data-discover-lang]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.discoverLang = btn.dataset.discoverLang;
      renderPublicShell(renderDiscoverScreen());
      attachDiscoverScreenHandlers();
    })
  );
  document.querySelectorAll("[data-discover-country]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.discoverCountry = btn.dataset.discoverCountry;
      renderPublicShell(renderDiscoverScreen());
      attachDiscoverScreenHandlers();
    })
  );
  const shareUrl = location.origin + location.pathname + "#/discover";
  document.getElementById("discoverShareBtn")?.addEventListener("click", () => {
    const lang = STATE.runtime.discoverLang || "fr";
    const text = `${STATE.settings.payment.academyName || t("appName")} — ${dt("heroTagline", lang)}\n${shareUrl}`;
    window.open(whatsappLink("", text), "_blank");
  });
  document.getElementById("discoverCopyBtn")?.addEventListener("click", async () => {
    const lang = STATE.runtime.discoverLang || "fr";
    try { await navigator.clipboard.writeText(shareUrl); toast(dt("linkCopied", lang)); }
    catch (e) { toast(shareUrl); }
  });
}

function renderDiscoverRegisterForm() {
  const c = STATE.settings.discover;
  const lang = STATE.runtime.discoverLang || guessDiscoverLang();
  const country = STATE.runtime.discoverCountry || guessDiscoverCountry();
  const isRtl = lang === "ar";
  const countryData = c.countries[country] || c.countries.SN;
  return `
    <div dir="${isRtl ? "rtl" : "ltr"}" class="${isRtl ? "rtl-content" : ""}">
      <div class="session-header">
        <h2 class="display">${dt("formTitle", lang)}</h2>
        <button class="btn secondary" data-go="#/discover" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("childName", lang)}</label>
        <input id="regChildName" />
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("childAge", lang)}</label>
        <input id="regChildAge" type="number" min="3" max="99" />
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("parentName", lang)}</label>
        <input id="regParentName" />
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("parentPhone", lang)}</label>
        <input id="regParentPhone" type="tel" placeholder="+221 77 000 00 00" />
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("parentEmail", lang)}</label>
        <input id="regParentEmail" type="email" />
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("desiredPlan", lang)}</label>
        <select id="regPlan">
          <option value=""></option>
          ${countryData.plans.map((p) => `<option value="${p.name} — ${p.amount} ${countryData.currency} ${p.frequency}">${p.name} (${p.amount} ${countryData.currency} ${p.frequency})</option>`).join("")}
        </select>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>${dt("desiredSlot", lang)}</label>
        <input id="regSlot" placeholder="${lang === "en" ? "e.g. weekday evenings" : lang === "it" ? "es. sere infrasettimanali" : lang === "ar" ? "مثال: مساء أيام الأسبوع" : "ex. en semaine le soir"}" />
      </div>
      <div class="field" style="margin-bottom:18px">
        <label>${dt("message", lang)}</label>
        <textarea id="regMessage" rows="3" style="padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:14px;font-family:inherit;resize:vertical"></textarea>
      </div>
      <button class="btn gold block" id="submitRegistrationBtn">${dt("submitRegistration", lang)}</button>
    </div>
  `;
}
function attachDiscoverRegisterHandlers() {
  const lang = STATE.runtime.discoverLang || guessDiscoverLang();
  const country = STATE.runtime.discoverCountry || guessDiscoverCountry();
  document.getElementById("submitRegistrationBtn").addEventListener("click", async () => {
    const childName = document.getElementById("regChildName").value.trim();
    const parentName = document.getElementById("regParentName").value.trim();
    const parentPhone = document.getElementById("regParentPhone").value.trim();
    if (!childName || !parentPhone) { toast(dt("childName", lang) + " / " + dt("parentPhone", lang) + " ?"); return; }
    const reg = {
      id: newId("reg"),
      childName, childAge: document.getElementById("regChildAge").value || "",
      parentName, parentPhone,
      parentEmail: document.getElementById("regParentEmail").value.trim(),
      desiredPlan: document.getElementById("regPlan").value,
      desiredSlot: document.getElementById("regSlot").value,
      message: document.getElementById("regMessage").value.trim(),
      country,
      status: "pending",
      createdAt: Date.now(),
    };
    await DB.saveRegistration(reg);
    const academyName = STATE.settings.payment.academyName || t("appName");
    const waNumber = STATE.settings.payment.whatsapp || STATE.settings.payment.phone;
    const waText = buildWhatsAppRegistrationMessage(reg, academyName);
    const waHref = whatsappLink(waNumber, waText);
    // Tentative d'ouverture automatique de WhatsApp (peut être bloquée par
    // le navigateur selon l'appareil) : le bouton ci-dessous reste dans
    // tous les cas le moyen fiable d'envoyer la notification.
    try { window.open(waHref, "_blank"); } catch (e) {}
    openModal(`
      <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
      <div class="empty-state" style="padding:10px 0 4px">
        <div class="star8 done" style="margin:0 auto 14px">✓</div>
        <h2 class="display">${dt("registrationSent", lang)}</h2>
        <p>${dt("registrationSentMsg", lang)}</p>
        <a class="btn gold block" style="margin-top:16px;text-decoration:none;font-weight:700" href="${waHref}" target="_blank">📤 ${dt("shareViaWhatsapp", lang)}</a>
        <button class="btn secondary block" id="backToDiscoverBtn" style="margin-top:10px">${t("previous")}</button>
      </div>
    `);
    document.getElementById("backToDiscoverBtn").addEventListener("click", () => { closeModal(); go("#/discover"); });
  });
}

// ---- Liste des demandes d'inscription (côté enseignante) ----
function renderRegistrationsList() {
  if (!STATE.registrationsLoaded) {
    DB.getAllRegistrations().then((regs) => {
      STATE.registrations = regs;
      STATE.registrationsLoaded = true;
      if (STATE.route === "#/registrations") renderShell(renderRegistrationsList());
    });
    return `<div class="empty-state"><div class="star8">📋</div><p>…</p></div>`;
  }
  return renderRegistrationsListFromState();
}
function renderRegistrationsListFromState() {
  const regs = STATE.registrations || [];
  return `
    <div class="session-header">
      <h2 class="display">${t("nav_registrations")}</h2>
      <button class="btn secondary" data-go="#/settings" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    ${regs.length ? [...regs].sort((a, b) => b.createdAt - a.createdAt).map((r) => `
      <div class="card" style="margin-bottom:12px">
        <div>
          <div style="font-weight:700">${r.childName} (${r.childAge || "?"} ans)</div>
          <div style="font-size:12.5px;color:var(--color-ink-soft)">${r.parentName} · ${r.parentPhone}</div>
          ${r.desiredPlan ? `<div style="font-size:12.5px;margin-top:4px">💳 ${r.desiredPlan}</div>` : ""}
          ${r.desiredSlot ? `<div style="font-size:12.5px">🗓️ ${r.desiredSlot}</div>` : ""}
          ${r.message ? `<div style="font-size:12.5px;font-style:italic;margin-top:4px">"${r.message}"</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn gold" data-accept-reg="${r.id}" style="flex:1;padding:10px;font-size:12.5px">✓ ${t("acceptRegistration")}</button>
          <button class="btn secondary" data-delete-reg="${r.id}" style="padding:10px 14px">🗑️</button>
        </div>
      </div>
    `).join("") : `<p class="subject-note">${t("noRegistrationsYet")}</p>`}
  `;
}
function attachRegistrationsListHandlers() {
  document.querySelectorAll("[data-accept-reg]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const reg = STATE.registrations.find((r) => r.id === btn.dataset.acceptReg);
      if (reg) openAcceptRegistrationModal(reg);
    })
  );
  document.querySelectorAll("[data-delete-reg]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const reg = STATE.registrations.find((r) => r.id === btn.dataset.deleteReg);
      openConfirmModal(t("deleteRegistrationTitle"), t("deleteRegistrationMsg", reg?.childName || ""), async () => {
        await DB.deleteRegistration(btn.dataset.deleteReg);
        STATE.registrations = STATE.registrations.filter((r) => r.id !== btn.dataset.deleteReg);
        closeModal();
        renderShell(renderRegistrationsListFromState());
        attachRegistrationsListHandlers();
        toast(t("deleted"));
      });
    })
  );
}
function openAcceptRegistrationModal(reg) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("acceptRegistration")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${dt("childName")}</label>
      <input id="acceptName" value="${reg.childName}" />
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("ageGroup")}</label>
      <select id="acceptAgeGroup">
        <option value="child" ${Number(reg.childAge) < 16 ? "selected" : ""}>${t("ageChild")}</option>
        <option value="adult" ${Number(reg.childAge) >= 16 ? "selected" : ""}>${t("ageAdult")}</option>
      </select>
    </div>
    <button class="btn gold block" id="confirmAcceptBtn">${t("createProfile")}</button>
  `);
  document.getElementById("confirmAcceptBtn").addEventListener("click", async () => {
    const fullName = document.getElementById("acceptName").value.trim();
    if (!fullName) return;
    const ageGroup = document.getElementById("acceptAgeGroup").value;
    const student = await DB.createStudent(fullName, ageGroup);
    await DB.deleteRegistration(reg.id);
    STATE.registrations = (STATE.registrations || []).filter((r) => r.id !== reg.id);
    closeModal();
    toast(t("deleted"));
    await switchActiveStudent(student.id);
  });
}

// =============================================================================
// EMPLOI DU TEMPS — planning hebdomadaire par élève, détection automatique
// des conflits, génération d'un emploi du temps individuel (PDF/PNG).
// Nouveau module indépendant : n'affecte aucune fonctionnalité existante.
// =============================================================================

function studentPhotoById(studentId) {
  return (STATE.students || []).find((s) => s.id === studentId)?.photo || null;
}

function renderScheduleScreen() {
  if (!STATE.scheduleLoaded) {
    DB.getAllScheduleSlots().then((slots) => {
      STATE.scheduleSlots = slots;
      STATE.scheduleLoaded = true;
      if (STATE.route === "#/schedule") renderShell(renderScheduleScreen());
    });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">📅</div><p>…</p></div>`;
  }

  const lang = STATE.settings.language || "fr";
  const slots = STATE.scheduleSlots;
  const stats = computeScheduleStats(slots);
  const search = (STATE.runtime.scheduleSearch || "").trim().toLowerCase();
  const day = STATE.runtime.scheduleDay ?? ((new Date().getDay() + 6) % 7);

  const statsHtml = `
    <div class="card" style="display:flex;justify-content:space-around;text-align:center;margin-bottom:16px">
      <div><div style="font-size:20px;font-weight:700">${stats.busyHours}h</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("scheduleStatsBusy")}</div></div>
      <div><div style="font-size:20px;font-weight:700">${stats.occupiedCount}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("scheduleStatsOccupied")}</div></div>
      <div><div style="font-size:20px;font-weight:700">${stats.freeHours}h</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("scheduleStatsFree")}</div></div>
    </div>
  `;

  const searchHtml = `
    <div class="field" style="margin-bottom:14px">
      <input id="scheduleSearchInput" placeholder="${t("scheduleSearchPlaceholder")}" value="${STATE.runtime.scheduleSearch || ""}" />
    </div>
  `;

  if (search) {
    const matches = slots.filter((s) => (s.studentName || "").toLowerCase().includes(search));
    const byStudent = {};
    matches.forEach((s) => { (byStudent[s.studentId] = byStudent[s.studentId] || []).push(s); });
    const studentIds = Object.keys(byStudent);
    return `
      <div class="session-header">
        <h2 class="display">${t("scheduleTitle")}</h2>
        <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
      </div>
      ${statsHtml}${searchHtml}
      ${studentIds.length === 0 ? `<div class="empty-state"><p>${t("scheduleNoStudentFound")}</p></div>` : studentIds.map((sid) => `
        <div class="card" style="margin-bottom:12px;cursor:pointer" data-open-student="${sid}">
          <div style="font-weight:600;margin-bottom:6px">${byStudent[sid][0].studentName}</div>
          ${byStudent[sid].map((s) => `<div style="font-size:13px;color:var(--color-ink-soft)">${scheduleDayName(s.day, lang)} · ${s.startTime}-${s.endTime}${s.paused ? t("schedulePausedSuffix") : ""}</div>`).join("")}
        </div>
      `).join("")}
    `;
  }

  const timeline = computeDayTimeline(slots, day);
  const pausedSlots = slots.filter((s) => s.paused);
  const viewMode = STATE.runtime.scheduleViewMode || "day";

  const viewToggleHtml = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn ${viewMode === "day" ? "gold" : "secondary"}" data-schedule-view="day" style="flex:1;padding:9px;font-size:12.5px">${t("scheduleViewDay")}</button>
      <button class="btn ${viewMode === "week" ? "gold" : "secondary"}" data-schedule-view="week" style="flex:1;padding:9px;font-size:12.5px">${t("scheduleViewWeek")}</button>
      <button class="btn ${viewMode === "calendar" ? "gold" : "secondary"}" data-schedule-view="calendar" style="flex:1;padding:9px;font-size:12.5px">${t("scheduleViewCalendar")}</button>
    </div>
    <button class="btn secondary block" id="scheduleFreeOverviewBtn" style="margin-bottom:16px">📋 ${t("scheduleFreeOverviewBtn")}</button>
  `;

  if (viewMode === "calendar") return renderScheduleCalendar(statsHtml, searchHtml, viewToggleHtml);

  if (viewMode === "week") {
    return `
      <div class="session-header">
        <h2 class="display">${t("scheduleTitle")}</h2>
        <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
      </div>
      ${statsHtml}${searchHtml}${viewToggleHtml}
      ${[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const daySlots = slots.filter((s) => s.day === d && !s.paused).sort((a, b) => scheduleTimeToMinutes(a.startTime) - scheduleTimeToMinutes(b.startTime));
        return `
          <div class="card" style="margin-bottom:12px">
            <div style="font-weight:700;margin-bottom:8px">${scheduleDayName(d, lang)}</div>
            ${daySlots.length === 0 ? `<div style="font-size:12.5px;color:var(--color-ink-soft)">${t("scheduleNoBookingsDay")}</div>` : daySlots.map((s) => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--color-surface-2);cursor:pointer" data-open-student="${s.studentId}">
                <span style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px">${avatarHtml(s.studentName, studentPhotoById(s.studentId), 26)}${s.startTime}-${s.endTime} · ${s.studentName}</span>
                <span style="font-size:11.5px;color:var(--color-ink-soft);text-align:right">${(s.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ")}</span>
              </div>
            `).join("")}
          </div>
        `;
      }).join("")}
      <button class="btn gold block" id="addScheduleSlotBtn" style="margin:16px 0">${t("scheduleAddBtn")}</button>
      ${pausedSlots.length ? `
        <div class="section-title" style="margin-top:24px">${t("schedulePausedStudents")}</div>
        ${pausedSlots.map((s) => `
          <div class="card" style="margin-bottom:10px;opacity:0.75">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600">${s.studentName}</div>
                <div style="font-size:12px;color:var(--color-ink-soft)">${scheduleDayName(s.day, lang)} · ${s.startTime}-${s.endTime} ${t("schedulePausedNote")}</div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="icon-btn" data-resume-slot="${s.id}" title="${t("scheduleResumeIcon")}">▶</button>
                <button class="icon-btn" data-delete-slot="${s.id}" title="${t("scheduleDeleteIcon")}">🗑</button>
              </div>
            </div>
          </div>
        `).join("")}
      ` : ""}
    `;
  }

  return `
    <div class="session-header">
      <h2 class="display">${t("scheduleTitle")}</h2>
      <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    ${statsHtml}${searchHtml}${viewToggleHtml}
    <div class="subject-tabs" style="margin-bottom:16px">
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<button class="subject-tab ${day === i ? "active" : ""}" data-schedule-day="${i}">${scheduleDayShort(i, lang)}</button>`).join("")}
    </div>

    ${timeline.map((item) => item.type === "busy" ? `
      <div class="card" style="margin-bottom:10px;border-left:5px solid var(--color-danger)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="cursor:pointer;display:flex;align-items:center;gap:10px" data-open-student="${item.slot.studentId}">
            ${avatarHtml(item.slot.studentName, studentPhotoById(item.slot.studentId), 32)}
            <div>
              <div style="font-weight:600">${item.slot.studentName}</div>
              <div style="font-size:12.5px;color:var(--color-ink-soft)">${item.start} - ${item.end} · ${(item.slot.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ") || "—"}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="icon-btn" data-edit-slot="${item.slot.id}" title="${t("scheduleEditIcon")}">✏️</button>
            <button class="icon-btn" data-pause-slot="${item.slot.id}" title="${t("schedulePauseIcon")}">⏸</button>
            <button class="icon-btn" data-delete-slot="${item.slot.id}" title="${t("scheduleDeleteIcon")}">🗑</button>
          </div>
        </div>
      </div>
    ` : `
      <div class="card" style="margin-bottom:10px;border-left:5px solid var(--color-success);display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:var(--color-ink-soft)">🟢 ${t("scheduleFreeLabel")} · ${item.start} - ${item.end}</div>
        <button class="btn secondary" data-add-slot-at="${item.start}|${item.end}" style="padding:6px 12px;font-size:12px">${t("scheduleReserveBtn")}</button>
      </div>
    `).join("")}

    <button class="btn gold block" id="addScheduleSlotBtn" style="margin:16px 0">${t("scheduleAddBtn")}</button>

    ${pausedSlots.length ? `
      <div class="section-title" style="margin-top:24px">${t("schedulePausedStudents")}</div>
      ${pausedSlots.map((s) => `
        <div class="card" style="margin-bottom:10px;opacity:0.75">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600">${s.studentName}</div>
              <div style="font-size:12px;color:var(--color-ink-soft)">${scheduleDayName(s.day, lang)} · ${s.startTime}-${s.endTime} ${t("schedulePausedNote")}</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="icon-btn" data-resume-slot="${s.id}" title="${t("scheduleResumeIcon")}">▶</button>
              <button class="icon-btn" data-delete-slot="${s.id}" title="${t("scheduleDeleteIcon")}">🗑</button>
            </div>
          </div>
        </div>
      `).join("")}
    ` : ""}
  `;
}

function renderScheduleCalendar(statsHtml, searchHtml, viewToggleHtml) {
  if (!STATE.courseLogsLoaded) {
    DB.getAllCourseLogs().then((logs) => {
      STATE.courseLogs = logs;
      STATE.courseLogsLoaded = true;
      if (STATE.route === "#/schedule") renderShell(renderScheduleScreen());
    });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">📅</div><p>…</p></div>`;
  }
  const lang = STATE.settings.language || "fr";
  const today = new Date();
  const cursor = STATE.runtime.calendarCursor || { year: today.getFullYear(), month: today.getMonth() };
  const selectedDate = STATE.runtime.calendarSelectedDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  STATE.runtime.calendarSelectedDate = selectedDate;
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const dots = monthOccurrenceDots(STATE.scheduleSlots, STATE.courseLogs, cursor.year, cursor.month);
  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=dim
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthLabel = firstOfMonth.toLocaleDateString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR", { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push("");
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayNames = lang === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : lang === "it" ? ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] : ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  const occs = occurrencesForDate(STATE.scheduleSlots, STATE.courseLogs, selectedDate);
  const selectedLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return `
    <div class="session-header">
      <h2 class="display">${t("scheduleTitle")}</h2>
      <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    ${statsHtml}${searchHtml}${viewToggleHtml}

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <button class="icon-btn" id="calPrevMonth">‹</button>
        <h3 class="display" style="font-size:16px;text-transform:capitalize">${monthLabel}</h3>
        <button class="icon-btn" id="calNextMonth">›</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;font-size:11px;color:var(--color-ink-soft);margin-bottom:6px">
        ${dayNames.map((d) => `<div>${d}</div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
        ${cells.map((d) => {
          if (!d) return `<div></div>`;
          const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO;
          return `
            <button data-cal-day="${iso}" style="position:relative;padding:8px 0;border-radius:10px;border:${isSelected ? "2px solid var(--color-accent)" : "1px solid transparent"};background:${isToday ? "var(--color-surface-2)" : "transparent"};font-size:13px;color:var(--color-ink)">
              ${d}${dots[iso] ? `<div style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:var(--color-primary)"></div>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    </div>

    <div class="section-title" style="text-transform:capitalize">${selectedLabel}</div>
    ${occs.length === 0 ? `<div class="empty-state"><p>${t("calendarNoCourses")}</p></div>` : occs.map((occ) => `
      <div class="card" style="margin-bottom:10px;${occ.status === "cancelled" ? "opacity:0.6" : ""}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:10px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            ${avatarHtml(occ.studentName || occ.title, studentPhotoById(occ.studentId), 34)}
            <div>
              <div style="font-weight:600">${occ.studentName || occ.title || "—"}</div>
              <div style="font-size:12px;color:var(--color-ink-soft)">${occ.startTime} - ${occ.endTime} · ${(occ.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ") || "—"}</div>
              ${occ.status === "cancelled" ? `<div style="font-size:12px;color:var(--color-danger)">${t("calendarCancelled")}</div>` : ""}
              ${occ.status === "moved-in" ? `<div style="font-size:12px;color:var(--color-accent)">${t("calendarMovedFrom")} ${occ.originalDate}</div>` : ""}
              ${occ.attendance ? `<div style="font-size:12px;margin-top:2px;color:${occ.attendance === "present" ? "var(--color-success)" : "var(--color-danger)"}">${occ.attendance === "present" ? "✅ " + t("attendancePresent") : "❌ " + t("attendanceAbsent")}${occ.remark ? " · " + occ.remark : ""}</div>` : ""}
            </div>
          </div>
        </div>
        ${occ.status !== "cancelled" ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn secondary" data-mark-attendance="${occ.id}" style="padding:6px 10px;font-size:11.5px">✅ ${t("calendarMarkAttendance")}</button>
            ${!occ.isAdHoc ? `<button class="btn secondary" data-move-occ="${occ.id}" style="padding:6px 10px;font-size:11.5px">↔️ ${t("calendarMove")}</button>` : ""}
            <button class="btn secondary" data-cancel-occ="${occ.id}" style="padding:6px 10px;font-size:11.5px;color:var(--color-danger)">✕ ${t("calendarCancel")}</button>
            ${occ.isAdHoc ? `<button class="icon-btn" data-delete-adhoc="${occ.id}">🗑</button>` : ""}
          </div>
        ` : ""}
      </div>
    `).join("")}

    <button class="btn gold block" id="calAddCourseBtn" style="margin-top:16px">➕ ${t("calendarAddCourse")}</button>
    <button class="btn secondary block" id="calNotifyPermBtn" style="margin-top:10px">🔔 ${t("calendarEnableNotifications")}</button>
    <p class="subject-note" style="font-size:11.5px;margin-top:8px">${t("calendarNotifyNote")}</p>
  `;
}

function attachScheduleCalendarHandlers() {
  document.getElementById("calPrevMonth")?.addEventListener("click", () => {
    const c = STATE.runtime.calendarCursor || { year: new Date().getFullYear(), month: new Date().getMonth() };
    const d = new Date(c.year, c.month - 1, 1);
    STATE.runtime.calendarCursor = { year: d.getFullYear(), month: d.getMonth() };
    renderShell(renderScheduleScreen());
  });
  document.getElementById("calNextMonth")?.addEventListener("click", () => {
    const c = STATE.runtime.calendarCursor || { year: new Date().getFullYear(), month: new Date().getMonth() };
    const d = new Date(c.year, c.month + 1, 1);
    STATE.runtime.calendarCursor = { year: d.getFullYear(), month: d.getMonth() };
    renderShell(renderScheduleScreen());
  });
  document.querySelectorAll("[data-cal-day]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.calendarSelectedDate = btn.dataset.calDay;
      renderShell(renderScheduleScreen());
    })
  );
  document.getElementById("calAddCourseBtn")?.addEventListener("click", () => openAdHocCourseModal(STATE.runtime.calendarSelectedDate));
  document.getElementById("calNotifyPermBtn")?.addEventListener("click", async () => {
    const perm = await requestNotificationPermission();
    if (perm === "granted") toast(t("calendarNotifyGranted"));
    else if (perm === "unsupported") toast(t("calendarNotifyUnsupported"));
    else toast(t("calendarNotifyDenied"));
  });
  document.querySelectorAll("[data-mark-attendance]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const occ = occurrencesForDate(STATE.scheduleSlots, STATE.courseLogs, STATE.runtime.calendarSelectedDate).find((o) => o.id === btn.dataset.markAttendance);
      if (occ) openAttendanceModal(occ);
    })
  );
  document.querySelectorAll("[data-move-occ]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const occ = occurrencesForDate(STATE.scheduleSlots, STATE.courseLogs, STATE.runtime.calendarSelectedDate).find((o) => o.id === btn.dataset.moveOcc);
      if (occ) openMoveOccurrenceModal(occ);
    })
  );
  document.querySelectorAll("[data-cancel-occ]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const occ = occurrencesForDate(STATE.scheduleSlots, STATE.courseLogs, STATE.runtime.calendarSelectedDate).find((o) => o.id === btn.dataset.cancelOcc);
      if (occ) cancelOccurrence(occ);
    })
  );
  document.querySelectorAll("[data-delete-adhoc]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await DB.deleteCourseLog(btn.dataset.deleteAdhoc);
      STATE.courseLogs = STATE.courseLogs.filter((l) => l.id !== btn.dataset.deleteAdhoc);
      renderShell(renderScheduleScreen());
      toast(t("deleted"));
    })
  );
}

async function cancelOccurrence(occ) {
  openConfirmModal(t("calendarCancelTitle"), t("calendarCancelMsg"), async () => {
    if (occ.isAdHoc) {
      const log = STATE.courseLogs.find((l) => l.id === occ.id);
      if (log) { log.status = "cancelled"; await DB.saveCourseLog(log); }
    } else {
      let log = STATE.courseLogs.find((l) => l.id === occ.id && l.scheduleSlotId === occ.scheduleSlotId);
      if (!log) { log = { id: newId("clog"), scheduleSlotId: occ.scheduleSlotId, date: occ.date, createdAt: Date.now() }; STATE.courseLogs.push(log); }
      log.status = "cancelled";
      await DB.saveCourseLog(log);
    }
    closeModal();
    renderShell(renderScheduleScreen());
    toast(t("deleted"));
  });
}

function openAttendanceModal(occ) {
  const lang = STATE.settings.language || "fr";
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("calendarMarkAttendance")}</h3>
    <p style="text-align:center;margin-bottom:14px;font-weight:600">${occ.studentName || occ.title}</p>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <button class="btn ${occ.attendance === "present" ? "gold" : "secondary"}" id="attPresentBtn" style="flex:1">✅ ${t("attendancePresent")}</button>
      <button class="btn ${occ.attendance === "absent" ? "gold" : "secondary"}" id="attAbsentBtn" style="flex:1">❌ ${t("attendanceAbsent")}</button>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("calendarSubjectsCovered")}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${SCHEDULE_SUBJECT_KEYS.map((key) => `
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;background:var(--color-surface-2);padding:6px 10px;border-radius:20px">
            <input type="checkbox" class="attSubject" value="${key}" ${((occ.subjectsCovered || []).includes(key)) ? "checked" : ""} /> ${scheduleSubjectLabel(key, lang)}
          </label>
        `).join("")}
      </div>
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("calendarRemark")}</label>
      <textarea id="attRemark" rows="2" style="padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:14px;font-family:inherit;resize:vertical" placeholder="${t("calendarRemarkPlaceholder")}">${occ.remark || ""}</textarea>
    </div>
    <button class="btn gold block" id="attSaveBtn">${t("savePaymentSettingsBtn")}</button>
  `);
  let attendance = occ.attendance || null;
  document.getElementById("attPresentBtn").addEventListener("click", () => { attendance = "present"; document.getElementById("attPresentBtn").className = "btn gold"; document.getElementById("attAbsentBtn").className = "btn secondary"; });
  document.getElementById("attAbsentBtn").addEventListener("click", () => { attendance = "absent"; document.getElementById("attAbsentBtn").className = "btn gold"; document.getElementById("attPresentBtn").className = "btn secondary"; });
  document.getElementById("attSaveBtn").addEventListener("click", async () => {
    const subjectsCovered = Array.from(document.querySelectorAll(".attSubject:checked")).map((c) => c.value);
    const remark = document.getElementById("attRemark").value.trim();
    if (occ.isAdHoc) {
      const log = STATE.courseLogs.find((l) => l.id === occ.id);
      if (log) { log.attendance = attendance; log.subjectsCovered = subjectsCovered; log.remark = remark; log.status = "done"; await DB.saveCourseLog(log); }
    } else {
      let log = STATE.courseLogs.find((l) => l.id === occ.id && l.scheduleSlotId === occ.scheduleSlotId);
      if (!log) { log = { id: newId("clog"), scheduleSlotId: occ.scheduleSlotId, date: occ.date, createdAt: Date.now() }; STATE.courseLogs.push(log); }
      log.attendance = attendance; log.subjectsCovered = subjectsCovered; log.remark = remark; log.status = "done";
      await DB.saveCourseLog(log);
    }
    closeModal();
    renderShell(renderScheduleScreen());
    toast("OK");
  });
}

function openMoveOccurrenceModal(occ) {
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("calendarMove")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("scheduleDayLabel")} (${t("calendarNewDate")})</label>
      <input id="moveDate" type="date" value="${occ.date}" />
    </div>
    <div style="display:flex;gap:10px;margin-bottom:18px">
      <div class="field" style="flex:1"><label>${t("scheduleStartLabel")}</label><input id="moveStart" type="time" value="${occ.startTime}" step="900" /></div>
      <div class="field" style="flex:1"><label>${t("scheduleEndLabel")}</label><input id="moveEnd" type="time" value="${occ.endTime}" step="900" /></div>
    </div>
    <div id="moveConflictMsg" style="color:var(--color-danger);font-size:13px;margin-bottom:10px;display:none"></div>
    <button class="btn gold block" id="moveSaveBtn">${t("savePaymentSettingsBtn")}</button>
  `);
  document.getElementById("moveSaveBtn").addEventListener("click", async () => {
    const newDate = document.getElementById("moveDate").value;
    const newStart = document.getElementById("moveStart").value;
    const newEnd = document.getElementById("moveEnd").value;
    if (!newDate || !newStart || !newEnd) { toast(t("scheduleMissingFields")); return; }
    const conflictBox = document.getElementById("moveConflictMsg");
    const existingOnNewDate = occurrencesForDate(STATE.scheduleSlots, STATE.courseLogs, newDate);
    const s1 = scheduleTimeToMinutes(newStart), e1 = scheduleTimeToMinutes(newEnd);
    const conflict = existingOnNewDate.find((o) => o.id !== occ.id && o.status !== "cancelled" && s1 < scheduleTimeToMinutes(o.endTime) && scheduleTimeToMinutes(o.startTime) < e1);
    if (conflict) {
      conflictBox.textContent = t("scheduleConflictMsg", conflict.studentName || conflict.title, newDate, conflict.startTime, conflict.endTime);
      conflictBox.style.display = "block";
      return;
    }
    if (occ.isAdHoc) {
      const log = STATE.courseLogs.find((l) => l.id === occ.id);
      if (log) { log.date = newDate; log.startTime = newStart; log.endTime = newEnd; await DB.saveCourseLog(log); }
    } else {
      let log = STATE.courseLogs.find((l) => l.id === occ.id && l.scheduleSlotId === occ.scheduleSlotId && l.date === occ.date);
      if (!log) { log = { id: newId("clog"), scheduleSlotId: occ.scheduleSlotId, date: occ.date, createdAt: Date.now() }; STATE.courseLogs.push(log); }
      log.status = "moved";
      log.movedTo = { date: newDate, startTime: newStart, endTime: newEnd };
      await DB.saveCourseLog(log);
    }
    closeModal();
    STATE.runtime.calendarSelectedDate = newDate;
    renderShell(renderScheduleScreen());
    toast("OK");
  });
}

function openAdHocCourseModal(dateISO) {
  const students = STATE.students || [];
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("calendarAddCourse")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("calendarCourseTitle")}</label>
      <input id="ahTitle" placeholder="${t("calendarCourseTitlePlaceholder")}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("scheduleDayLabel")}</label>
      <input id="ahDate" type="date" value="${dateISO}" />
    </div>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="field" style="flex:1"><label>${t("scheduleStartLabel")}</label><input id="ahStart" type="time" value="17:00" step="900" /></div>
      <div class="field" style="flex:1"><label>${t("scheduleEndLabel")}</label><input id="ahEnd" type="time" value="18:00" step="900" /></div>
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("scheduleStudentLabel")} (${t("optionalLabel")})</label>
      <select id="ahStudent">
        <option value="">${t("calendarNone")}</option>
        ${students.map((s) => `<option value="${s.id}">${s.fullName}</option>`).join("")}
      </select>
    </div>
    <div id="ahConflictMsg" style="color:var(--color-danger);font-size:13px;margin-bottom:10px;display:none"></div>
    <button class="btn gold block" id="ahSaveBtn">${t("savePaymentSettingsBtn")}</button>
  `);
  document.getElementById("ahSaveBtn").addEventListener("click", async () => {
    const title = document.getElementById("ahTitle").value.trim();
    const date = document.getElementById("ahDate").value;
    const startTime = document.getElementById("ahStart").value;
    const endTime = document.getElementById("ahEnd").value;
    const studentId = document.getElementById("ahStudent").value;
    const student = students.find((s) => s.id === studentId);
    if (!date || !startTime || !endTime) { toast(t("scheduleMissingFields")); return; }
    const conflictBox = document.getElementById("ahConflictMsg");
    const existing = occurrencesForDate(STATE.scheduleSlots, STATE.courseLogs, date);
    const s1 = scheduleTimeToMinutes(startTime), e1 = scheduleTimeToMinutes(endTime);
    const conflict = existing.find((o) => o.status !== "cancelled" && s1 < scheduleTimeToMinutes(o.endTime) && scheduleTimeToMinutes(o.startTime) < e1);
    if (conflict) {
      conflictBox.textContent = t("scheduleConflictMsg", conflict.studentName || conflict.title, date, conflict.startTime, conflict.endTime);
      conflictBox.style.display = "block";
      return;
    }
    const log = newAdHocCourseLog({ date, startTime, endTime, title, studentId, studentName: student ? student.fullName : "", subjects: [] });
    await DB.saveCourseLog(log);
    STATE.courseLogs.push(log);
    closeModal();
    STATE.runtime.calendarSelectedDate = date;
    renderShell(renderScheduleScreen());
    toast("OK");
  });
}

function attachScheduleScreenHandlers() {
  attachScheduleCalendarHandlers();
  document.getElementById("scheduleSearchInput")?.addEventListener("input", (e) => {
    STATE.runtime.scheduleSearch = e.target.value;
    renderShell(renderScheduleScreen());
  });
  document.getElementById("scheduleFreeOverviewBtn")?.addEventListener("click", openFreeSlotsDownloadModal);
  document.querySelectorAll("[data-schedule-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.scheduleViewMode = btn.dataset.scheduleView;
      renderShell(renderScheduleScreen());
    })
  );
  document.querySelectorAll("[data-schedule-day]").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.runtime.scheduleDay = Number(btn.dataset.scheduleDay);
      renderShell(renderScheduleScreen());
    })
  );
  document.querySelectorAll("[data-open-student]").forEach((el) =>
    el.addEventListener("click", () => go(`#/schedule/student/${el.dataset.openStudent}`))
  );
  document.getElementById("addScheduleSlotBtn")?.addEventListener("click", () => openScheduleSlotModal(null));
  document.querySelectorAll("[data-add-slot-at]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [start, end] = btn.dataset.addSlotAt.split("|");
      openScheduleSlotModal(null, { day: STATE.runtime.scheduleDay ?? 0, startTime: start, endTime: end });
    })
  );
  document.querySelectorAll("[data-edit-slot]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const slot = STATE.scheduleSlots.find((s) => s.id === btn.dataset.editSlot);
      if (slot) openScheduleSlotModal(slot);
    })
  );
  document.querySelectorAll("[data-pause-slot]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const slot = STATE.scheduleSlots.find((s) => s.id === btn.dataset.pauseSlot);
      if (!slot) return;
      slot.paused = true;
      await DB.saveScheduleSlot(slot);
      renderShell(renderScheduleScreen());
      toast(t("schedulePausedToast"));
    })
  );
  document.querySelectorAll("[data-resume-slot]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const slot = STATE.scheduleSlots.find((s) => s.id === btn.dataset.resumeSlot);
      if (slot) openScheduleSlotModal(slot, null, true);
    })
  );
  document.querySelectorAll("[data-delete-slot]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const slot = STATE.scheduleSlots.find((s) => s.id === btn.dataset.deleteSlot);
      if (!slot) return;
      const lang = STATE.settings.language || "fr";
      openConfirmModal(
        t("scheduleDeleteTitle"),
        t("scheduleDeleteMsg", slot.studentName, scheduleDayName(slot.day, lang), slot.startTime, slot.endTime),
        async () => {
          await DB.deleteScheduleSlot(slot.id);
          STATE.scheduleSlots = STATE.scheduleSlots.filter((s) => s.id !== slot.id);
          closeModal();
          renderShell(renderScheduleScreen());
          toast(t("deleted"));
        }
      );
    })
  );
}

// preset: { day, startTime, endTime } pour pré-remplir depuis un créneau libre.
// resuming: true si on réactive un créneau en pause (le formulaire permet de
// changer le jour/l'heure si le créneau d'origine est maintenant repris).
function openScheduleSlotModal(existingSlot, preset, resuming) {
  const lang = STATE.settings.language || "fr";
  const isEdit = !!existingSlot && !resuming;
  const slot = existingSlot ? { ...existingSlot } : newScheduleSlot("", "");
  if (preset) { slot.day = preset.day; slot.startTime = preset.startTime; slot.endTime = preset.endTime; }
  const students = STATE.students || [];
  const isFamily = !!slot.isFamily;

  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${resuming ? t("scheduleResumeTitle") : isEdit ? t("scheduleEditTitle") : t("scheduleNewTitle")}</h3>
    <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-bottom:14px;background:var(--color-surface-2);padding:9px 12px;border-radius:12px">
      <input type="checkbox" id="slotIsFamily" ${isFamily ? "checked" : ""} /> ${t("scheduleFamilySlot")}
    </label>
    <div class="field" style="margin-bottom:12px;${isFamily ? "display:none" : ""}" id="slotSingleStudentField">
      <label>${t("scheduleStudentLabel")}</label>
      <select id="slotStudent">
        <option value="">—</option>
        ${students.map((s) => `<option value="${s.id}" ${slot.studentId === s.id ? "selected" : ""}>${s.fullName}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="margin-bottom:12px;display:${isFamily ? "block" : "none"}" id="slotFamilyStudentsField">
      <label>${t("scheduleFamilyMembersLabel")}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${students.map((s) => `
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;background:var(--color-surface-2);padding:6px 10px;border-radius:20px">
            <input type="checkbox" class="slotFamilyMember" value="${s.id}" ${((slot.studentIds || []).includes(s.id)) ? "checked" : ""} /> ${s.fullName}
          </label>
        `).join("")}
      </div>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("scheduleDayLabel")}</label>
      <select id="slotDay">
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<option value="${i}" ${slot.day === i ? "selected" : ""}>${scheduleDayName(i, lang)}</option>`).join("")}
      </select>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="field" style="flex:1">
        <label>${t("scheduleStartLabel")}</label>
        <input id="slotStart" type="time" value="${slot.startTime}" step="900" />
      </div>
      <div class="field" style="flex:1">
        <label>${t("scheduleEndLabel")}</label>
        <input id="slotEnd" type="time" value="${slot.endTime}" step="900" />
      </div>
    </div>
    <div class="field" style="margin-bottom:8px">
      <label>${t("scheduleSubjectsLabel")}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${SCHEDULE_SUBJECT_KEYS.map((key) => `
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;background:var(--color-surface-2);padding:6px 10px;border-radius:20px">
            <input type="checkbox" class="slotSubject" value="${key}" ${((slot.subjects || []).includes(key)) ? "checked" : ""} /> ${scheduleSubjectLabel(key, lang)}
          </label>
        `).join("")}
      </div>
    </div>
    <div id="slotConflictMsg" style="color:var(--color-danger);font-size:13px;margin-bottom:10px;display:none"></div>
    <button class="btn gold block" id="confirmSlotBtn">${t("savePaymentSettingsBtn")}</button>
  `);

  document.getElementById("slotIsFamily").addEventListener("change", (e) => {
    document.getElementById("slotSingleStudentField").style.display = e.target.checked ? "none" : "block";
    document.getElementById("slotFamilyStudentsField").style.display = e.target.checked ? "block" : "none";
  });

  document.getElementById("confirmSlotBtn").addEventListener("click", async () => {
    const familyMode = document.getElementById("slotIsFamily").checked;
    const day = Number(document.getElementById("slotDay").value);
    const startTime = document.getElementById("slotStart").value;
    const endTime = document.getElementById("slotEnd").value;
    const subjects = Array.from(document.querySelectorAll(".slotSubject:checked")).map((c) => c.value);
    const conflictBox = document.getElementById("slotConflictMsg");

    let studentId, studentName, studentIds, studentNames;
    if (familyMode) {
      const memberIds = Array.from(document.querySelectorAll(".slotFamilyMember:checked")).map((c) => c.value);
      const members = students.filter((s) => memberIds.includes(s.id));
      if (members.length < 2) {
        conflictBox.textContent = t("scheduleFamilyMinTwo");
        conflictBox.style.display = "block";
        return;
      }
      studentIds = members.map((s) => s.id);
      studentNames = members.map((s) => s.fullName);
      studentId = studentIds[0];
      studentName = studentNames.join(", ");
    } else {
      studentId = document.getElementById("slotStudent").value;
      const student = students.find((s) => s.id === studentId);
      studentName = student ? student.fullName : slot.studentName;
    }

    if (!studentId || !startTime || !endTime) {
      conflictBox.textContent = t("scheduleMissingFields");
      conflictBox.style.display = "block";
      return;
    }
    const conflict = findScheduleConflict(STATE.scheduleSlots, day, startTime, endTime, slot.id);
    if (conflict) {
      conflictBox.textContent = conflict.invalidRange
        ? t("scheduleInvalidRange")
        : t("scheduleConflictMsg", conflict.studentName, scheduleDayName(conflict.day, lang), conflict.startTime, conflict.endTime);
      conflictBox.style.display = "block";
      return;
    }

    const toSave = {
      ...slot,
      studentId, studentName,
      isFamily: familyMode,
      studentIds: familyMode ? studentIds : undefined,
      studentNames: familyMode ? studentNames : undefined,
      day, startTime, endTime, subjects,
      paused: false,
    };
    await DB.saveScheduleSlot(toSave);
    const idx = STATE.scheduleSlots.findIndex((s) => s.id === toSave.id);
    if (idx >= 0) STATE.scheduleSlots[idx] = toSave; else STATE.scheduleSlots.push(toSave);
    closeModal();
    renderShell(renderScheduleScreen());
    toast("OK");
  });
}

function renderStudentScheduleDetail(studentId) {
  if (!STATE.scheduleLoaded) {
    DB.getAllScheduleSlots().then((slots) => {
      STATE.scheduleSlots = slots;
      STATE.scheduleLoaded = true;
      if (STATE.route === `#/schedule/student/${studentId}`) renderShell(renderStudentScheduleDetail(studentId));
    });
    return `<div class="empty-state"><p>…</p></div>`;
  }
  const lang = STATE.settings.language || "fr";
  const slots = studentWeeklySlots(STATE.scheduleSlots, studentId);
  const student = (STATE.students || []).find((s) => s.id === studentId);
  const name = student ? student.fullName : (slots[0]?.studentName || "—");

  return `
    <div class="session-header">
      <h2 class="display" style="display:flex;align-items:center;gap:10px">${avatarHtml(name, student?.photo, 34)}${name}</h2>
      <button class="btn secondary" data-go="#/schedule" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <div class="card" style="margin-bottom:18px">
      ${slots.length === 0 ? `<p style="font-size:14px;color:var(--color-ink-soft)">${t("scheduleNoSlotsForStudent")}</p>` : slots.map((s) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--color-surface-2)">
          <div style="font-weight:600">${scheduleDayName(s.day, lang)} · ${s.startTime} - ${s.endTime} <span style="font-weight:400;color:var(--color-ink-soft);font-size:12.5px">(${scheduleDurationLabel(s.startTime, s.endTime)})</span></div>
          <div style="font-size:12.5px;color:var(--color-ink-soft);margin-top:2px">${(s.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ") || "—"}</div>
        </div>
      `).join("")}
    </div>
    <button class="btn gold block" id="scheduleDownloadBtn">${t("scheduleDownloadBtn")}</button>
  `;
}

function attachStudentScheduleDetailHandlers(studentId) {
  document.getElementById("scheduleDownloadBtn")?.addEventListener("click", () => openScheduleDownloadModal(studentId));
}

// Choix de la langue du DOCUMENT (indépendante de la langue de l'interface
// de l'enseignante) — utile car les élèves sont répartis dans plusieurs
// pays. Suit le même principe que les diplômes/reçus.
function openScheduleDownloadModal(studentId) {
  const slots = studentWeeklySlots(STATE.scheduleSlots || [], studentId);
  const student = (STATE.students || []).find((s) => s.id === studentId);
  const name = student ? student.fullName : (slots[0]?.studentName || "—");
  let chosenLang = STATE.settings.language && ["fr", "en", "it"].includes(STATE.settings.language) ? STATE.settings.language : "fr";

  function render() {
    openModal(`
      <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
      <h3 class="display" style="text-align:center;margin-bottom:14px">${t("scheduleChooseLang")}</h3>
      <div class="lang-row">
        ${["fr", "en", "it"].map((l) => `<button class="${l === chosenLang ? "active" : ""}" data-dl-lang="${l}">${l.toUpperCase()}</button>`).join("")}
      </div>
      <button class="btn secondary block" id="scheduleDlPdfBtn" style="margin:14px 0 10px">⬇ ${t("downloadPDF")}</button>
      <button class="btn gold block" id="scheduleDlPngBtn">⬇ ${t("downloadPNG")}</button>
    `);
    document.querySelectorAll("[data-dl-lang]").forEach((btn) =>
      btn.addEventListener("click", () => { chosenLang = btn.dataset.dlLang; render(); })
    );
    document.getElementById("scheduleDlPdfBtn").addEventListener("click", async () => {
      const { dataUrl } = await buildStudentSchedulePdf({ studentName: name, slots, lang: chosenLang });
      downloadFile(dataUrl, `Emploi_du_temps_${name.replace(/\s+/g, "_")}.pdf`);
      closeModal();
    });
    document.getElementById("scheduleDlPngBtn").addEventListener("click", async () => {
      const dataUrl = await buildStudentScheduleImage({ studentName: name, slots, lang: chosenLang });
      downloadFile(dataUrl, `Emploi_du_temps_${name.replace(/\s+/g, "_")}.png`);
      closeModal();
    });
  }
  render();
}

// Document "Créneaux disponibles" à envoyer aux parents (4 langues), pour
// qu'ils choisissent eux-mêmes un horaire qui leur convient.
function openFreeSlotsDownloadModal() {
  let chosenLang = STATE.settings.language && ["fr", "en", "it"].includes(STATE.settings.language) ? STATE.settings.language : "fr";

  function render() {
    openModal(`
      <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
      <h3 class="display" style="text-align:center;margin-bottom:14px">${t("scheduleChooseLang")}</h3>
      <div class="lang-row">
        ${["fr", "en", "it", "ar"].map((l) => `<button class="${l === chosenLang ? "active" : ""}" data-dl-lang="${l}">${l.toUpperCase()}</button>`).join("")}
      </div>
      ${chosenLang === "ar" ? `<p class="subject-note" style="font-size:12px;margin-top:10px">${t("scheduleArPdfNote")}</p>` : ""}
      <button class="btn secondary block" id="freeDlPdfBtn" style="margin:14px 0 10px">⬇ ${t("downloadPDF")}</button>
      <button class="btn gold block" id="freeDlPngBtn">⬇ ${t("downloadPNG")}</button>
    `);
    document.querySelectorAll("[data-dl-lang]").forEach((btn) =>
      btn.addEventListener("click", () => { chosenLang = btn.dataset.dlLang; render(); })
    );
    document.getElementById("freeDlPdfBtn").addEventListener("click", async () => {
      const { dataUrl } = await buildFreeSlotsPdf({ lang: chosenLang });
      downloadFile(dataUrl, `Creneaux_disponibles_${chosenLang}.pdf`);
      closeModal();
    });
    document.getElementById("freeDlPngBtn").addEventListener("click", async () => {
      const dataUrl = await buildFreeSlotsImage({ lang: chosenLang });
      downloadFile(dataUrl, `Creneaux_disponibles_${chosenLang}.png`);
      closeModal();
    });
  }
  render();
}

// -----------------------------------------------------------------------
window.closeModal = closeModal;
document.addEventListener("DOMContentLoaded", boot);
