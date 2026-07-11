// =============================================================================
// teacher.js — Espace enseignant complet : tableau de bord d'administration,
// gestion complète des élèves, suivi pédagogique global, statistiques
// avancées. Accessible depuis Réglages (comme l'emploi du temps) — la barre
// de navigation du bas reste inchangée. Nouveau module indépendant :
// n'affecte aucune fonctionnalité existante.
// =============================================================================

async function loadTeacherOverviewData() {
  const [students, allProgress, allBilling, allFamilies, allDiplomas, allMemorization] = await Promise.all([
    DB.getAllStudents(),
    DB.getAllProgressEveryone(),
    DB.getAllBilling(),
    DB.getAllFamilies(),
    DB.getAllDiplomasEveryone(),
    DB.getAllMemorizationEveryone(),
  ]);
  return { students, allProgress, allBilling, allFamilies, allDiplomas, allMemorization };
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
      <button class="btn secondary block" data-go="#/teacher/revisions" style="text-align:left;padding:16px">🔄 <strong>${t("teacherRevisionsBtn")}</strong></button>
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
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div style="cursor:pointer;flex:1;display:flex;align-items:center;gap:10px" data-edit-student="${s.id}">
              ${avatarHtml(s.fullName, s.photo, 40)}
              <div>
                <div style="font-weight:600">${s.fullName}</div>
                <div style="font-size:12.5px;color:var(--color-ink-soft)">${s.ageGroup === "adult" ? t("ageAdult") : t("ageChild")} · ${completed}/${SESSIONS.length} ${t("teacherSessionsShort")}</div>
                ${s.parentContact ? `<a href="${whatsappLink(s.parentContact, "")}" target="_blank" onclick="event.stopPropagation()" style="font-size:12px;color:var(--color-primary);text-decoration:none;display:inline-block;margin-top:2px">📞 ${s.parentContact}</a>` : ""}
              </div>
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
    el.addEventListener("click", () => go(`#/student/${encodeURIComponent(el.dataset.editStudent)}`))
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
  const s = student || { fullName: "", ageGroup: "child", parentContact: "", privateNotes: "", photo: null };
  let currentPhoto = s.photo || null;

  function renderPhotoBlock() {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px">
        <div id="tsPhotoPreview">${avatarHtml(s.fullName || "?", currentPhoto, 84)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button type="button" class="btn secondary" id="tsPhotoCameraBtn" style="padding:8px 12px;font-size:12.5px">📷 ${t("photoTakeBtn")}</button>
          <button type="button" class="btn secondary" id="tsPhotoGalleryBtn" style="padding:8px 12px;font-size:12.5px">🖼️ ${t("photoGalleryBtn")}</button>
          ${currentPhoto ? `<button type="button" class="btn secondary" id="tsPhotoDeleteBtn" style="padding:8px 12px;font-size:12.5px;color:var(--color-danger)">🗑 ${t("photoDeleteBtn")}</button>` : ""}
        </div>
        <input type="file" accept="image/*" capture="environment" id="tsPhotoCameraInput" style="display:none" />
        <input type="file" accept="image/*" id="tsPhotoGalleryInput" style="display:none" />
      </div>
    `;
  }

  function attachPhotoHandlers() {
    const pickBtn = document.getElementById("tsPickContactBtn");
    if (pickBtn && "contacts" in navigator && "ContactsManager" in window) {
      pickBtn.style.display = "inline-block";
      pickBtn.addEventListener("click", async () => {
        try {
          const contacts = await navigator.contacts.select(["tel"], { multiple: false });
          if (contacts && contacts[0] && contacts[0].tel && contacts[0].tel[0]) {
            document.getElementById("tsParentContact").value = contacts[0].tel[0];
          }
        } catch (e) { /* annulé par l'utilisateur ou non autorisé */ }
      });
    }
    document.getElementById("tsPhotoCameraBtn").addEventListener("click", () => document.getElementById("tsPhotoCameraInput").click());
    document.getElementById("tsPhotoGalleryBtn").addEventListener("click", () => document.getElementById("tsPhotoGalleryInput").click());
    document.getElementById("tsPhotoDeleteBtn")?.addEventListener("click", () => {
      currentPhoto = null;
      document.getElementById("tsPhotoPreview").innerHTML = avatarHtml(document.getElementById("tsName")?.value || s.fullName || "?", null, 84);
      renderModal(); // ré-affiche le formulaire pour retirer le bouton "Supprimer"
    });
    ["tsPhotoCameraInput", "tsPhotoGalleryInput"].forEach((id) => {
      document.getElementById(id).addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          currentPhoto = await resizeImageToDataUrl(file, 320);
          document.getElementById("tsPhotoPreview").innerHTML = avatarHtml(document.getElementById("tsName")?.value || s.fullName || "?", currentPhoto, 84);
          renderModal();
        } catch (err) { toast(t("photoError")); }
      });
    });
  }

  function renderModal() {
    openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${isEdit ? t("editStudentTitle") : t("addStudent")}</h3>
    ${renderPhotoBlock()}
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
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="field" style="flex:1">
        <label>${t("studentGenderLabel")}</label>
        <select id="tsGender">
          <option value="" ${!s.gender ? "selected" : ""}>—</option>
          <option value="female" ${s.gender === "female" ? "selected" : ""}>${t("genderFemale")}</option>
          <option value="male" ${s.gender === "male" ? "selected" : ""}>${t("genderMale")}</option>
        </select>
      </div>
      <div class="field" style="flex:1">
        <label>${t("studentBirthDateLabel")}</label>
        <input id="tsBirthDate" type="date" value="${s.birthDate || ""}" />
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="field" style="flex:1">
        <label>${t("billingCountry")}</label>
        <select id="tsCountry">
          <option value="">—</option>
          ${DISCOVER_COUNTRIES.map((cc) => `<option value="${cc}" ${s.country === cc ? "selected" : ""}>${STATE.settings.discover.countries[cc]?.label || cc}</option>`).join("")}
        </select>
      </div>
      <div class="field" style="flex:1">
        <label>${t("studentStatusLabel")}</label>
        <select id="tsStatus">
          <option value="active" ${(s.status || "active") === "active" ? "selected" : ""}>${t("statusActive")}</option>
          <option value="paused" ${s.status === "paused" ? "selected" : ""}>${t("statusPaused")}</option>
          <option value="former" ${s.status === "former" ? "selected" : ""}>${t("statusFormer")}</option>
        </select>
      </div>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("parentNameLabel")}</label>
      <input id="tsParentName" value="${s.parentName || ""}" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("parentContactLabel")}</label>
      <div style="display:flex;gap:8px">
        <input id="tsParentContact" value="${s.parentContact || ""}" placeholder="+221 77 000 00 00" style="flex:1" />
        <button type="button" class="btn secondary" id="tsPickContactBtn" style="padding:0 14px;white-space:nowrap;display:none">📇 ${t("pickContactBtn")}</button>
      </div>
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
    ` : `
      <div class="field" style="margin-bottom:18px">
        <label>${t("adjustLevelLabel")}</label>
        <select id="tsAdjustLevel">
          <option value="">${t("adjustLevelNone")}</option>
          <option value="1">${t("startingLevelBeginner")}</option>
          ${SESSIONS.filter((sess) => sess.id > 1).map((sess) => `<option value="${sess.id}">${t("startingLevelFrom")} ${sessionTitle(sess)}</option>`).join("")}
          <option value="memorization">${t("startingLevelMemorization")}</option>
        </select>
        <p class="subject-note" style="font-size:12px;margin-top:6px">${t("adjustLevelNote")}</p>
      </div>
    `}
    <button class="btn gold block" id="tsConfirmBtn">${t("savePaymentSettingsBtn")}</button>
  `);
    attachPhotoHandlers();
    document.getElementById("tsConfirmBtn").addEventListener("click", async () => {
      const fullName = document.getElementById("tsName").value.trim();
      if (!fullName) { toast(t("scheduleMissingFields")); return; }
      const ageGroup = document.getElementById("tsAgeGroup").value;
      const extra = {
        parentContact: document.getElementById("tsParentContact").value.trim(),
        privateNotes: document.getElementById("tsNotes").value.trim(),
        photo: currentPhoto,
        gender: document.getElementById("tsGender").value,
        birthDate: document.getElementById("tsBirthDate").value,
        country: document.getElementById("tsCountry").value,
        status: document.getElementById("tsStatus").value,
        parentName: document.getElementById("tsParentName").value.trim(),
      };
      if (isEdit) {
        await DB.updateStudent(s.id, fullName, ageGroup, extra);
        const adjustLevel = document.getElementById("tsAdjustLevel")?.value || "";
        if (adjustLevel === "memorization") {
          await bulkSkipSessions(s.id, SESSIONS[SESSIONS.length - 1].id);
          await DB.setTrackDecision(s.id, "memorization_started");
        } else if (adjustLevel && Number(adjustLevel) > 1) {
          await bulkSkipSessions(s.id, Number(adjustLevel) - 1);
        }
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
      STATE.studentProfileLoaded = false;
      STATE.students = await DB.getAllStudents();
      closeModal();
      go("#/teacher/students");
      toast("OK");
    });
  }
  renderModal();
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            ${avatarHtml(s.fullName, s.photo, 32)}
            <div style="font-weight:600">${s.fullName}</div>
          </div>
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
// =============================================================================
// SUIVI DES RÉVISIONS (muraja'a) — tous les Juz' à réviser, tous élèves
// confondus, triés du plus en retard au moins en retard.
// (#/teacher/revisions)
// =============================================================================
function renderTeacherRevisions() {
  if (!STATE.teacherDataLoaded) {
    ensureTeacherDataLoaded(() => { if (STATE.route === "#/teacher/revisions") renderShell(renderTeacherRevisions()); });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">🔄</div><p>…</p></div>`;
  }
  const allMemo = STATE.teacherData.allMemorization || [];
  const rows = [];
  STATE.teacherData.students.forEach((s) => {
    JUZ_LIST.forEach((juz) => {
      const record = allMemo.find((m) => m.studentId === s.id && m.juzId === juz.id);
      if (juzNeedsRevision(record)) {
        rows.push({ student: s, juz, days: daysSinceRevision(record) });
      }
    });
  });
  rows.sort((a, b) => b.days - a.days);

  return `
    <div class="session-header">
      <h2 class="display">${t("teacherRevisionsBtn")}</h2>
      <button class="btn secondary" data-go="#/teacher" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
    <p class="subject-note" style="margin-bottom:16px;font-size:13px">${t("teacherRevisionsIntro")}</p>
    ${rows.length === 0 ? `<div class="empty-state"><div class="star8">✓</div><p>${t("noRevisionsDue")}</p></div>` : rows.map(({ student, juz, days }) => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          ${avatarHtml(student.fullName, student.photo, 32)}
          <div style="flex:1">
            <div style="font-weight:600">${student.fullName}</div>
            <div style="font-size:12.5px;color:var(--color-ink-soft)" class="arabic">${juz.name_ar} — ${juzLabel(juz)}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:${days > 30 ? "var(--color-danger)" : "var(--color-accent)"}">${t("daysSinceRevision", days)}</div>
        </div>
        <button class="btn gold" data-log-revision="${student.id}::${juz.id}" style="padding:6px 14px;font-size:12px">🔄 ${t("logRevisionBtn")}</button>
      </div>
    `).join("")}
  `;
}
function attachTeacherRevisionsHandlers() {
  document.querySelectorAll("[data-log-revision]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const [studentId, juzId] = btn.dataset.logRevision.split("::");
      await DB.logJuzRevision(studentId, Number(juzId));
      STATE.teacherDataLoaded = false;
      toast(t("revisionLoggedToast"));
      go("#/teacher/revisions");
    })
  );
}

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
