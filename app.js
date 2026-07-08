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

// -----------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------
async function boot() {
  const savedSettings = await DB.getSettings();
  if (savedSettings) STATE.settings = { language: savedSettings.language, theme: savedSettings.theme, activeStudentId: savedSettings.activeStudentId || null, payment: savedSettings.payment };
  STATE.settings.payment = { ...defaultPaymentSettings(), ...(STATE.settings.payment || {}) };
  applyTheme();

  await loadStudentsAndActiveData(STATE.settings.activeStudentId);

  window.addEventListener("hashchange", route);
  STATE.route = STATE.student ? (location.hash || "#/home") : "#/onboarding";
  location.hash = STATE.route;
  route();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

function defaultPaymentSettings() {
  return {
    academyName: "Seyda Zeynab Academy", teacherName: "",
    whatsapp: "", phone: "", email: "", address: "", website: "",
    receiptQuote: "La science est une lumière, apprends-la et transmets-la.",
    receiptQuoteAuthor: "Prophète Muhammad ﷺ",
    receiptThanks: "Merci pour votre confiance.",
    receiptWish: "Qu'Allah facilite ton apprentissage et t'accorde la réussite.",
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
  if (!STATE.student && hash !== "#/onboarding") { location.hash = "#/onboarding"; return; }

  if (hash === "#/onboarding") return renderOnboarding();
  if (hash === "#/home") return renderShell(renderHome());
  if (hash === "#/progress") return renderShell(renderProgress());
  if (hash === "#/diplomas") return renderShell(renderDiplomas());
  if (hash === "#/settings") return renderShell(renderSettings());
  if (hash === "#/memorization") return renderShell(renderMemorizationScreen());
  if (hash === "#/payments") return renderShell(renderPaymentsList());
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
  if (STATE.route === "#/home") attachHomeHandlers();
  if (STATE.route === "#/progress") attachProgressHandlers();
  if (STATE.route === "#/diplomas") attachDiplomaHandlers();
  if (STATE.route === "#/settings") attachSettingsHandlers();
  if (STATE.route === "#/memorization") attachMemorizationHandlers();
  if (STATE.route === "#/payments") attachPaymentsListHandlers();
  if (STATE.route === "#/families") attachFamiliesManagerHandlers();
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
        <button class="btn ${s.id === STATE.activeStudentId ? "" : "secondary"}" data-switch-id="${s.id}">
          ${s.id === STATE.activeStudentId ? "✓ " : ""}${s.fullName}
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
    <div class="hero-card">
      <div class="greeting">${t("greeting")},</div>
      <div class="name">${STATE.student?.fullName || ""}</div>
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
    const { dataUrl, filename, studentName } = await generateBulletin(type, sessionId, chosenLang, comment, observations);
    closeModal();
    shareFile(dataUrl, filename, `${t("generateBulletin")} — ${studentName}`);
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
      if (d) shareDiploma(d);
    })
  );
}

// -----------------------------------------------------------------------
// Réglages
// -----------------------------------------------------------------------
function renderSettings() {
  return `
    <div class="section-title">${t("myStudents")}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px">
      ${STATE.students.map((s) => `
        <button class="path-item" data-select-student="${s.id}" style="background:var(--color-surface);box-shadow:var(--shadow-card)">
          <div class="star8 ${s.id === STATE.activeStudentId ? "done" : ""}">${s.id === STATE.activeStudentId ? "✓" : "👤"}</div>
          <div class="meta"><div class="title">${s.fullName}</div></div>
        </button>
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

    <div class="section-title">${t("teacherSpace")}</div>
    <div class="card" style="font-size:13px;color:var(--color-ink-soft)">${t("teacherSpaceSoon")}</div>
  `;
}
function attachSettingsHandlers() {
  document.getElementById("openPaymentSettingsBtn").addEventListener("click", openPaymentSettingsModal);
  document.querySelectorAll("[data-select-student]").forEach((btn) =>
    btn.addEventListener("click", () => switchActiveStudent(btn.dataset.selectStudent))
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

function openPaymentSettingsModal() {
  const ps = STATE.settings.payment;
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
    <div class="field" style="margin-bottom:12px">
      <label>${t("receiptQuoteLabel")}</label>
      <input id="psQuote" value="${ps.receiptQuote || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("receiptQuoteAuthorLabel")}</label>
      <input id="psQuoteAuthor" value="${ps.receiptQuoteAuthor || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("receiptThanksLabel")}</label>
      <input id="psThanks" value="${ps.receiptThanks || ""}" />
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("receiptWishLabel")}</label>
      <input id="psWish" value="${ps.receiptWish || ""}" />
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
  document.getElementById("confirmPaymentSettingsBtn").addEventListener("click", async () => {
    Object.assign(STATE.settings.payment, {
      whatsapp: document.getElementById("psWhatsapp").value.trim(),
      phone: document.getElementById("psPhone").value.trim(),
      email: document.getElementById("psEmail").value.trim(),
      address: document.getElementById("psAddress").value.trim(),
      website: document.getElementById("psWebsite").value.trim(),
      receiptQuote: document.getElementById("psQuote").value.trim(),
      receiptQuoteAuthor: document.getElementById("psQuoteAuthor").value.trim(),
      receiptThanks: document.getElementById("psThanks").value.trim(),
      receiptWish: document.getElementById("psWish").value.trim(),
      currencies: document.getElementById("psCurrencies").value.split(",").map((s) => s.trim()).filter(Boolean),
      paymentMethods: document.getElementById("psMethods").value.split(",").map((s) => s.trim()).filter(Boolean),
    });
    await savePaymentSettings();
    closeModal();
    toast("OK");
  });
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

  const statusOrder = { unpaid: 0, partial: 1, pending: 2, paused: 3, paid: 4 };
  const rows = entities
    .map((e) => ({ e, st: computeBillingStatus(e) }))
    .sort((a, b) => (statusOrder[a.st.status] ?? 9) - (statusOrder[b.st.status] ?? 9))
    .map(({ e, st }) => `
      <button class="path-item" data-entity="${e.id}" style="background:var(--color-surface);box-shadow:var(--shadow-card)">
        <div class="star8 ${st.status === "paid" ? "done" : st.status === "unpaid" ? "" : "active"}">${e.kind === "family" ? "👪" : "👤"}</div>
        <div class="meta">
          <div class="title">${e.name}</div>
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
    <button class="btn secondary block" id="managePauseBtn" style="margin-bottom:20px">${entity.pause?.active ? "⏸ " + t("pauseActive") : "⏸ " + t("activatePauseBtn")}</button>

    <div class="section-title">${t("paymentHistory")}</div>
    ${paymentsHtml}
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
  document.querySelectorAll("[data-receipt]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const payment = entity.payments.find((p) => p.id === btn.dataset.receipt);
      if (payment) openReceiptLangModal(entity, payment);
    })
  );
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
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await DB.deleteFamily(btn.dataset.deleteFamily);
      invalidateBillingCache();
      renderShell(renderFamiliesManager());
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



// -----------------------------------------------------------------------
window.closeModal = closeModal;
document.addEventListener("DOMContentLoaded", boot);
