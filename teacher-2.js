// =============================================================================
// teacher.js — Espace enseignant complet : tableau de bord d'administration,
// gestion complète des élèves, suivi pédagogique global, statistiques
// avancées. Accessible depuis Réglages (comme l'emploi du temps) — la barre
// de navigation du bas reste inchangée. Nouveau module indépendant :
// n'affecte aucune fonctionnalité existante.
// =============================================================================

async function loadTeacherOverviewData() {
  const [students, allProgress, allBilling, allFamilies, allDiplomas] = await Promise.all([
    DB.getAllStudents(),
    DB.getAllProgressEveryone(),
    DB.getAllBilling(),
    DB.getAllFamilies(),
    DB.getAllDiplomasEveryone(),
  ]);
  return { students, allProgress, allBilling, allFamilies, allDiplomas };
}

function studentProgressMap(allProgress, studentId) {
  const map = {};
  allProgress.filter((r) => r.studentId === studentId).forEach((r) => {
    map[r.sessionId] = map[r.sessionId] || {};
    map[r.sessionId][r.subjectKey] = r;
  });
  return map;
}

function countCompletedSessions(progressMap) {
  return SESSIONS.filter((s) => SUBJECT_TABS.every((tab) => progressMap[s.id]?.[tab.key]?.completed)).length;
}

// Première séance non complétée pour cet élève, ou la dernière si tout est
// déjà fait — sert à afficher "où en est" chaque élève dans le suivi global.
function currentSessionForStudent(progressMap) {
  const next = SESSIONS.find((s) => !SUBJECT_TABS.every((tab) => progressMap[s.id]?.[tab.key]?.completed));
  return next || SESSIONS[SESSIONS.length - 1];
}

function ensureTeacherDataLoaded(onReady) {
  if (STATE.teacherDataLoaded) { onReady(); return; }
  loadTeacherOverviewData().then((data) => {
    STATE.teacherData = data;
    STATE.teacherDataLoaded = true;
    onReady();
  });
}

// =============================================================================
// TABLEAU DE BORD — hub d'accès aux 3 sous-écrans (#/teacher)
// =============================================================================
function renderTeacherHub() {
  return `
    <div class="session-header">
      <h2 class="display">${t("teacherHubTitle")}</h2>
      <button class="btn secondary" data-go="#/settings" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <p class="subject-note" style="margin-bottom:18px;font-size:13px">${t("teacherHubIntro")}</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <button class="btn secondary block" data-go="#/schedule" style="text-align:left;padding:16px">📅 <strong>${t("scheduleManageBtn")}</strong></button>
      <button class="btn secondary block" data-go="#/teacher/students" style="text-align:left;padding:16px">👥 <strong>${t("teacherStudentsBtn")}</strong></button>
      <button class="btn secondary block" data-go="#/teacher/progress" style="text-align:left;padding:16px">📈 <strong>${t("teacherProgressBtn")}</strong></button>
      <button class="btn secondary block" data-go="#/teacher/stats" style="text-align:left;padding:16px">📊 <strong>${t("teacherStatsBtn")}</strong></button>
    </div>
  `;
}

// =============================================================================
// GESTION COMPLÈTE DES ÉLÈVES — liste, recherche, ajout, édition, suppression
// (#/teacher/students)
// =============================================================================
function renderTeacherStudents() {
  if (!STATE.teacherDataLoaded) {
    ensureTeacherDataLoaded(() => { if (STATE.route === "#/teacher/students") renderShell(renderTeacherStudents()); });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">👥</div><p>…</p></div>`;
  }
  const search = (STATE.runtime.teacherStudentSearch || "").trim().toLowerCase();
  const students = STATE.teacherData.students
    .filter((s) => !search || s.fullName.toLowerCase().includes(search))
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return `
    <div class="session-header">
      <h2 class="display">${t("teacherStudentsBtn")}</h2>
      <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <div class="field" style="margin-bottom:14px">
      <input id="teacherStudentSearch" placeholder="🔎 ${t("scheduleSearchPlaceholder")}" value="${STATE.runtime.teacherStudentSearch || ""}" />
    </div>
    <button class="btn gold block" id="teacherAddStudentBtn" style="margin-bottom:16px">➕ ${t("addStudent")}</button>
    ${students.length === 0 ? `<div class="empty-state"><p>${t("scheduleNoStudentFound")}</p></div>` : students.map((s) => {
      const pm = studentProgressMap(STATE.teacherData.allProgress, s.id);
      const completed = countCompletedSessions(pm);
      return `
        <div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="cursor:pointer;flex:1" data-edit-student="${s.id}">
              <div style="font-weight:600">${s.fullName}</div>
              <div style="font-size:12.5px;color:var(--color-ink-soft)">${s.ageGroup === "adult" ? t("ageAdult") : t("ageChild")} · ${completed}/${SESSIONS.length} ${t("teacherSessionsShort")}</div>
              ${s.parentContact ? `<div style="font-size:12px;color:var(--color-ink-soft)">📞 ${s.parentContact}</div>` : ""}
            </div>
            <button class="icon-btn" data-delete-student="${s.id}" title="${t("scheduleDeleteIcon")}">🗑</button>
          </div>
        </div>
      `;
    }).join("")}
  `;
}

