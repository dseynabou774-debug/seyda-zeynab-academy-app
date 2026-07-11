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
  const [allProgress, memorization, notes, quranEntries, scheduleSlots, courseLogs, diplomas] = await Promise.all([
    DB.getAllProgressEveryone().then((rows) => rows.filter((r) => r.studentId === studentId)),
    DB.getAllMemorization(studentId),
    DB.getAllStudentNotes(studentId),
    DB.getAllQuranTracking(studentId),
    DB.getAllScheduleSlots(),
    DB.getAllCourseLogs(),
    DB.getAllDiplomas(studentId),
  ]);
  const progressMap = {};
  allProgress.forEach((r) => {
    progressMap[r.sessionId] = progressMap[r.sessionId] || {};
    progressMap[r.sessionId][r.subjectKey] = r;
  });
  return { progressMap, memorization, notes, quranEntries, scheduleSlots, courseLogs, diplomas };
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
// 5. Emploi du temps
// -----------------------------------------------------------------------
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
