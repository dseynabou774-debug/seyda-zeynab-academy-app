// =============================================================================
// FICHE COMPLÈTE ÉLÈVE — regroupe en une seule page : informations
// générales, suivi pédagogique, carnet de suivi pédagogique, suivi détaillé
// du Coran (sourate/versets), emploi du temps, paiements, diplômes/bulletins
// et statistiques. Accessible en appuyant sur un élève depuis "Gérer les
// élèves". Nouveau module indépendant : n'affecte aucune fonctionnalité
// existante, tout est réutilisé (avatar, progression, facturation, etc.).
// =============================================================================

async function loadStudentProfileData(studentId) {
  await ensureBillingEntitiesLoaded();
  const [allProgress, memorization, notes, quranEntries, topicEntries, alphabetEntries, scheduleSlots, courseLogs, diplomas, surahChecklist] = await Promise.all([
    DB.getAllProgressEveryone().then((rows) => rows.filter((r) => r.studentId === studentId)),
    DB.getAllMemorization(studentId),
    DB.getAllStudentNotes(studentId),
    DB.getAllQuranTracking(studentId),
    DB.getAllTopicTracking(studentId),
    DB.getAllAlphabetTracking(studentId),
    DB.getAllScheduleSlots(),
    DB.getAllCourseLogs(),
    DB.getAllDiplomas(studentId),
    DB.getSurahChecklist(studentId),
  ]);
  const progressMap = {};
  allProgress.forEach((r) => {
    progressMap[r.sessionId] = progressMap[r.sessionId] || {};
    progressMap[r.sessionId][r.subjectKey] = r;
  });
  return { progressMap, memorization, notes, quranEntries, topicEntries, alphabetEntries, scheduleSlots, courseLogs, diplomas, surahChecklist };
}

function renderStudentProfile(studentId) {
  const student = (STATE.students || []).find((s) => s.id === studentId);
  if (!student) {
    return `<div class="empty-state"><div class="star8">👤</div><p>${t("scheduleNoStudentFound")}</p></div>`;
  }
  if (!STATE.studentProfileLoaded || STATE.studentProfileId !== studentId) {
    loadStudentProfileData(studentId).then((data) => {
      STATE.studentProfileData = data;
      STATE.studentProfileId = studentId;
      STATE.studentProfileLoaded = true;
      if (STATE.route === `#/student/${studentId}`) renderShell(renderStudentProfile(studentId));
    });
    return `<div class="empty-state" style="padding:60px 20px;text-align:center"><div class="star8" style="margin:0 auto 14px">👤</div><p>…</p></div>`;
  }
  const data = STATE.studentProfileData;
  const lang = STATE.settings.language || "fr";

  return `
    ${renderProfileHeader(student)}
    <div style="display:flex;flex-direction:column;gap:16px">
      ${renderProfileGeneralInfo(student)}
      ${renderProfilePedagogicalSummary(student, data, lang)}
      ${renderProfileJournal(student, data)}
      ${renderProfileQuranTracking(student, data)}
      ${renderProfileAlphabetTracking(student, data)}
      ${renderProfileSurahChecklist(student, data)}
      ${renderProfileTopicTracking(student, data)}
      ${renderProfileReportGenerator(student)}
      ${renderProfileSchedule(student, data, lang)}
      ${renderProfilePayments(student)}
      ${renderProfileDiplomas(student, data)}
      ${renderProfileStats(student, data)}
    </div>
  `;
}

function attachStudentProfileHandlers(studentId) {
  const student = (STATE.students || []).find((s) => s.id === studentId);
  if (!student) return;
  document.getElementById("spEditInfoBtn")?.addEventListener("click", () => openTeacherStudentModal(student));
  document.getElementById("spAddNoteBtn")?.addEventListener("click", () => openStudentNoteModal(studentId));
  document.querySelectorAll("[data-edit-note]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const note = STATE.studentProfileData.notes.find((n) => n.id === btn.dataset.editNote);
      if (note) openStudentNoteModal(studentId, note);
    })
  );
  document.getElementById("spAddQuranBtn")?.addEventListener("click", () => openQuranTrackingModal(studentId));
  document.querySelectorAll("[data-edit-quran]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const entry = STATE.studentProfileData.quranEntries.find((q) => q.id === btn.dataset.editQuran);
      if (entry) openQuranTrackingModal(studentId, entry);
    })
  );
  document.querySelectorAll("[data-add-topic]").forEach((btn) =>
    btn.addEventListener("click", () => openTopicTrackingModal(studentId, btn.dataset.addTopic, null))
  );
  document.querySelectorAll("[data-edit-topic]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const entry = STATE.studentProfileData.topicEntries.find((q) => q.id === btn.dataset.editTopic);
      if (entry) openTopicTrackingModal(studentId, entry.subject, entry);
    })
  );
  document.getElementById("spAddAlphabetBtn")?.addEventListener("click", () => openAlphabetTrackingModal(studentId));
  document.querySelectorAll("[data-edit-alphabet]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const entry = STATE.studentProfileData.alphabetEntries.find((a) => a.id === btn.dataset.editAlphabet);
      if (entry) openAlphabetTrackingModal(studentId, entry);
    })
  );
  attachSurahChecklistHandlers(studentId);
  document.getElementById("spGenerateReportBtn")?.addEventListener("click", () => openDetailedReportModal(studentId));
  document.getElementById("spEditScheduleBtn")?.addEventListener("click", () => go("#/schedule"));
  document.getElementById("spPaymentsBtn")?.addEventListener("click", () => {
    const entity = (STATE.billingEntities || []).find((e) => e.refId === studentId || (e.members || []).some((m) => m.id === studentId));
    if (entity) go(`#/payment/${encodeURIComponent(entity.id)}`);
    else go(`#/payment/${encodeURIComponent("s_" + studentId)}`);
  });
  document.querySelectorAll("[data-sp-dl-diploma]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const d = STATE.studentProfileData.diplomas.find((x) => x.id === btn.dataset.spDlDiploma);
      if (d) openDiplomaFormatModal(d);
    })
  );
}