function attachTeacherStudentsHandlers() {
  document.getElementById("teacherStudentSearch")?.addEventListener("input", (e) => {
    STATE.runtime.teacherStudentSearch = e.target.value;
    renderShell(renderTeacherStudents());
    attachTeacherStudentsHandlers();
  });
  document.getElementById("teacherAddStudentBtn")?.addEventListener("click", () => openTeacherStudentModal(null));
  document.querySelectorAll("[data-edit-student]").forEach((el) =>
    el.addEventListener("click", () => {
      const student = STATE.teacherData.students.find((s) => s.id === el.dataset.editStudent);
      if (student) openTeacherStudentModal(student);
    })
  );
  document.querySelectorAll("[data-delete-student]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const student = STATE.teacherData.students.find((s) => s.id === btn.dataset.deleteStudent);
      if (!student) return;
      openConfirmModal(
        t("deleteStudentTitle"),
        t("deleteStudentMsg", student.fullName),
        async () => {
          const wasActive = student.id === STATE.activeStudentId;
          await DB.deleteStudentCascade(student.id);
          STATE.teacherDataLoaded = false;
          closeModal();
          toast(t("deleted"));
          if (wasActive) {
            await loadStudentsAndActiveData(null);
            go(STATE.student ? "#/home" : "#/onboarding");
          } else {
            STATE.students = await DB.getAllStudents();
            go("#/teacher/students");
          }
        }
      );
    })
  );
}

// Formulaire ajout/édition (nom, tranche d'âge, contact parent, notes
// privées) — les 2 derniers champs sont nouveaux, en plus de ce qui
// existait déjà (nom + tranche d'âge).
function openTeacherStudentModal(student) {
  const isEdit = !!student;
  const s = student || { fullName: "", ageGroup: "child", parentContact: "", privateNotes: "" };

  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${isEdit ? t("editStudentTitle") : t("addStudent")}</h3>
    <div class="field" style="margin-bottom:12px">
      <label>${t("studentNameLabel")}</label>
      <input id="tsName" value="${s.fullName}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("studentAgeGroupLabel")}</label>
      <select id="tsAgeGroup">
        <option value="child" ${s.ageGroup === "child" ? "selected" : ""}>${t("ageChild")}</option>
        <option value="adult" ${s.ageGroup === "adult" ? "selected" : ""}>${t("ageAdult")}</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("parentContactLabel")}</label>
      <input id="tsParentContact" value="${s.parentContact || ""}" placeholder="+221 77 000 00 00" />
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("privateNotesLabel")}</label>
      <textarea id="tsNotes" rows="3" style="padding:12px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-size:14px;font-family:inherit;resize:vertical">${s.privateNotes || ""}</textarea>
    </div>
    ${!isEdit ? `
      <div class="field" style="margin-bottom:18px">
        <label>${t("startingLevelLabel")}</label>
        <select id="tsStartLevel">
          <option value="1">${t("startingLevelBeginner")}</option>
          ${SESSIONS.filter((sess) => sess.id > 1).map((sess) => `<option value="${sess.id}">${t("startingLevelFrom")} ${sessionTitle(sess)}</option>`).join("")}
          <option value="memorization">${t("startingLevelMemorization")}</option>
        </select>
        <p class="subject-note" style="font-size:12px;margin-top:6px">${t("startingLevelNote")}</p>
      </div>
    ` : ""}
    <button class="btn gold block" id="tsConfirmBtn">${t("savePaymentSettingsBtn")}</button>
  `);

  document.getElementById("tsConfirmBtn").addEventListener("click", async () => {
    const fullName = document.getElementById("tsName").value.trim();
    if (!fullName) { toast(t("scheduleMissingFields")); return; }
    const ageGroup = document.getElementById("tsAgeGroup").value;
    const extra = {
      parentContact: document.getElementById("tsParentContact").value.trim(),
      privateNotes: document.getElementById("tsNotes").value.trim(),
    };
    if (isEdit) {
      await DB.updateStudent(s.id, fullName, ageGroup, extra);
    } else {
      const newStudent = await DB.createStudent(fullName, ageGroup, extra);
      const startLevel = document.getElementById("tsStartLevel")?.value || "1";
      if (startLevel === "memorization") {
        await bulkSkipSessions(newStudent.id, SESSIONS[SESSIONS.length - 1].id);
        await DB.setTrackDecision(newStudent.id, "memorization_started");
      } else if (Number(startLevel) > 1) {
        await bulkSkipSessions(newStudent.id, Number(startLevel) - 1);
      }
    }
    STATE.teacherDataLoaded = false;
    STATE.students = await DB.getAllStudents();
    closeModal();
    go("#/teacher/students");
    toast("OK");
  });
}

// Marque comme acquises toutes les matières des séances 1 à N (incluse) —
// utilisé pour démarrer un élève déjà avancé sans lui faire repasser des
// séances qu'il maîtrise déjà.
async function bulkSkipSessions(studentId, uptoInclusiveSessionId) {
  const sessionsToSkip = SESSIONS.filter((s) => s.id <= uptoInclusiveSessionId);
  for (const session of sessionsToSkip) {
    for (const tab of SUBJECT_TABS) {
      await DB.saveSubjectProgress(studentId, session.id, tab.key, { completed: true });
    }
  }
}

// =============================================================================
// SUIVI PÉDAGOGIQUE GLOBAL — progression de tous les élèves en un coup
// d'œil (#/teacher/progress)
// =============================================================================
function renderTeacherProgress() {
  if (!STATE.teacherDataLoaded) {
    ensureTeacherDataLoaded(() => { if (STATE.route === "#/teacher/progress") renderShell(renderTeacherProgress()); });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">📈</div><p>…</p></div>`;
  }
  const rows = STATE.teacherData.students
    .map((s) => {
      const pm = studentProgressMap(STATE.teacherData.allProgress, s.id);
      const completed = countCompletedSessions(pm);
      const current = currentSessionForStudent(pm);
      return { s, completed, current };
    })
    .sort((a, b) => b.completed - a.completed);

  return `
    <div class="session-header">
      <h2 class="display">${t("teacherProgressBtn")}</h2>
      <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    ${rows.length === 0 ? `<div class="empty-state"><p>${t("scheduleNoStudentFound")}</p></div>` : rows.map(({ s, completed, current }) => `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-weight:600">${s.fullName}</div>
          <div style="font-size:12.5px;color:var(--color-ink-soft)">${completed}/${SESSIONS.length}</div>
        </div>
        <div style="height:7px;border-radius:4px;background:var(--color-surface-2);overflow:hidden">
          <div style="height:100%;width:${Math.round((completed / SESSIONS.length) * 100)}%;background:var(--color-primary)"></div>
        </div>
        <div style="font-size:12px;color:var(--color-ink-soft);margin-top:8px">${t("teacherCurrentSession")} : ${sessionTitle(current)}</div>
      </div>
    `).join("")}
  `;
}

