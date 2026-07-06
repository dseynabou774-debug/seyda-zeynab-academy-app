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
  if (savedSettings) STATE.settings = { language: savedSettings.language, theme: savedSettings.theme, activeStudentId: savedSettings.activeStudentId || null };
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
  if (STATE.student) {
    const rows = await DB.getAllProgress(activeId);
    rows.forEach((r) => {
      STATE.progress[r.sessionId] = STATE.progress[r.sessionId] || {};
      STATE.progress[r.sessionId][r.subjectKey] = r;
    });
    STATE.badges = await DB.getAllBadges(activeId);
    STATE.diplomas = await DB.getAllDiplomas(activeId);
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
  const sessionMatch = hash.match(/^#\/session\/(\d+)$/);
  if (sessionMatch) return renderShell(renderSessionScreen(Number(sessionMatch[1])));
  return renderShell(renderHome());
}

// -----------------------------------------------------------------------
// Shell (topbar + bottom nav) commun à tous les écrans "logués"
// -----------------------------------------------------------------------
function renderShell(mainHtml) {
  const nav = [
    { hash: "#/home", icon: "◐", label: t("nav_home") },
    { hash: "#/progress", icon: "◆", label: t("nav_progress") },
    { hash: "#/diplomas", icon: "❖", label: t("nav_diplomas") },
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
        <button class="nav-btn ${STATE.route === n.hash ? "active" : ""}" data-go="${n.hash}">
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
  if (STATE.route === "#/diplomas") attachDiplomaHandlers();
  if (STATE.route === "#/settings") attachSettingsHandlers();
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
  `;
}

function attachHomeHandlers() {
  document.querySelectorAll(".path-item").forEach((el) =>
    el.addEventListener("click", () => {
      const locked = el.dataset.locked === "true";
      const session = SESSIONS.find((s) => s.id === Number(el.dataset.session));
      if (locked) { toast(t("sessionLockedMsg", sessionTitle(session))); return; }
      go(`#/session/${session.id}`);
    })
  );
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
    <div class="section-title">${t("badges_title")}</div>
    <div class="badge-grid">${badgeGrid}</div>
  `;
}

// -----------------------------------------------------------------------
// Diplômes
// -----------------------------------------------------------------------
function renderDiplomas() {
  if (!STATE.diplomas.length) {
    return `<div class="empty-state"><div class="star8">❖</div><p>${t("diplomas_empty")}</p></div>`;
  }
  const items = [...STATE.diplomas].sort((a, b) => b.issuedAt - a.issuedAt).map((d) => `
    <div class="diploma-item" data-id="${d.id}">
      <div class="icon">🏅</div>
      <div class="meta">
        <div class="title">${d.levelTitle}</div>
        <div class="sub">${d.studentName} · ${new Date(d.issuedAt).toLocaleDateString()}</div>
      </div>
      <button class="icon-btn" data-dl="${d.id}">⬇</button>
    </div>
  `).join("");
  return `<div class="section-title">${t("diplomas_title")}</div>${items}`;
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

    <div class="section-title">${t("teacherSpace")}</div>
    <div class="card" style="font-size:13px;color:var(--color-ink-soft)">${t("teacherSpaceSoon")}</div>
  `;
}
function attachSettingsHandlers() {
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

// -----------------------------------------------------------------------
window.closeModal = closeModal;
document.addEventListener("DOMContentLoaded", boot);
