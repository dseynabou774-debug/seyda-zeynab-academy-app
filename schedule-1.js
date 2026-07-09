// =============================================================================
// schedule.js — Emploi du temps professionnel : créneaux par élève,
// détection automatique des conflits, génération d'un emploi du temps
// individuel (PDF + PNG). N'affecte aucun module existant (paiements,
// diplômes, progression...) : nouveau store IndexedDB dédié ("schedule").
// =============================================================================

// Jours et matières traduits (FR/EN/IT) — suivent la langue de
// l'interface de l'enseignante (Réglages), comme le reste de l'app.
const SCHEDULE_DAY_NAMES = {
  fr: { full: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"], short: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] },
  en: { full: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], short: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  it: { full: ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"], short: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] },
  ar: { full: ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"], short: ["إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت", "أحد"] },
};
function scheduleDayName(i, lang) { return (SCHEDULE_DAY_NAMES[lang] || SCHEDULE_DAY_NAMES.fr).full[i]; }
function scheduleDayShort(i, lang) { return (SCHEDULE_DAY_NAMES[lang] || SCHEDULE_DAY_NAMES.fr).short[i]; }

// Les matières sont stockées par CLÉ (langue-neutre) dans les créneaux —
// seul l'affichage est traduit, ce qui permet de changer la langue de
// l'interface sans jamais perdre/dupliquer les données déjà enregistrées.
const SCHEDULE_SUBJECT_KEYS = ["quran", "arabicReading", "tajwid", "tafsir", "fiqh", "athkar"];
const SCHEDULE_SUBJECT_LABELS = {
  fr: { quran: "Coran", arabicReading: "Lecture arabe", tajwid: "Tajwid", tafsir: "Tafsir", fiqh: "Fiqh", athkar: "Athkar" },
  en: { quran: "Qur'an", arabicReading: "Arabic reading", tajwid: "Tajwid", tafsir: "Tafsir", fiqh: "Fiqh", athkar: "Athkar" },
  it: { quran: "Corano", arabicReading: "Lettura araba", tajwid: "Tajwid", tafsir: "Tafsir", fiqh: "Fiqh", athkar: "Athkar" },
  ar: { quran: "القرآن", arabicReading: "القراءة العربية", tajwid: "التجويد", tafsir: "التفسير", fiqh: "الفقه", athkar: "الأذكار" },
};
// Repli : si une valeur stockée ne correspond à aucune clé connue (donnée
// d'avant cette traduction), elle est affichée telle quelle sans planter.
function scheduleSubjectLabel(key, lang) {
  return (SCHEDULE_SUBJECT_LABELS[lang] || SCHEDULE_SUBJECT_LABELS.fr)[key] || key;
}

// Plage horaire de fonctionnement affichée (disponibilités) — modifiable
// ici si l'académie change ses horaires d'ouverture habituels.
const SCHEDULE_DAY_START = "08:00";
const SCHEDULE_DAY_END = "21:00";

function scheduleTimeToMinutes(hhmm) {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function scheduleMinutesToTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function scheduleDurationLabel(startTime, endTime) {
  const mins = scheduleTimeToMinutes(endTime) - scheduleTimeToMinutes(startTime);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}min`;
}

function newScheduleSlot(studentId, studentName) {
  return {
    id: newId("sched"),
    studentId, studentName,
    day: 0, startTime: "17:00", endTime: "18:00",
    subjects: [],
    paused: false,
    createdAt: Date.now(),
  };
}

// Détecte un chevauchement d'horaire avec un créneau ACTIF existant du même
// jour (les créneaux en pause n'occupent plus le planning). excludeId
// permet d'ignorer le créneau qu'on est en train de modifier lui-même.
function findScheduleConflict(allSlots, day, startTime, endTime, excludeId) {
  const s1 = scheduleTimeToMinutes(startTime), e1 = scheduleTimeToMinutes(endTime);
  if (e1 <= s1) return { invalidRange: true };
  return allSlots.find((slot) => {
    if (slot.id === excludeId) return false;
    if (slot.paused) return false;
    if (slot.day !== day) return false;
    const s2 = scheduleTimeToMinutes(slot.startTime), e2 = scheduleTimeToMinutes(slot.endTime);
    return s1 < e2 && s2 < e1;
  }) || null;
}

// Calcule, pour un jour donné, la liste ordonnée des créneaux actifs +
// les "trous" libres entre eux (dans la plage d'ouverture définie
// ci-dessus). Chaque élément a un type "busy" ou "free".
function computeDayTimeline(allSlots, day) {
  const daySlots = allSlots
    .filter((s) => s.day === day && !s.paused)
    .slice()
    .sort((a, b) => scheduleTimeToMinutes(a.startTime) - scheduleTimeToMinutes(b.startTime));

  const timeline = [];
  let cursor = scheduleTimeToMinutes(SCHEDULE_DAY_START);
  const dayEnd = scheduleTimeToMinutes(SCHEDULE_DAY_END);

  daySlots.forEach((slot) => {
    const s = scheduleTimeToMinutes(slot.startTime), e = scheduleTimeToMinutes(slot.endTime);
    if (s > cursor) timeline.push({ type: "free", start: scheduleMinutesToTime(cursor), end: scheduleMinutesToTime(s) });
    timeline.push({ type: "busy", start: slot.startTime, end: slot.endTime, slot });
    cursor = Math.max(cursor, e);
  });
  if (cursor < dayEnd) timeline.push({ type: "free", start: scheduleMinutesToTime(cursor), end: scheduleMinutesToTime(dayEnd) });
  return timeline;
}

// Statistiques globales de la semaine (heures réservées, créneaux occupés,
// heures encore libres dans la plage d'ouverture).
function computeScheduleStats(allSlots) {
  const active = allSlots.filter((s) => !s.paused);
  let busyMinutes = 0;
  active.forEach((s) => { busyMinutes += scheduleTimeToMinutes(s.endTime) - scheduleTimeToMinutes(s.startTime); });
  const openMinutesPerDay = scheduleTimeToMinutes(SCHEDULE_DAY_END) - scheduleTimeToMinutes(SCHEDULE_DAY_START);
  const totalOpenMinutes = openMinutesPerDay * 7;
  const freeMinutes = Math.max(0, totalOpenMinutes - busyMinutes);
  return {
    occupiedCount: active.length,
    busyHours: Math.round((busyMinutes / 60) * 10) / 10,
    freeHours: Math.round((freeMinutes / 60) * 10) / 10,
  };
}

// -----------------------------------------------------------------------
// Génération de l'emploi du temps individuel (PDF + PNG), design assorti
// au reste des documents de l'académie (parchemin crème, cadre doré/
// émeraude, logo, QR non nécessaire ici).
// -----------------------------------------------------------------------
// Un créneau "familial" concerne plusieurs élèves à la fois (slot.studentIds).
// Pour un élève donné, on retrouve son créneau qu'il soit l'élève principal
// (studentId) OU l'un des membres (studentIds) d'un créneau familial.
function studentWeeklySlots(allSlots, studentId) {
  return allSlots
    .filter((s) => !s.paused && (s.studentId === studentId || (s.studentIds || []).includes(studentId)))
    .slice()
    .sort((a, b) => a.day - b.day || scheduleTimeToMinutes(a.startTime) - scheduleTimeToMinutes(b.startTime));
}

// Liste, pour chaque jour, les plages horaires ENCORE LIBRES (dans la
// plage d'ouverture définie) — pour proposer ces créneaux aux parents.
function computeWeekFreeSlots(allSlots) {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    gaps: computeDayTimeline(allSlots, day).filter((item) => item.type === "free"),
  }));
}

async function buildStudentSchedulePdf({ studentName, slots, lang }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = SCHEDULE_LABELS[lang] || SCHEDULE_LABELS.fr;

  doc.setFillColor(251, 246, 232);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(201, 162, 39); doc.setLineWidth(1.4);
  doc.rect(8, 8, W - 16, H - 16);
  doc.setDrawColor(11, 110, 79); doc.setLineWidth(0.5);
  doc.rect(11, 11, W - 22, H - 22);

  const [logoImg] = (typeof loadReceiptImages === "function") ? await loadReceiptImages() : [null];
  if (logoImg) {
    try { doc.addImage(logoImg, "PNG", W / 2 - 12, 18, 24, 24); } catch (e) {}
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(11, 110, 79);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 48, { align: "center" });
  doc.setFontSize(20); doc.setTextColor(180, 140, 40);
  doc.text(L.title, W / 2, 58, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(20, 30, 28);
  doc.text(studentName, W / 2, 68, { align: "center" });

  let y = 82;
  doc.setFontSize(10.5);
  slots.forEach((slot) => {
    doc.setFillColor(14, 99, 85);
    doc.roundedRect(16, y - 5.5, W - 32, 16, 2, 2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
    doc.text(`${(L.days[slot.day])} · ${slot.startTime} - ${slot.endTime}`, 20, y + 1);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text((slot.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ") || "—", 20, y + 6.5);
    doc.setFontSize(10.5);
    y += 20;
  });
  if (!slots.length) {
    doc.setTextColor(107, 116, 105);
    doc.text(L.noSlots, W / 2, y, { align: "center" });
  }

  doc.setFontSize(9); doc.setTextColor(107, 116, 105);
  doc.text(`${L.generatedOn} : ${new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR")}`, 16, H - 14);

  const dataUrl = doc.output("datauristring");
  return { dataUrl };
}

async function buildStudentScheduleImage({ studentName, slots, lang }) {
  const L = SCHEDULE_LABELS[lang] || SCHEDULE_LABELS.fr;
  const [logoImg] = (typeof loadReceiptImages === "function") ? await loadReceiptImages() : [null];

  const canvas = document.createElement("canvas");
  const rowH = 90;
  canvas.width = 1000;
  canvas.height = 480 + Math.max(1, slots.length) * rowH;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = "#FBF6E8"; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 6; ctx.strokeStyle = "#C9A227"; ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.lineWidth = 2; ctx.strokeStyle = "#0B6E4F"; ctx.strokeRect(34, 34, W - 68, H - 68);

  ctx.textAlign = "center";
  let y = 110;
  if (logoImg) {
    const lw = 80, lh = 80 * ((logoImg.naturalHeight || 1) / (logoImg.naturalWidth || 1));
    ctx.drawImage(logoImg, W / 2 - lw / 2, y - lh, lw, lh);
  }
  y += 40;
  ctx.font = "bold 22px Georgia, serif"; ctx.fillStyle = "#0B6E4F";
  ctx.fillText("SEYDA ZEYNAB ACADEMY", W / 2, y);
  y += 46;
  ctx.font = "bold 40px Georgia, serif"; ctx.fillStyle = "#B48C28";
  ctx.fillText(L.title, W / 2, y);
  y += 40;
  ctx.font = "26px Georgia, serif"; ctx.fillStyle = "#12281f";
  ctx.fillText(studentName, W / 2, y);
  y += 50;

  if (!slots.length) {
    ctx.font = "18px Georgia, serif"; ctx.fillStyle = "#6B7469";
    ctx.fillText(L.noSlots, W / 2, y + 20);
  }
  slots.forEach((slot) => {
    ctx.fillStyle = "#0E6355";
    roundRectPath(ctx, 60, y, W - 120, rowH - 16, 14);
    ctx.fill();
    ctx.textAlign = "left"; ctx.fillStyle = "#fff";
    ctx.font = "bold 22px Georgia, serif";
    ctx.fillText(`${L.days[slot.day]} · ${slot.startTime} - ${slot.endTime}`, 84, y + 32);
    ctx.font = "16px Georgia, serif";
    ctx.fillText((slot.subjects || []).map((k) => scheduleSubjectLabel(k, lang)).join(", ") || "—", 84, y + 58);
    ctx.textAlign = "center";
    y += rowH;
  });

  ctx.textAlign = "left"; ctx.font = "13px Georgia, serif"; ctx.fillStyle = "#6B7469";
  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR");
  ctx.fillText(`${L.generatedOn} : ${dateLabel}`, 60, H - 50);

  return canvas.toDataURL("image/png");
}

const SCHEDULE_LABELS = {
  fr: { title: "Emploi du temps", generatedOn: "Généré le", noSlots: "Aucun créneau actif pour le moment.", days: SCHEDULE_DAY_NAMES.fr.full,
    freeTitle: "Créneaux disponibles", noFreeSlots: "Aucun créneau libre ce jour.", freeIntro: "Voici les créneaux encore disponibles. N'hésitez pas à nous indiquer celui qui vous arrange." },
  en: { title: "Class Schedule", generatedOn: "Generated on", noSlots: "No active time slot yet.", days: SCHEDULE_DAY_NAMES.en.full,
    freeTitle: "Available Time Slots", noFreeSlots: "No free slot this day.", freeIntro: "Here are the slots still available. Feel free to let us know which one suits you." },
  it: { title: "Orario delle lezioni", generatedOn: "Generato il", noSlots: "Nessun orario attivo per il momento.", days: SCHEDULE_DAY_NAMES.it.full,
    freeTitle: "Orari disponibili", noFreeSlots: "Nessun orario libero questo giorno.", freeIntro: "Ecco gli orari ancora disponibili. Non esitate a indicarci quello più adatto a voi." },
  ar: { title: "جدول الحصص", generatedOn: "تاريخ الإصدار", noSlots: "لا يوجد حصص نشطة حاليًا.", days: SCHEDULE_DAY_NAMES.ar.full,
    freeTitle: "الأوقات المتاحة", noFreeSlots: "لا يوجد وقت متاح هذا اليوم.", freeIntro: "فيما يلي الأوقات المتاحة حاليًا. لا تترددوا في إخبارنا بالوقت الذي يناسبكم." },
};

// -----------------------------------------------------------------------
// Document "Créneaux disponibles" — vue d'ensemble des heures LIBRES,
// à envoyer aux parents pour qu'ils choisissent eux-mêmes un horaire.
// Disponible en 4 langues (FR/EN/IT/AR).
// NOTE HONNÊTE : pour l'arabe, la version PDF (bibliothèque jsPDF) ne
// sait pas façonner correctement les lettres arabes liées entre elles
// (limite technique de cette bibliothèque, déjà rencontrée ailleurs dans
// l'app). La version PNG, elle, s'affiche parfaitement en arabe (rendu
// via le navigateur). Pour un envoi en arabe, préférez donc le PNG.
// -----------------------------------------------------------------------
async function buildFreeSlotsPdf({ lang }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = SCHEDULE_LABELS[lang] || SCHEDULE_LABELS.fr;
  const rtl = lang === "ar";
  const align = rtl ? "right" : "center";
  const x = rtl ? W - 16 : W / 2;

  doc.setFillColor(251, 246, 232);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(201, 162, 39); doc.setLineWidth(1.4);
  doc.rect(8, 8, W - 16, H - 16);
  doc.setDrawColor(11, 110, 79); doc.setLineWidth(0.5);
  doc.rect(11, 11, W - 22, H - 22);

  const [logoImg] = (typeof loadReceiptImages === "function") ? await loadReceiptImages() : [null];
  if (logoImg) { try { doc.addImage(logoImg, "PNG", W / 2 - 12, 18, 24, 24); } catch (e) {} }

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(11, 110, 79);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 48, { align: "center" });
  doc.setFontSize(19); doc.setTextColor(180, 140, 40);
  doc.text(L.freeTitle, W / 2, 58, { align: "center" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(70, 78, 70);
  const introLines = doc.splitTextToSize(L.freeIntro, W - 40);
  doc.text(introLines, W / 2, 66, { align: "center" });

  let y = 66 + introLines.length * 4.5 + 8;
  const weekFree = computeWeekFreeSlots(STATE.scheduleSlots || []);
  weekFree.forEach(({ day, gaps }) => {
    doc.setFillColor(14, 99, 85);
    doc.roundedRect(16, y - 5, W - 32, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
    doc.text(L.days[day], align === "right" ? W - 20 : 20, y, { align: rtl ? "right" : "left" });
    y += 9;
    doc.setTextColor(20, 30, 28); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    if (!gaps.length) {
      doc.text(L.noFreeSlots, 20, y);
      y += 7;
    } else {
      gaps.forEach((g) => {
        doc.text(`🟢 ${g.start} - ${g.end}`, 20, y);
        y += 7;
      });
    }
    y += 3;
  });

  doc.setFontSize(9); doc.setTextColor(107, 116, 105);
  doc.text(`${L.generatedOn} : ${new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : lang === "ar" ? "ar-SA" : "fr-FR")}`, 16, H - 14);

  return { dataUrl: doc.output("datauristring") };
}

async function buildFreeSlotsImage({ lang }) {
  const L = SCHEDULE_LABELS[lang] || SCHEDULE_LABELS.fr;
  const rtl = lang === "ar";
  const [logoImg] = (typeof loadReceiptImages === "function") ? await loadReceiptImages() : [null];
  const weekFree = computeWeekFreeSlots(STATE.scheduleSlots || []);

  const rowH = 46;
  const totalRows = weekFree.reduce((n, d) => n + Math.max(1, d.gaps.length) + 1, 0);
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 420 + totalRows * rowH;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = "#FBF6E8"; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 6; ctx.strokeStyle = "#C9A227"; ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.lineWidth = 2; ctx.strokeStyle = "#0B6E4F"; ctx.strokeRect(34, 34, W - 68, H - 68);

  ctx.textAlign = "center";
  let y = 110;
  if (logoImg) {
    const lw = 80, lh = 80 * ((logoImg.naturalHeight || 1) / (logoImg.naturalWidth || 1));
    ctx.drawImage(logoImg, W / 2 - lw / 2, y - lh, lw, lh);
  }
  y += 40;
  ctx.font = "bold 22px Georgia, serif"; ctx.fillStyle = "#0B6E4F";
  ctx.fillText("SEYDA ZEYNAB ACADEMY", W / 2, y);
  y += 44;
  ctx.font = "bold 34px Georgia, serif"; ctx.fillStyle = "#B48C28";
  ctx.fillText(L.freeTitle, W / 2, y);
  y += 36;
  ctx.font = `16px ${rtl ? "'Amiri', serif" : "Georgia, serif"}`; ctx.fillStyle = "#464E46";
  const words = L.freeIntro.split(" ");
  let line = "", introY = y;
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > W - 160 && line) { ctx.fillText(line, W / 2, introY); introY += 22; line = w; }
    else line = test;
  });
  if (line) { ctx.fillText(line, W / 2, introY); introY += 22; }
  y = introY + 20;

  weekFree.forEach(({ day, gaps }) => {
    ctx.fillStyle = "#0E6355";
    roundRectPath(ctx, 60, y, W - 120, 34, 10);
    ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `bold 18px ${rtl ? "'Amiri', serif" : "Georgia, serif"}`;
    ctx.fillText(L.days[day], W / 2, y + 23);
    y += 44;
    ctx.font = `16px ${rtl ? "'Amiri', serif" : "Georgia, serif"}`; ctx.fillStyle = "#12281f";
    if (!gaps.length) {
      ctx.fillText(L.noFreeSlots, W / 2, y);
      y += rowH;
    } else {
      gaps.forEach((g) => {
        ctx.fillText(`🟢 ${g.start} - ${g.end}`, W / 2, y);
        y += rowH;
      });
    }
  });

  ctx.textAlign = "left"; ctx.font = "13px Georgia, serif"; ctx.fillStyle = "#6B7469";
  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : lang === "ar" ? "ar-SA" : "fr-FR");
  ctx.fillText(`${L.generatedOn} : ${dateLabel}`, 60, H - 50);

  return canvas.toDataURL("image/png");
}
