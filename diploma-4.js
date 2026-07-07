// =============================================================================
// diploma.js — Génération automatique des diplômes en PDF (FR / EN / IT)
// Utilise jsPDF (chargé depuis un CDN dans index.html, mis en cache par le
// service worker pour un fonctionnement hors ligne après le premier chargement).
// =============================================================================

function generateCertNumber() {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SZA-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`;
}

const DIPLOMA_LABELS = {
  fr: { title: "DIPLÔME", of: "décerné à", forLevel: "pour la validation du niveau" },
  en: { title: "DIPLOMA", of: "awarded to", forLevel: "for successfully completing the level" },
  it: { title: "DIPLOMA", of: "rilasciato a", forLevel: "per il completamento del livello" },
};

let _logoDataUrlCache = null;
async function getLogoDataUrl() {
  if (_logoDataUrlCache) return _logoDataUrlCache;
  try {
    const res = await fetch("icon-512.png");
    const blob = await res.blob();
    _logoDataUrlCache = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    _logoDataUrlCache = null;
  }
  return _logoDataUrlCache;
}

/**
 * Construit le PDF du diplôme et retourne { blob, dataUrl }.
 * @param {object} opts { studentName, levelTitle, lang, certNumber, issuedAt }
 */
async function buildDiplomaPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const labels = DIPLOMA_LABELS[opts.lang] || DIPLOMA_LABELS.fr;

  const emerald = [14, 99, 85];
  const gold = [200, 155, 60];
  const ink = [27, 43, 41];

  // Fond
  doc.setFillColor(250, 246, 238);
  doc.rect(0, 0, W, H, "F");

  // Cadre double
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.rect(6, 6, W - 12, H - 12);
  doc.setLineWidth(0.4);
  doc.rect(9, 9, W - 18, H - 18);

  // Logo
  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) {
    const logoSize = 15;
    doc.addImage(logoDataUrl, "PNG", W / 2 - logoSize / 2, 8, logoSize, logoSize);
  }

  // En-tête
  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 26, { align: "center" });

  doc.setTextColor(...gold);
  doc.setFontSize(22);
  doc.text(labels.title, W / 2, 38, { align: "center" });

  doc.setTextColor(...ink);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(labels.of, W / 2, 48, { align: "center" });

  doc.setFont("times", "bolditalic");
  doc.setFontSize(19);
  doc.setTextColor(...emerald);
  doc.text(opts.studentName, W / 2, 58, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text(`${labels.forLevel} :`, W / 2, 67, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text(opts.levelTitle, W / 2, 74, { align: "center" });

  // Message d'encouragement
  doc.setFont("times", "italic");
  doc.setFontSize(9.5);
  const msg = t("encourage", opts.studentName.split(" ")[0] || opts.studentName);
  const msgLines = doc.splitTextToSize(msg, W - 40);
  doc.text(msgLines, W / 2, 84, { align: "center" });

  // Pied de page : date, signature, numéro
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.text(`${t("deliveredOn")} : ${opts.issuedAtLabel}`, 20, H - 16);
  doc.text(t("signature"), W - 20, H - 16, { align: "right" });

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 110);
  doc.text(`${t("certNumber")} : ${opts.certNumber}`, W / 2, H - 9, { align: "center" });

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

/**
 * Crée (ou régénère) un diplôme pour un niveau validé, l'enregistre en base
 * et retourne l'enregistrement complet.
 */
async function createDiplomaForSession(session, lang) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );
  const sessionTitleStr = sessionTitle(session);

  const { dataUrl } = await buildDiplomaPdf({
    studentName, levelTitle: sessionTitleStr, lang, certNumber, issuedAtLabel,
  });

  const diploma = {
    id: certNumber,
    studentId: STATE.activeStudentId,
    levelId: session.id,
    levelTitle: sessionTitleStr,
    category: "session",
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

// ---- Diplôme de Juz' mémorisé et validé ----
async function createDiplomaForJuz(juz, lang) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );
  const titleStr = juzLabel(juz);

  const { dataUrl } = await buildDiplomaPdf({
    studentName, levelTitle: titleStr, lang, certNumber, issuedAtLabel,
  });

  const diploma = {
    id: certNumber,
    studentId: STATE.activeStudentId,
    levelId: juz.id,
    levelTitle: titleStr,
    category: "juz",
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

// ---- Diplôme Khatm Al-Qur'an — le plus prestigieux, design premium ----
const KHATM_LABELS = {
  fr: { title: "DIPLÔME DE KHATM AL-QUR'AN", subtitle: "Mémorisation complète du Noble Coran", of: "décerné à", body: (name) => `Il est certifié que ${name} a achevé, avec la grâce d'Allah, la mémorisation complète des 30 Ajza' du Noble Coran.`, signature: "Seyda Zeynab Academy — Direction pédagogique" },
  en: { title: "KHATM AL-QUR'AN DIPLOMA", subtitle: "Complete memorization of the Noble Qur'an", of: "awarded to", body: (name) => `This certifies that ${name} has completed, by the grace of Allah, the full memorization of the 30 Ajza' of the Noble Qur'an.`, signature: "Seyda Zeynab Academy — Academic Direction" },
  it: { title: "DIPLOMA DI KHATM AL-QUR'AN", subtitle: "Memorizzazione completa del Nobile Corano", of: "rilasciato a", body: (name) => `Si certifica che ${name} ha completato, per grazia di Allah, la memorizzazione completa dei 30 Ajza' del Nobile Corano.`, signature: "Seyda Zeynab Academy — Direzione didattica" },
};