// -----------------------------------------------------------------------
// En-tête : avatar, nom, statut
// -----------------------------------------------------------------------
function renderProfileHeader(student) {
  const statusLabel = { active: t("statusActive"), paused: t("statusPaused"), former: t("statusFormer") }[student.status || "active"];
  const statusColor = { active: "var(--color-success)", paused: "var(--color-accent)", former: "var(--color-ink-soft)" }[student.status || "active"];
  return `
    <div class="session-header">
      <div style="display:flex;align-items:center;gap:12px">
        ${avatarHtml(student.fullName, student.photo, 56)}
        <div>
          <h2 class="display" style="margin-bottom:2px">${student.fullName}</h2>
          <span style="font-size:12px;font-weight:600;color:${statusColor}">● ${statusLabel}</span>
        </div>
      </div>
      <button class="btn secondary" data-go="#/teacher/students" style="padding:8px 16px;font-size:12.5px">${t("previous")}</button>
    </div>
  `;
}

// -----------------------------------------------------------------------
// 1. Informations générales
// -----------------------------------------------------------------------
function renderProfileGeneralInfo(student) {
  const genderLabel = student.gender === "female" ? t("genderFemale") : student.gender === "male" ? t("genderMale") : "—";
  const countryLabel = student.country ? (STATE.settings.discover.countries[student.country]?.label || student.country) : "—";
  const age = student.birthDate ? Math.floor((Date.now() - new Date(student.birthDate).getTime()) / 31557600000) : null;
  const rows = [
    [t("studentGenderLabel"), genderLabel],
    [t("ageLabel"), age !== null ? `${age} ${t("yearsOld")}` : (student.ageGroup === "adult" ? t("ageAdult") : t("ageChild"))],
    [t("studentBirthDateLabel"), student.birthDate || "—"],
    [t("billingCountry"), countryLabel],
    [t("parentNameLabel"), student.parentName || "—"],
    [t("parentContactLabel"), student.parentContact ? `<a href="${whatsappLink(student.parentContact, "")}" target="_blank" style="color:var(--color-primary);text-decoration:none">📞 ${student.parentContact}</a>` : "—"],
    [t("registeredOnLabel"), student.createdAt ? new Date(student.createdAt).toLocaleDateString() : "—"],
  ];
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 class="display" style="font-size:16px">👤 ${t("sectionGeneralInfo")}</h3>
        <button class="icon-btn" id="spEditInfoBtn">✏️</button>
      </div>
      ${rows.map(([label, val]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-surface-2);font-size:13.5px">
          <span style="color:var(--color-ink-soft)">${label}</span><span style="font-weight:600;text-align:right">${val}</span>
        </div>
      `).join("")}
      ${student.privateNotes ? `<p class="subject-note" style="margin-top:10px;font-size:12.5px">${student.privateNotes}</p>` : ""}
    </div>
  `;
}

// -----------------------------------------------------------------------
// 2. Suivi pédagogique
// -----------------------------------------------------------------------
function renderProfilePedagogicalSummary(student, data, lang) {
  const completed = SESSIONS.filter((s) => SUBJECT_TABS.every((tab) => data.progressMap[s.id]?.[tab.key]?.completed)).length;
  const nextSession = SESSIONS.find((s) => !SUBJECT_TABS.every((tab) => data.progressMap[s.id]?.[tab.key]?.completed)) || SESSIONS[SESSIONS.length - 1];
  const memoByJuz = Object.fromEntries((data.memorization || []).map((m) => [m.juzId, m]));
  const juzDone = JUZ_LIST.filter((j) => memoByJuz[j.id]?.completed).length;
  const juzDueCount = JUZ_LIST.filter((j) => juzNeedsRevision(memoByJuz[j.id])).length;
  const onMemorization = student.trackDecision === "memorization_started";

  return `
    <div class="card">
      <h3 class="display" style="font-size:16px;margin-bottom:12px">📚 ${t("sectionPedagogicalTracking")}</h3>
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span>${t("readingLevel")}</span><span style="font-weight:600">${completed}/${SESSIONS.length}</span>
        </div>
        <div style="height:7px;border-radius:4px;background:var(--color-surface-2);overflow:hidden">
          <div style="height:100%;width:${Math.round((completed / SESSIONS.length) * 100)}%;background:var(--color-primary)"></div>
        </div>
      </div>
      ${onMemorization ? `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span>${t("memorizationProgress")}</span><span style="font-weight:600">${juzDone}/${JUZ_LIST.length}</span>
          </div>
          <div style="height:7px;border-radius:4px;background:var(--color-surface-2);overflow:hidden">
            <div style="height:100%;width:${Math.round((juzDone / JUZ_LIST.length) * 100)}%;background:var(--color-accent)"></div>
          </div>
          ${juzDueCount > 0 ? `<div style="margin-top:6px;font-size:12px;color:var(--color-accent);font-weight:600">🔄 ${t("revisionDueCount", juzDueCount)}</div>` : ""}
        </div>
      ` : ""}
      <div style="font-size:12.5px;color:var(--color-ink-soft)">${t("nextStepLabel")} : ${completed >= SESSIONS.length ? t("memorizationProgress") : sessionTitle(nextSession, lang)}</div>
    </div>
  `;
}

// -----------------------------------------------------------------------
// 3. Carnet de suivi pédagogique
// -----------------------------------------------------------------------
function renderProfileJournal(student, data) {
  const notes = (data.notes || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="display" style="font-size:16px">📝 ${t("sectionJournal")}</h3>
        <button class="btn gold" id="spAddNoteBtn" style="padding:6px 14px;font-size:12px">➕ ${t("addNoteBtn")}</button>
      </div>
      ${notes.length === 0 ? `<p class="subject-note" style="font-size:13px">${t("journalEmpty")}</p>` : notes.slice(0, 6).map((n) => `
        <div data-edit-note="${n.id}" style="padding:10px 0;border-bottom:1px solid var(--color-surface-2);cursor:pointer">
          <div style="font-size:12px;color:var(--color-ink-soft);font-weight:600;margin-bottom:4px">${new Date(n.date).toLocaleDateString()}</div>
          ${n.pointsForts ? `<div style="font-size:13px;margin-bottom:2px"><b>${t("journalStrengths")} :</b> ${n.pointsForts}</div>` : ""}
          ${n.difficultes ? `<div style="font-size:13px;margin-bottom:2px"><b>${t("journalDifficulties")} :</b> ${n.difficultes}</div>` : ""}
          ${n.remarques ? `<div style="font-size:13px;margin-bottom:2px"><b>${t("journalRemarks")} :</b> ${n.remarques}</div>` : ""}
          ${n.objectifsProchain ? `<div style="font-size:13px;margin-bottom:2px"><b>${t("journalNextGoals")} :</b> ${n.objectifsProchain}</div>` : ""}
          ${n.devoirs ? `<div style="font-size:13px"><b>${t("journalHomework")} :</b> ${n.devoirs}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function openStudentNoteModal(studentId, note) {
  const n = note || { date: todayISO(), pointsForts: "", difficultes: "", remarques: "", objectifsProchain: "", devoirs: "" };
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("addNoteBtn")}</h3>
    <div class="field" style="margin-bottom:12px"><label>${t("scheduleDayLabel")}</label><input id="jnDate" type="date" value="${n.date}" /></div>
    <div class="field" style="margin-bottom:12px"><label>${t("journalStrengths")}</label><textarea id="jnStrengths" rows="2" style="padding:10px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-family:inherit">${n.pointsForts}</textarea></div>
    <div class="field" style="margin-bottom:12px"><label>${t("journalDifficulties")}</label><textarea id="jnDifficulties" rows="2" style="padding:10px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-family:inherit">${n.difficultes}</textarea></div>
    <div class="field" style="margin-bottom:12px"><label>${t("journalRemarks")}</label><textarea id="jnRemarks" rows="2" style="padding:10px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-family:inherit">${n.remarques}</textarea></div>
    <div class="field" style="margin-bottom:12px"><label>${t("journalNextGoals")}</label><textarea id="jnGoals" rows="2" style="padding:10px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-family:inherit">${n.objectifsProchain}</textarea></div>
    <div class="field" style="margin-bottom:18px"><label>${t("journalHomework")}</label><textarea id="jnHomework" rows="2" style="padding:10px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-family:inherit">${n.devoirs}</textarea></div>
    <div style="display:flex;gap:10px">
      ${note ? `<button class="btn secondary" id="jnDeleteBtn" style="flex:1;color:var(--color-danger)">🗑 ${t("deleted")}</button>` : ""}
      <button class="btn gold" id="jnSaveBtn" style="flex:2">${t("savePaymentSettingsBtn")}</button>
    </div>
  `);
  document.getElementById("jnSaveBtn").addEventListener("click", async () => {
    const entry = {
      id: note ? note.id : newId("note"), studentId,
      date: document.getElementById("jnDate").value || todayISO(),
      pointsForts: document.getElementById("jnStrengths").value.trim(),
      difficultes: document.getElementById("jnDifficulties").value.trim(),
      remarques: document.getElementById("jnRemarks").value.trim(),
      objectifsProchain: document.getElementById("jnGoals").value.trim(),
      devoirs: document.getElementById("jnHomework").value.trim(),
      createdAt: note ? note.createdAt : Date.now(),
    };
    await DB.saveStudentNote(entry);
    STATE.studentProfileLoaded = false;
    closeModal();
    go(`#/student/${studentId}`);
    toast("OK");
  });
  document.getElementById("jnDeleteBtn")?.addEventListener("click", () => {
    openConfirmModal(t("calendarCancelTitle"), t("deleted"), async () => {
      await DB.deleteStudentNote(note.id);
      STATE.studentProfileLoaded = false;
      closeModal();
      go(`#/student/${studentId}`);
      toast(t("deleted"));
    });
  });
}

// -----------------------------------------------------------------------
// 4. Suivi détaillé du Coran (sourate / versets)
// -----------------------------------------------------------------------
function renderProfileQuranTracking(student, data) {
  const entries = (data.quranEntries || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const last = entries[0];
  const lastNote = (data.notes || []).slice().sort((a, b) => b.date.localeCompare(a.date))[0];

  const resumeBanner = last ? `
    <div class="card" style="margin-bottom:12px;border:1px solid var(--color-primary);background:rgba(14,99,85,0.08)">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px">▶ ${t("resumeLastLessonBtn")}</div>
      <div style="font-size:13.5px;margin-bottom:2px"><b>${t("quranSourate")} :</b> ${last.sourate}</div>
      ${last.verseStart ? `<div style="font-size:13.5px;margin-bottom:2px"><b>${t("quranVerses")} :</b> ${last.verseStart} ${t("quranTo")} ${last.verseEnd || last.verseStart}</div>` : ""}
      ${last.lastVerseReached ? `<div style="font-size:13.5px;margin-bottom:2px"><b>${t("quranLastVerse")} :</b> ${last.lastVerseReached}</div>` : ""}
      <div style="font-size:12.5px;color:${last.status === "termine" ? "var(--color-success)" : "var(--color-accent)"};margin-bottom:6px">${last.status === "termine" ? "✅ " + t("quranStatusDone") : "🔄 " + t("quranStatusOngoing")}</div>
      ${lastNote?.remarques ? `<div style="font-size:12.5px;margin-top:4px"><b>${t("journalRemarks")} :</b> ${lastNote.remarques}</div>` : ""}
      ${lastNote?.devoirs ? `<div style="font-size:12.5px"><b>${t("journalHomework")} :</b> ${lastNote.devoirs}</div>` : ""}
    </div>
  ` : "";

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="display" style="font-size:16px">📖 ${t("sectionQuranTracking")}</h3>
        <button class="btn gold" id="spAddQuranBtn" style="padding:6px 14px;font-size:12px">➕ ${t("addEntryBtn")}</button>
      </div>
      ${resumeBanner}
      ${entries.length === 0 ? `<p class="subject-note" style="font-size:13px">${t("journalEmpty")}</p>` : entries.slice(0, 8).map((e) => `
        <div data-edit-quran="${e.id}" style="padding:8px 0;border-bottom:1px solid var(--color-surface-2);cursor:pointer;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:600">${e.sourate}${e.verseStart ? ` (${e.verseStart}-${e.verseEnd || e.verseStart})` : ""}</div>
            <div style="font-size:11.5px;color:var(--color-ink-soft)">${new Date(e.date).toLocaleDateString()}</div>
          </div>
          <span style="font-size:11px;color:${e.status === "termine" ? "var(--color-success)" : "var(--color-accent)"}">${e.status === "termine" ? t("quranStatusDone") : t("quranStatusOngoing")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function openQuranTrackingModal(studentId, entry) {
  const e = entry || { date: todayISO(), sourate: "", verseStart: "", verseEnd: "", lastVerseReached: "", status: "a_poursuivre" };
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("sectionQuranTracking")}</h3>
    <div class="field" style="margin-bottom:12px"><label>${t("scheduleDayLabel")}</label><input id="qtDate" type="date" value="${e.date}" /></div>
    <div class="field" style="margin-bottom:12px"><label>${t("quranSourate")}</label><input id="qtSourate" value="${e.sourate}" placeholder="ex. الماعون" /></div>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="field" style="flex:1"><label>${t("quranVerseStart")}</label><input id="qtVerseStart" type="number" min="1" value="${e.verseStart}" /></div>
      <div class="field" style="flex:1"><label>${t("quranVerseEnd")}</label><input id="qtVerseEnd" type="number" min="1" value="${e.verseEnd}" /></div>
    </div>
    <div class="field" style="margin-bottom:12px"><label>${t("quranLastVerse")}</label><input id="qtLastVerse" type="number" min="1" value="${e.lastVerseReached}" /></div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("quranStatusLabel")}</label>
      <select id="qtStatus">
        <option value="a_poursuivre" ${e.status === "a_poursuivre" ? "selected" : ""}>${t("quranStatusOngoing")}</option>
        <option value="termine" ${e.status === "termine" ? "selected" : ""}>${t("quranStatusDone")}</option>
      </select>
    </div>
    <div style="display:flex;gap:10px">
      ${entry ? `<button class="btn secondary" id="qtDeleteBtn" style="flex:1;color:var(--color-danger)">🗑</button>` : ""}
      <button class="btn gold" id="qtSaveBtn" style="flex:2">${t("savePaymentSettingsBtn")}</button>
    </div>
  `);
  document.getElementById("qtSaveBtn").addEventListener("click", async () => {
    const sourate = document.getElementById("qtSourate").value.trim();
    if (!sourate) { toast(t("scheduleMissingFields")); return; }
    const record = {
      id: entry ? entry.id : newId("qtrack"), studentId,
      date: document.getElementById("qtDate").value || todayISO(),
      sourate,
      verseStart: document.getElementById("qtVerseStart").value,
      verseEnd: document.getElementById("qtVerseEnd").value,
      lastVerseReached: document.getElementById("qtLastVerse").value,
      status: document.getElementById("qtStatus").value,
      createdAt: entry ? entry.createdAt : Date.now(),
    };
    await DB.saveQuranTracking(record);
    STATE.studentProfileLoaded = false;
    closeModal();
    go(`#/student/${studentId}`);
    toast("OK");
  });
  document.getElementById("qtDeleteBtn")?.addEventListener("click", () => {
    openConfirmModal(t("calendarCancelTitle"), t("deleted"), async () => {
      await DB.deleteQuranTracking(entry.id);
      STATE.studentProfileLoaded = false;
      closeModal();
      go(`#/student/${studentId}`);
      toast(t("deleted"));
    });
  });
}

// -----------------------------------------------------------------------
// 4bis. Suivi de l'alphabet arabe — pour les élèves niveau 1 qui n'ont pas
// encore commencé le suivi sourate/verset (ex. élève qui s'arrête aux
// lettres ا ب ت ث ج ح خ). Fiche séparée du suivi du Coran, même principe
// de fonctionnement (liste d'entrées datées + modale d'ajout/édition).
// -----------------------------------------------------------------------
const ARABIC_ALPHABET_LETTERS = [
  { ar: "ا", name: "Alif" }, { ar: "ب", name: "Ba" }, { ar: "ت", name: "Ta" }, { ar: "ث", name: "Tha" },
  { ar: "ج", name: "Jim" }, { ar: "ح", name: "Ha" }, { ar: "خ", name: "Kha" }, { ar: "د", name: "Dal" },
  { ar: "ذ", name: "Dhal" }, { ar: "ر", name: "Ra" }, { ar: "ز", name: "Zay" }, { ar: "س", name: "Sin" },
  { ar: "ش", name: "Shin" }, { ar: "ص", name: "Sad" }, { ar: "ض", name: "Dad" }, { ar: "ط", name: "Ta'" },
  { ar: "ظ", name: "Dha" }, { ar: "ع", name: "Ayn" }, { ar: "غ", name: "Ghayn" }, { ar: "ف", name: "Fa" },
  { ar: "ق", name: "Qaf" }, { ar: "ك", name: "Kaf" }, { ar: "ل", name: "Lam" }, { ar: "م", name: "Mim" },
  { ar: "ن", name: "Nun" }, { ar: "ه", name: "Ha" }, { ar: "و", name: "Waw" }, { ar: "ي", name: "Ya" },
];
const ALPHABET_STATUS_KEYS = { acquis: "alphabetStatusAcquired", a_poursuivre: "alphabetStatusOngoing", a_revoir: "alphabetStatusReview" };
const ALPHABET_STATUS_COLORS = { acquis: "var(--color-success)", a_poursuivre: "var(--color-accent)", a_revoir: "var(--color-danger)" };

function renderProfileAlphabetTracking(student, data) {
  const entries = (data.alphabetEntries || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const last = entries[0];

  const resumeBanner = last ? `
    <div class="card" style="margin-bottom:12px;border:1px solid var(--color-primary);background:rgba(14,99,85,0.08)">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px">▶ ${t("resumeLastLessonBtn")}</div>
      <div style="font-size:13.5px;margin-bottom:2px;direction:rtl;font-family:'Amiri',serif"><b style="direction:ltr;display:inline-block">${t("alphabetLettersLabel")} :</b> ${(last.letters || []).join(" ")}</div>
      ${last.lastLetter ? `<div style="font-size:13.5px;margin-bottom:2px"><b>${t("alphabetLastLetterLabel")} :</b> <span style="font-family:'Amiri',serif">${last.lastLetter}</span></div>` : ""}
      <div style="font-size:12.5px;color:${ALPHABET_STATUS_COLORS[last.status] || "var(--color-accent)"}">${last.status === "acquis" ? "✅ " : last.status === "a_revoir" ? "↺ " : "🔄 "}${t(ALPHABET_STATUS_KEYS[last.status] || "alphabetStatusOngoing")}</div>
    </div>
  ` : "";

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="display" style="font-size:16px">🔤 ${t("sectionAlphabetTracking")}</h3>
        <button class="btn gold" id="spAddAlphabetBtn" style="padding:6px 14px;font-size:12px">➕ ${t("addEntryBtn")}</button>
      </div>
      ${resumeBanner}
      ${entries.length === 0 ? `<p class="subject-note" style="font-size:13px">${t("journalEmpty")}</p>` : entries.slice(0, 8).map((e) => `
        <div data-edit-alphabet="${e.id}" style="padding:8px 0;border-bottom:1px solid var(--color-surface-2);cursor:pointer;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:600;direction:rtl;font-family:'Amiri',serif">${(e.letters || []).join(" ")}</div>
            <div style="font-size:11.5px;color:var(--color-ink-soft)">${new Date(e.date).toLocaleDateString()}</div>
          </div>
          <span style="font-size:11px;color:${ALPHABET_STATUS_COLORS[e.status] || "var(--color-accent)"}">${t(ALPHABET_STATUS_KEYS[e.status] || "alphabetStatusOngoing")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function openAlphabetTrackingModal(studentId, entry) {
  const e = entry || { date: todayISO(), letters: [], lastLetter: "", status: "a_poursuivre" };
  const selected = new Set(e.letters || []);
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("sectionAlphabetTracking")}</h3>
    <div class="field" style="margin-bottom:12px"><label>${t("scheduleDayLabel")}</label><input id="atDate" type="date" value="${e.date}" /></div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("alphabetLettersLabel")}</label>
      <div id="atLettersGrid" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
        ${ARABIC_ALPHABET_LETTERS.map((l) => `
          <button type="button" class="letter-chip" data-letter="${l.ar}" style="font-family:'Amiri',serif;font-size:17px;padding:6px 10px;border-radius:8px;border:1.5px solid ${selected.has(l.ar) ? "var(--color-primary)" : "var(--color-surface-2)"};background:${selected.has(l.ar) ? "var(--color-primary)" : "var(--color-surface)"};color:${selected.has(l.ar) ? "#fff" : "var(--color-ink)"}">${l.ar}</button>
        `).join("")}
      </div>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>${t("alphabetLastLetterLabel")}</label>
      <select id="atLastLetter">
        <option value="">—</option>
        ${ARABIC_ALPHABET_LETTERS.map((l) => `<option value="${l.ar}" ${e.lastLetter === l.ar ? "selected" : ""} style="font-family:'Amiri',serif">${l.ar} — ${l.name}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("alphabetStatusLabel")}</label>
      <select id="atStatus">
        <option value="a_poursuivre" ${e.status === "a_poursuivre" ? "selected" : ""}>${t("alphabetStatusOngoing")}</option>
        <option value="acquis" ${e.status === "acquis" ? "selected" : ""}>${t("alphabetStatusAcquired")}</option>
        <option value="a_revoir" ${e.status === "a_revoir" ? "selected" : ""}>${t("alphabetStatusReview")}</option>
      </select>
    </div>
    <div style="display:flex;gap:10px">
      ${entry ? `<button class="btn secondary" id="atDeleteBtn" style="flex:1;color:var(--color-danger)">🗑</button>` : ""}
      <button class="btn gold" id="atSaveBtn" style="flex:2">${t("savePaymentSettingsBtn")}</button>
    </div>
  `);
  document.querySelectorAll("#atLettersGrid .letter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const letter = chip.dataset.letter;
      if (selected.has(letter)) {
        selected.delete(letter);
        chip.style.background = "var(--color-surface)";
        chip.style.color = "var(--color-ink)";
        chip.style.borderColor = "var(--color-surface-2)";
      } else {
        selected.add(letter);
        chip.style.background = "var(--color-primary)";
        chip.style.color = "#fff";
        chip.style.borderColor = "var(--color-primary)";
      }
    });
  });
  document.getElementById("atSaveBtn").addEventListener("click", async () => {
    if (selected.size === 0) { toast(t("scheduleMissingFields")); return; }
    const record = {
      id: entry ? entry.id : newId("atrack"), studentId,
      date: document.getElementById("atDate").value || todayISO(),
      letters: ARABIC_ALPHABET_LETTERS.map((l) => l.ar).filter((ar) => selected.has(ar)),
      lastLetter: document.getElementById("atLastLetter").value,
      status: document.getElementById("atStatus").value,
      createdAt: entry ? entry.createdAt : Date.now(),
    };
    await DB.saveAlphabetTracking(record);
    STATE.studentProfileLoaded = false;
    closeModal();
    go(`#/student/${studentId}`);
    toast("OK");
  });
  document.getElementById("atDeleteBtn")?.addEventListener("click", () => {
    openConfirmModal(t("calendarCancelTitle"), t("deleted"), async () => {
      await DB.deleteAlphabetTracking(entry.id);
      STATE.studentProfileLoaded = false;
      closeModal();
      go(`#/student/${studentId}`);
      toast(t("deleted"));
    });
  });
}

// -----------------------------------------------------------------------
// 4ter. Checklist "Sourates déjà acquises" (Juz Amma) — permet de cocher
// en une seule fois, sans modale ni date, tout ce qu'un élève maîtrise
// déjà en arrivant à l'académie (ex. un élève avancé qui rejoint après
// avoir déjà appris plusieurs sourates ailleurs). Se sauvegarde
// instantanément à chaque tapotement, contrairement au suivi détaillé du
// Coran qui garde un historique daté entrée par entrée.
// -----------------------------------------------------------------------
function renderProfileSurahChecklist(student, data) {
  const acquired = new Set(((data.surahChecklist && data.surahChecklist.surahIds) || []));
  return `
    <div class="card">
      <h3 class="display" style="font-size:16px;margin-bottom:6px">📗 Sourates déjà acquises</h3>
      <p class="subject-note" style="font-size:12.5px;margin-bottom:12px">Cochez les sourates que l'élève maîtrise déjà (utile pour démarrer un élève avancé au bon endroit).</p>
      <div id="spSurahGrid" style="display:flex;flex-wrap:wrap;gap:6px">
        ${SHORT_SURAHS.map((s) => `
          <button type="button" class="surah-chip" data-surah-id="${s.id}" style="display:flex;align-items:center;gap:5px;font-size:12.5px;padding:6px 10px;border-radius:8px;border:1.5px solid ${acquired.has(s.id) ? "var(--color-primary)" : "var(--color-surface-2)"};background:${acquired.has(s.id) ? "var(--color-primary)" : "var(--color-surface)"};color:${acquired.has(s.id) ? "#fff" : "var(--color-ink)"}">
            <span style="font-family:'Amiri',serif;font-size:14px">${s.name_ar}</span><span>${s.name_fr}</span>
          </button>
        `).join("")}
      </div>
      <div id="spSurahCount" style="margin-top:10px;font-size:12px;color:var(--color-ink-soft)">${acquired.size}/${SHORT_SURAHS.length} sourates acquises</div>
    </div>
  `;
}

function attachSurahChecklistHandlers(studentId) {
  document.querySelectorAll("#spSurahGrid .surah-chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      const surahId = Number(chip.dataset.surahId);
      const existing = STATE.studentProfileData.surahChecklist;
      const current = new Set((existing && existing.surahIds) || []);
      const nowAcquired = !current.has(surahId);
      if (nowAcquired) current.add(surahId); else current.delete(surahId);
      const record = { studentId, surahIds: Array.from(current), updatedAt: Date.now() };
      await DB.saveSurahChecklist(record);
      STATE.studentProfileData.surahChecklist = record;
      chip.style.background = nowAcquired ? "var(--color-primary)" : "var(--color-surface)";
      chip.style.color = nowAcquired ? "#fff" : "var(--color-ink)";
      chip.style.borderColor = nowAcquired ? "var(--color-primary)" : "var(--color-surface-2)";
      const counter = document.getElementById("spSurahCount");
      if (counter) counter.textContent = `${current.size}/${SHORT_SURAHS.length} sourates acquises`;
    });
  });
}

// -----------------------------------------------------------------------
// Suivi détaillé Athkar / Fiqh / Tafsir / Sira — même principe que le
// Coran : thème/dhikr étudié, daté, librement saisi par l'enseignante.
// Le module Sira a été ajouté ici (les clés de traduction topicSira /
// topicSiraPlaceholder existaient déjà dans i18n.js mais n'étaient
// utilisées nulle part) : il suffisait de l'ajouter à cette liste pour que
// la section apparaisse automatiquement dans la fiche élève, avec le même
// comportement (ajout, édition, suppression) que Athkar/Fiqh/Tafsir.
// -----------------------------------------------------------------------
const TOPIC_SUBJECTS = [
  { key: "athkar", icon: "🌿", labelKey: "topicAthkar" },
  { key: "fiqh", icon: "📚", labelKey: "topicFiqh" },
  { key: "tafsir", icon: "📖", labelKey: "topicTafsir" },
  { key: "sira", icon: "🌙", labelKey: "topicSira" },
];

function renderProfileTopicTracking(student, data) {
  const entries = data.topicEntries || [];
  return TOPIC_SUBJECTS.map((sub) => {
    const subEntries = entries.filter((e) => e.subject === sub.key).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="display" style="font-size:16px">${sub.icon} ${t(sub.labelKey)}</h3>
          <button class="btn gold" data-add-topic="${sub.key}" style="padding:6px 14px;font-size:12px">➕ ${t("addEntryBtn")}</button>
        </div>
        ${subEntries.length === 0 ? `<p class="subject-note" style="font-size:13px">${t("journalEmpty")}</p>` : subEntries.slice(0, 6).map((e) => `
          <div data-edit-topic="${e.id}" style="padding:8px 0;border-bottom:1px solid var(--color-surface-2);cursor:pointer">
            <div style="font-size:13px;font-weight:600">${e.theme}</div>
            <div style="font-size:11.5px;color:var(--color-ink-soft)">${new Date(e.date).toLocaleDateString()}${e.notes ? ` · ${e.notes}` : ""}</div>
          </div>
        `).join("")}
      </div>
    `;
  }).join("");
}

function openTopicTrackingModal(studentId, subjectKey, entry) {
  const sub = TOPIC_SUBJECTS.find((s) => s.key === subjectKey);
  const e = entry || { date: todayISO(), theme: "", notes: "" };
  const placeholder = subjectKey === "athkar" ? t("topicAthkarPlaceholder")
    : subjectKey === "fiqh" ? t("topicFiqhPlaceholder")
    : subjectKey === "sira" ? t("topicSiraPlaceholder")
    : t("topicTafsirPlaceholder");
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${sub.icon} ${t(sub.labelKey)}</h3>
    <div class="field" style="margin-bottom:12px"><label>${t("scheduleDayLabel")}</label><input id="tpDate" type="date" value="${e.date}" /></div>
    <div class="field" style="margin-bottom:12px"><label>${t("topicThemeLabel")}</label><input id="tpTheme" value="${e.theme}" placeholder="${placeholder}" /></div>
    <div class="field" style="margin-bottom:18px"><label>${t("journalRemarks")}</label><textarea id="tpNotes" rows="2" style="padding:10px;border-radius:10px;border:1px solid var(--color-surface-2);background:var(--color-surface);color:var(--color-ink);font-family:inherit">${e.notes}</textarea></div>
    <div style="display:flex;gap:10px">
      ${entry ? `<button class="btn secondary" id="tpDeleteBtn" style="flex:1;color:var(--color-danger)">🗑</button>` : ""}
      <button class="btn gold" id="tpSaveBtn" style="flex:2">${t("savePaymentSettingsBtn")}</button>
    </div>
  `);
  document.getElementById("tpSaveBtn").addEventListener("click", async () => {
    const theme = document.getElementById("tpTheme").value.trim();
    if (!theme) { toast(t("scheduleMissingFields")); return; }
    const record = {
      id: entry ? entry.id : newId("topic"), studentId, subject: subjectKey,
      date: document.getElementById("tpDate").value || todayISO(),
      theme,
      notes: document.getElementById("tpNotes").value.trim(),
      createdAt: entry ? entry.createdAt : Date.now(),
    };
    await DB.saveTopicTracking(record);
    STATE.studentProfileLoaded = false;
    closeModal();
    go(`#/student/${studentId}`);
    toast("OK");
  });
  document.getElementById("tpDeleteBtn")?.addEventListener("click", () => {
    openConfirmModal(t("calendarCancelTitle"), t("deleted"), async () => {
      await DB.deleteTopicTracking(entry.id);
      STATE.studentProfileLoaded = false;
      closeModal();
      go(`#/student/${studentId}`);
      toast(t("deleted"));
    });
  });
}

// -----------------------------------------------------------------------
// Relevé détaillé bimestriel — compile le contenu réellement étudié
// (sourates, Athkar, Fiqh, Tafsir) sur une période choisie, pour l'envoyer
// aux parents. Document distinct du bulletin d'évaluation existant.
// -----------------------------------------------------------------------
function renderProfileReportGenerator(student) {
  return `
    <div class="card">
      <h3 class="display" style="font-size:16px;margin-bottom:10px">📄 ${t("detailedReportTitle")}</h3>
      <p class="subject-note" style="font-size:12.5px;margin-bottom:12px">${t("detailedReportIntro")}</p>
      <button class="btn gold block" id="spGenerateReportBtn">📄 ${t("generateReportBtn")}</button>
    </div>
  `;
}

function openDetailedReportModal(studentId) {
  const today = new Date();
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate());
  openModal(`
    <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <h3 class="display" style="text-align:center;margin-bottom:14px">${t("detailedReportTitle")}</h3>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="field" style="flex:1"><label>${t("periodFrom")}</label><input id="drFrom" type="date" value="${twoMonthsAgo.toISOString().slice(0, 10)}" /></div>
      <div class="field" style="flex:1"><label>${t("periodTo")}</label><input id="drTo" type="date" value="${todayISO()}" /></div>
    </div>
    <div class="field" style="margin-bottom:18px">
      <label>${t("chooseLanguage")}</label>
      <select id="drLang">
        <option value="fr">🇫🇷 FR</option><option value="en">🇬🇧 EN</option><option value="it">🇮🇹 IT</option>
      </select>
    </div>
    <button class="btn gold block" id="drGenerateBtn">${t("generateReportBtn")}</button>
  `);
  document.getElementById("drGenerateBtn").addEventListener("click", async () => {
    const from = document.getElementById("drFrom").value;
    const to = document.getElementById("drTo").value;
    const lang = document.getElementById("drLang").value;
    document.getElementById("drGenerateBtn").textContent = "…";
    const { dataUrl, pngDataUrl, filename, studentName } = await generateDetailedReport(studentId, from, to, lang);
    closeModal();
    openModal(`
      <div class="close-row"><button class="icon-btn" onclick="closeModal()">✕</button></div>
      <h3 class="display" style="text-align:center;margin-bottom:14px">${studentName}</h3>
      <button class="btn secondary block" id="drDownloadPdfBtn" style="margin-bottom:10px">⬇ ${t("downloadPDF")}</button>
      <button class="btn gold block" id="drDownloadPngBtn" style="margin-bottom:10px">⬇ ${t("downloadPNG")}</button>
      <button class="btn secondary block" id="drShareBtn">📤 ${t("shareReceipt")}</button>
    `);
    document.getElementById("drDownloadPdfBtn").addEventListener("click", () => { downloadFile(dataUrl, `${filename}.pdf`); closeModal(); });
    document.getElementById("drDownloadPngBtn").addEventListener("click", () => { downloadFile(pngDataUrl, `${filename}.png`); closeModal(); });
    document.getElementById("drShareBtn").addEventListener("click", async () => { await shareFile(pngDataUrl, `${filename}.png`, `${t("detailedReportTitle")} — ${studentName}`); closeModal(); });
  });
}

function renderProfileSchedule(student, data, lang) {
  const slots = studentWeeklySlots(data.scheduleSlots, student.id);
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="display" style="font-size:16px">📅 ${t("scheduleTitle")}</h3>
        <button class="btn secondary" id="spEditScheduleBtn" style="padding:6px 14px;font-size:12px">✏️ ${t("scheduleManageBtn")}</button>
      </div>
      ${slots.length === 0 ? `<p class="subject-note" style="font-size:13px">${t("scheduleNoSlotsForStudent")}</p>` : slots.map((s) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--color-surface-2);font-size:13.5px">
          <b>${scheduleDayName(s.day, lang)}</b> · ${s.startTime}-${s.endTime}
          <div style="font-size:12px;color:var(--color-ink-soft)">${(s.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ") || "—"}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// -----------------------------------------------------------------------
// 6. Paiements
// -----------------------------------------------------------------------
function renderProfilePayments(student) {
  const entity = (STATE.billingEntities || []).find((e) => e.refId === student.id || (e.members || []).some((m) => m.id === student.id));
  if (!entity) {
    return `
      <div class="card">
        <h3 class="display" style="font-size:16px;margin-bottom:10px">💳 ${t("paymentsTitle")}</h3>
        <p class="subject-note" style="font-size:13px;margin-bottom:10px">${t("noBillingEntities")}</p>
        <button class="btn secondary block" id="spPaymentsBtn">${t("saveBilling")}</button>
      </div>
    `;
  }
  const st = computeBillingStatus(entity);
  const recentPayments = (entity.payments || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 class="display" style="font-size:16px">💳 ${t("paymentsTitle")}</h3>
        <span class="pay-status pay-status-${st.status}">${billingStatusLabel(st.status)}</span>
      </div>
      <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:12px">
        <div><div style="font-weight:700">${entity.amount} ${entity.currency}</div><div style="font-size:11px;color:var(--color-ink-soft)">/ mois</div></div>
        <div><div style="font-weight:700">${st.monthsPaid}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("monthsPaid")}</div></div>
        <div><div style="font-weight:700">${st.totalPaid}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("totalPaid")}</div></div>
      </div>
      ${recentPayments.map((p) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-surface-2);font-size:12.5px">
          <span>${new Date(p.date).toLocaleDateString()} · ${p.method || "—"}</span><span style="font-weight:600">${p.amount} ${p.currency}</span>
        </div>
      `).join("")}
      <button class="btn secondary block" id="spPaymentsBtn" style="margin-top:12px">${t("paymentsTitle")} →</button>
    </div>
  `;
}

// -----------------------------------------------------------------------
// 7. Diplômes et bulletins
// -----------------------------------------------------------------------
function renderProfileDiplomas(student, data) {
  const diplomas = data.diplomas || [];
  return `
    <div class="card">
      <h3 class="display" style="font-size:16px;margin-bottom:10px">🎓 ${t("sectionDiplomas")}</h3>
      ${diplomas.length === 0 ? `<p class="subject-note" style="font-size:13px">${t("diplomas_empty")}</p>` : diplomas.sort((a, b) => b.issuedAt - a.issuedAt).map((d) => `
        <div class="diploma-item" data-sp-dl-diploma="${d.id}">
          <div class="icon">${d.category === "khatm" ? "🏆" : d.category === "juz" ? "📖" : "🏅"}</div>
          <div class="meta">
            <div class="title">${d.levelTitle}</div>
            <div class="sub">${new Date(d.issuedAt).toLocaleDateString()}</div>
          </div>
          <div class="chev">⬇</div>
        </div>
      `).join("")}
    </div>
  `;
}

// -----------------------------------------------------------------------
// 8. Statistiques
// -----------------------------------------------------------------------
function renderProfileStats(student, data) {
  const completed = SESSIONS.filter((s) => SUBJECT_TABS.every((tab) => data.progressMap[s.id]?.[tab.key]?.completed)).length;
  const pct = Math.round((completed / SESSIONS.length) * 100);
  const juzDone = JUZ_LIST.filter((j) => (data.memorization || []).find((m) => m.juzId === j.id)?.completed).length;
  const attended = (data.courseLogs || []).filter((l) => (l.studentId === student.id || (l.studentIds || []).includes(student.id)) && l.attendance === "present").length;
  const absences = (data.courseLogs || []).filter((l) => (l.studentId === student.id || (l.studentIds || []).includes(student.id)) && l.attendance === "absent").length;

  return `
    <div class="card">
      <h3 class="display" style="font-size:16px;margin-bottom:12px">📊 ${t("sectionStats")}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="text-align:center"><div style="font-size:20px;font-weight:700">${attended}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statsAttended")}</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--color-danger)">${absences}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statsAbsences")}</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:700">${pct}%</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statsProgressPct")}</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:700">${juzDone}/${JUZ_LIST.length}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statsJuzMemorized")}</div></div>
        <div style="text-align:center;grid-column:1 / -1"><div style="font-size:20px;font-weight:700">${(data.diplomas || []).length}</div><div style="font-size:11px;color:var(--color-ink-soft)">${t("statsDiplomas")}</div></div>
      </div>
    </div>
  `;
}