// =============================================================================
// STATISTIQUES AVANCÉES (pédagogiques) — vue d'ensemble chiffrée
// (#/teacher/stats)
// =============================================================================
function renderTeacherStats() {
  if (!STATE.teacherDataLoaded) {
    ensureTeacherDataLoaded(() => { if (STATE.route === "#/teacher/stats") renderShell(renderTeacherStats()); });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">📊</div><p>…</p></div>`;
  }
  const students = STATE.teacherData.students;
  const total = students.length;
  const completions = students.map((s) => countCompletedSessions(studentProgressMap(STATE.teacherData.allProgress, s.id)));
  const avgCompleted = total ? Math.round((completions.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;
  const fullyCompleted = completions.filter((c) => c === SESSIONS.length).length;
  const totalDiplomas = STATE.teacherData.allDiplomas.length;

  return `
    <div class="session-header">
      <h2 class="display">${t("teacherStatsBtn")}</h2>
      <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <div class="card" style="display:flex;justify-content:space-around;text-align:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div><div style="font-size:22px;font-weight:700">${total}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("teacherTotalStudents")}</div></div>
      <div><div style="font-size:22px;font-weight:700">${avgCompleted}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("teacherAvgSessions")}</div></div>
      <div><div style="font-size:22px;font-weight:700">${fullyCompleted}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("teacherFullyCompleted")}</div></div>
      <div><div style="font-size:22px;font-weight:700">${totalDiplomas}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("teacherDiplomasIssued")}</div></div>
    </div>
    <div class="card">
      <h3 class="display" style="margin-bottom:12px;font-size:17px">${t("teacherDistributionTitle")}</h3>
      ${SESSIONS.map((session) => {
        const count = total ? completions.filter((c) => c >= session.id).length : 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span>${sessionTitle(session)}</span><span style="color:var(--color-ink-soft)">${count}/${total}</span>
            </div>
            <div style="height:6px;border-radius:4px;background:var(--color-surface-2);overflow:hidden">
              <div style="height:100%;width:${pct}%;background:var(--color-accent)"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}