async function buildKhatmDiplomaPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = KHATM_LABELS[opts.lang] || KHATM_LABELS.fr;

  const emerald = [14, 99, 85];
  const gold = [180, 140, 45];
  const goldLight = [222, 196, 130];
  const ink = [27, 43, 41];

  // Fond ivoire discret
  doc.setFillColor(252, 249, 240);
  doc.rect(0, 0, W, H, "F");

  // Cadre premium : triple bordure dorée
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.6);
  doc.rect(7, 7, W - 14, H - 14);
  doc.setLineWidth(0.6);
  doc.rect(10.5, 10.5, W - 21, H - 21);
  doc.setDrawColor(...goldLight);
  doc.setLineWidth(0.3);
  doc.rect(13, 13, W - 26, H - 26);

  // Ornements de coin (motif géométrique discret façon étoile à 8 branches)
  const drawCornerOrnament = (cx, cy) => {
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.5);
    doc.circle(cx, cy, 2.2, "S");
    doc.circle(cx, cy, 4.2, "S");
  };
  drawCornerOrnament(20, 20);
  drawCornerOrnament(W - 20, 20);
  drawCornerOrnament(20, H - 20);
  drawCornerOrnament(W - 20, H - 20);

  // Logo
  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", W / 2 - 12, 17, 24, 24);

  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 48, { align: "center" });

  // Titre prestigieux
  doc.setTextColor(...gold);
  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.text(L.title, W / 2, 63, { align: "center" });

  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 45, 68, W / 2 + 45, 68);

  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(13);
  doc.text(L.subtitle, W / 2, 77, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(L.of, W / 2, 92, { align: "center" });

  doc.setFont("times", "bolditalic");
  doc.setFontSize(26);
  doc.setTextColor(...emerald);
  doc.text(opts.studentName, W / 2, 105, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(11.5);
  doc.setTextColor(...ink);
  const bodyLines = doc.splitTextToSize(L.body(opts.studentName), W - 90);
  doc.text(bodyLines, W / 2, 118, { align: "center" });

  // Pied de page
  doc.setFontSize(10);
  doc.text(`${t("deliveredOn")} : ${opts.issuedAtLabel}`, 24, H - 20);
  doc.text(L.signature, W - 24, H - 20, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(140, 130, 100);
  doc.text(`${t("certNumber")} : ${opts.certNumber}`, W / 2, H - 12, { align: "center" });

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

async function createKhatmDiploma(lang) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );

  const { dataUrl } = await buildKhatmDiplomaPdf({ studentName, lang, certNumber, issuedAtLabel });

  const diploma = {
    id: certNumber,
    studentId: STATE.activeStudentId,
    levelId: "khatm",
    levelTitle: KHATM_LABELS.fr.title,
    category: "khatm",
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

function downloadFile(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareFile(dataUrl, filename, title) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
  } catch (e) { /* fall through to download */ }
  downloadFile(dataUrl, filename);
  return false;
}

function downloadDiploma(diploma) {
  downloadFile(diploma.pdfDataUrl, `Diplome_${diploma.levelId}_${diploma.certNumber}.pdf`);
}

async function shareDiploma(diploma) {
  return shareFile(diploma.pdfDataUrl, `Diplome_${diploma.certNumber}.pdf`, diploma.levelTitle);
}

// =============================================================================
// BULLETINS D'ÉVALUATION — à présenter aux parents. Deux formats :
//  - "cumulative" : toutes les séances débloquées à ce jour (une ligne par
//    séance, un statut par matière)
//  - "session" : le détail d'une seule séance
// =============================================================================

const BULLETIN_LABELS = {
  fr: {
    title: "BULLETIN D'ÉVALUATION",
    cumulativeSubtitle: "Bulletin complet — toutes séances suivies",
    sessionSubtitle: (n) => `Bulletin — ${n}`,
    student: "Élève", generatedOn: "Établi le",
    session_col: "Séance", status_col: "Statut",
    yes: "Acquis", no: "En cours",
    validated: "Séance validée", inProgress: "Séance en cours",
    comment: "Appréciation de l'enseignante",
    signature: "Seyda Zeynab Academy — Signature de l'enseignante",
    overallProgress: "Progression globale",
  },
  en: {
    title: "EVALUATION REPORT",
    cumulativeSubtitle: "Full report — all sessions so far",
    sessionSubtitle: (n) => `Report — ${n}`,
    student: "Student", generatedOn: "Issued on",
    session_col: "Session", status_col: "Status",
    yes: "Acquired", no: "In progress",
    validated: "Session validated", inProgress: "Session in progress",
    comment: "Teacher's comment",
    signature: "Seyda Zeynab Academy — Teacher's signature",
    overallProgress: "Overall progress",
  },
  it: {
    title: "SCHEDA DI VALUTAZIONE",
    cumulativeSubtitle: "Scheda completa — tutte le sessioni finora",
    sessionSubtitle: (n) => `Scheda — ${n}`,
    student: "Studente", generatedOn: "Rilasciata il",
    session_col: "Sessione", status_col: "Stato",
    yes: "Acquisito", no: "In corso",
    validated: "Sessione convalidata", inProgress: "Sessione in corso",
    comment: "Commento dell'insegnante",
    signature: "Seyda Zeynab Academy — Firma dell'insegnante",
    overallProgress: "Progresso complessivo",
  },
};

/**
 * @param {object} opts
 *  type: "cumulative" | "session"
 *  studentName, lang, generatedAtLabel, comment
 *  rows: [{ sessionTitle, subjectDone: [bool,bool,bool,bool,bool], validated }]
 */
async function buildBulletinPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = BULLETIN_LABELS[opts.lang] || BULLETIN_LABELS.fr;

  const emerald = [14, 99, 85];
  const gold = [200, 155, 60];
  const ink = [27, 43, 41];
  const inkSoft = [110, 118, 114];
  const marginX = 14;

  doc.setFillColor(250, 246, 238);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, W - 12, H - 12);

  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", W / 2 - 8, 10, 16, 16);

  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 30, { align: "center" });

  doc.setTextColor(...gold);
  doc.setFontSize(18);
  doc.text(L.title, W / 2, 39, { align: "center" });

  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(11);
  const subtitle = opts.type === "cumulative" ? L.cumulativeSubtitle : L.sessionSubtitle(opts.rows[0]?.sessionTitle || "");
  doc.text(subtitle, W / 2, 46, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.text(`${L.student} : ${opts.studentName}`, marginX, 58);
  doc.text(`${L.generatedOn} : ${opts.generatedAtLabel}`, W - marginX, 58, { align: "right" });

  if (opts.type === "cumulative") {
    const totalSessions = opts.rows.length;
    const validatedCount = opts.rows.filter((r) => r.validated).length;
    doc.setTextColor(...inkSoft);
    doc.setFontSize(9.5);
    doc.text(`${L.overallProgress} : ${validatedCount}/${totalSessions}`, marginX, 64);
  }

  // ---- Tableau ----
  const tableTop = 72;
  const colWidths = [40, 21, 21, 21, 21, 24, 32];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableX = (W - tableWidth) / 2;
  const colX = [];
  let cx = tableX;
  colWidths.forEach((w) => { colX.push(cx); cx += w; });

  const headers = [L.session_col, "📖", "🌿", "📚", "📝", "🎯", L.status_col];
  const headerLabels = [L.session_col, "Coran", "Athkars", "Fiqh", "Exer.", "Éval.", L.status_col];

  let y = tableTop;
  doc.setFillColor(...emerald);
  doc.rect(tableX, y - 5, tableWidth, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(8.5);
  headerLabels.forEach((h, i) => {
    doc.text(h, colX[i] + colWidths[i] / 2, y, { align: "center" });
  });
  y += 7;

  doc.setFont("times", "normal");
  doc.setFontSize(9);
  opts.rows.forEach((row, idx) => {
    const rowH = 8;
    if (idx % 2 === 1) {
      doc.setFillColor(240, 233, 216);
      doc.rect(tableX, y - 5, tableWidth, rowH, "F");
    }
    doc.setTextColor(...ink);
    doc.text(row.sessionTitle, colX[0] + 3, y);
    row.subjectDone.forEach((done, i) => {
      doc.setTextColor(...(done ? emerald : inkSoft));
      doc.text(done ? L.yes : L.no, colX[i + 1] + colWidths[i + 1] / 2, y, { align: "center" });
    });
    doc.setTextColor(...(row.validated ? emerald : gold));
    doc.setFont("times", "bold");
    doc.text(row.validated ? L.validated : L.inProgress, colX[6] + colWidths[6] / 2, y, { align: "center" });
    doc.setFont("times", "normal");
    y += rowH;
  });
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  doc.line(tableX, y - 3, tableX + tableWidth, y - 3);

  // ---- Commentaire ----
  y += 12;
  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text(L.comment, marginX, y);
  y += 7;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  const commentBoxHeight = 34;
  doc.rect(marginX, y - 5, W - marginX * 2, commentBoxHeight);
  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  if (opts.comment) {
    const lines = doc.splitTextToSize(opts.comment, W - marginX * 2 - 8);
    doc.text(lines, marginX + 4, y + 3);
  }

  // ---- Pied de page ----
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text(L.signature, W / 2, H - 18, { align: "center" });

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

/**
 * Construit les données de lignes du tableau pour un bulletin, à partir de
 * l'état de progression courant (STATE). type = "cumulative" ou "session".
 */
async function generateBulletin(type, sessionId, lang, comment) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const issuedAtLabel = new Date().toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );

  let rows = [];
  if (type === "cumulative") {
    const reachable = SESSIONS.filter((s) => !sessionLocked(s.id));
    rows = reachable.map((s) => ({
      sessionTitle: sessionTitle(s),
      subjectDone: SUBJECT_TABS.map((tab) => isSubjectCompleted(s.id, tab.key)),
      validated: isSessionCompleted(s.id),
    }));
  } else {
    const session = SESSIONS.find((s) => s.id === sessionId);
    rows = [{
      sessionTitle: sessionTitle(session),
      subjectDone: SUBJECT_TABS.map((tab) => isSubjectCompleted(session.id, tab.key)),
      validated: isSessionCompleted(session.id),
    }];
  }

  const { dataUrl } = await buildBulletinPdf({
    type, studentName, lang, generatedAtLabel: issuedAtLabel, comment, rows,
  });
  const filename = `Bulletin_${studentName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
  return { dataUrl, filename, studentName };
}
